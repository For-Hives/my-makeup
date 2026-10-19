import { expect, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The panels of the languages and of the skills (tickets 127 and 128; plan 02 E30, E31): Enter
 * adds a chip, a duplicate is refused out loud, a removal keeps the focus in the panel and is
 * announced, the list and its order are stored, a name beyond 70 characters sends nothing, a
 * failure of the server changes nothing. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++compteur % 50)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

async function maquilleuse(context: {
	addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void>
}): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	await context.addCookies(compte.session.cookies)
	await modifierLaFiche(compte, { firstName: 'Léa', lastName: 'Fictive', specialty: 'Maquillage mariée' })
	return compte
}

async function ficheDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return fiche
}

async function modifierLaFiche(compte: Maquilleuse, data: Record<string, unknown>) {
	const payload = await payloadDeTest()
	await payload.update({ collection: 'profiles', id: (await ficheDe(compte)).id, data })
}

test.describe('127 : les langues', { tag: '@mobile' }, () => {
	test('Entrée ajoute, un doublon est refusé à voix haute, le retrait garde le focus dans le panneau, et la liste est stockée', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await modifierLaFiche(compte, { langues: [{ nom: 'Français' }, { nom: 'Anglais' }] })
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes langues' }).click()
		const champ = page.getByLabel('Langue', { exact: true })
		await champ.pressSequentially('Espagnol')
		await champ.press('Enter')
		await expect(page.getByRole('button', { name: 'Retirer Espagnol' })).toBeVisible()
		await expect(champ).toBeFocused()

		await champ.pressSequentially('anglais')
		await champ.press('Enter')
		await expect(page.getByRole('alert').filter({ hasText: 'Cette langue est déjà dans ta liste.' })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Retirer/ })).toHaveCount(3)

		await page.getByRole('button', { name: 'Retirer Anglais' }).press('Enter')
		await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Langue Anglais retirée')
		await expect(page.getByRole('button', { name: 'Retirer Espagnol' })).toBeFocused()
		expect(await violationsGraves(page)).toEqual([])
		// The refused name is still in the field: it would be added at the save.
		await champ.fill('')
		if (process.env.CAPTURE_PUCES)
			await page.screenshot({ path: `${process.env.CAPTURE_PUCES}-${test.info().project.name}.png` })

		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes langues sont enregistrées.' })).toBeVisible()
		await expect(page.getByTestId('carte-langues')).toContainText('Espagnol')
		expect(((await ficheDe(compte)).langues ?? []).map(({ nom }) => nom)).toEqual(['Français', 'Espagnol'])
	})

	test('E31 : un échec du serveur laisse l’ancienne liste, garde ce qui a été fait, et le dit', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await modifierLaFiche(compte, { langues: [{ nom: 'Français' }] })
		await page.goto('/auth/profil')
		await page.getByRole('button', { name: 'Modifier mes langues' }).click()
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Langue', { exact: true }).fill('Russe;')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Retirer Russe' })).toBeVisible()
		await expect(page.getByRole('dialog')).toBeVisible()
		expect(((await ficheDe(compte)).langues ?? []).map(({ nom }) => nom)).toEqual(['Français'])
	})
})

test.describe('128 : les compétences', { tag: '@mobile' }, () => {
	test('E30 : un nom de plus de 70 caractères est refusé sans requête, et la liste enregistrée garde sa description', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await modifierLaFiche(compte, { competences: [{ nom: 'Teint', description: 'Peaux mates.' }] })
		const envois: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') envois.push(requete.url())
		})
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes compétences' }).click()
		const champ = page.getByLabel('Compétence', { exact: true })
		await champ.fill('x'.repeat(71))
		await champ.press('Enter')
		await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
		expect(envois).toHaveLength(0)

		await champ.fill('Yeux')
		await champ.press('Enter')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-competences')).toContainText('Yeux')
		const stockees = (await ficheDe(compte)).competences ?? []
		expect(stockees.map(({ nom, description }) => [nom, description ?? null])).toEqual([
			['Teint', 'Peaux mates.'],
			['Yeux', null],
		])
	})
})
