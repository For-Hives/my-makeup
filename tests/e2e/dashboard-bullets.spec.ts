import { expect, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * The panels of the languages and of the skills (tickets 127 and 128; plan 02 E30, E31): Enter
 * adds a chip, a duplicate is refused out loud, a removal keeps the focus in the panel and is
 * announced, the list and its order are stored, a name beyond 70 characters sends nothing, a
 * failure of the server changes nothing. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 50)}` })
)

type Artist = TestAccount<'maquilleuse'>

async function artist(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	await context.addCookies(account.session.cookies)
	await modifySheet(account, { firstName: 'Léa', lastName: 'Fictive', specialty: 'Maquillage mariée' })
	return account
}

async function sheetOf(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return sheet
}

async function modifySheet(compte: Artist, data: Record<string, unknown>) {
	const payload = await testPayload()
	await payload.update({ collection: 'profiles', id: (await sheetOf(compte)).id, data })
}

test.describe('127 : les langues', { tag: '@mobile' }, () => {
	test('Entrée ajoute, un doublon est refusé à voix haute, le retrait garde le focus dans le panneau, et la liste est stockée', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await modifySheet(account, { languages: [{ name: 'Français' }, { name: 'Anglais' }] })
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes langues' }).click()
		const field = page.getByLabel('Langue', { exact: true })
		await field.pressSequentially('Espagnol')
		await field.press('Enter')
		await expect(page.getByRole('button', { name: 'Retirer Espagnol' })).toBeVisible()
		await expect(field).toBeFocused()

		await field.pressSequentially('anglais')
		await field.press('Enter')
		await expect(page.getByRole('alert').filter({ hasText: 'Cette langue est déjà dans ta liste.' })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Retirer/ })).toHaveCount(3)

		await page.getByRole('button', { name: 'Retirer Anglais' }).press('Enter')
		await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Langue Anglais retirée')
		await expect(page.getByRole('button', { name: 'Retirer Espagnol' })).toBeFocused()
		expect(await violationsSevere(page)).toEqual([])
		// The refused name is still in the field: it would be added at the save.
		await field.fill('')
		if (process.env.BULLETS_SCREENSHOT)
			await page.screenshot({ path: `${process.env.BULLETS_SCREENSHOT}-${test.info().project.name}.png` })

		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes langues sont enregistrées.' })).toBeVisible()
		await expect(page.getByTestId('carte-langues')).toContainText('Espagnol')
		expect(((await sheetOf(account)).languages ?? []).map(({ name }) => name)).toEqual(['Français', 'Espagnol'])
	})

	test('E31 : un échec du serveur laisse l’ancienne liste, garde ce qui a été fait, et le dit', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await modifySheet(account, { languages: [{ name: 'Français' }] })
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
		expect(((await sheetOf(account)).languages ?? []).map(({ name }) => name)).toEqual(['Français'])
	})
})

test.describe('128 : les compétences', { tag: '@mobile' }, () => {
	test('E30 : un nom de plus de 70 caractères est refusé sans requête, et la liste enregistrée garde sa description', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await modifySheet(account, { skills: [{ name: 'Teint', description: 'Peaux mates.' }] })
		const uploads: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') uploads.push(requete.url())
		})
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes compétences' }).click()
		const field = page.getByLabel('Compétence', { exact: true })
		await field.fill('x'.repeat(71))
		await field.press('Enter')
		await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
		expect(uploads).toHaveLength(0)

		await field.fill('Yeux')
		await field.press('Enter')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-competences')).toContainText('Yeux')
		const stored = (await sheetOf(account)).skills ?? []
		expect(stored.map(({ name, description }) => [name, description ?? null])).toEqual([
			['Teint', 'Peaux mates.'],
			['Yeux', null],
		])
	})
})
