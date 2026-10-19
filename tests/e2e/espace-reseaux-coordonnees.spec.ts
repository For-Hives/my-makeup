import { expect, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The panels of the networks and of the contact details (tickets 125 and 126; plan 02 U28, E30,
 * E31): « @pseudo » saved as the address, a refusal under the field with no request, a failure that
 * changes nothing, and a choice to show the contact details that the public page follows. All
 * made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${200 + (++compteur % 50)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

const TELEPHONE = '06 39 98 12 34'

async function maquilleuse(context: {
	addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void>
}): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	await context.addCookies(compte.session.cookies)
	await modifierLaFiche(compte, { prenom: 'Léa', nom: 'Fictive', specialite: 'Maquillage mariée' })
	return compte
}

async function modifierLaFiche(compte: Maquilleuse, data: Record<string, unknown>) {
	const payload = await payloadDeTest()
	await payload.update({ collection: 'profiles', id: (await ficheDe(compte)).id, data })
}

async function ficheDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return fiche
}

test.describe('125 : les réseaux', { tag: '@mobile' }, () => {
	test('U28 : « @pseudo » est rangé comme l’adresse complète, et la valeur est stockée', async ({ context, page }) => {
		const compte = await maquilleuse(context)
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.getByLabel('Instagram').fill('@studio.fictif')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes réseaux sont enregistrés.' })).toBeVisible()
		await expect(page.getByTestId('carte-reseaux')).toContainText('https://www.instagram.com/studio.fictif')
		expect((await ficheDe(compte)).reseaux?.instagram).toBe('https://www.instagram.com/studio.fictif')
		expect(await violationsGraves(page)).toEqual([])
	})

	test('E30 : l’adresse d’un autre site est refusée sous le champ, sans requête', async ({ context, page }) => {
		const compte = await maquilleuse(context)
		const envois: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') envois.push(requete.url())
		})
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.getByLabel('Instagram').fill('https://www.facebook.com/studio.fictif')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByText('Cette adresse n’est pas celle d’Instagram')).toBeVisible()
		expect(envois).toHaveLength(0)
		expect((await ficheDe(compte)).reseaux?.instagram ?? null).toBeNull()
	})

	test('E31 : vider un champ retire le réseau ; un échec du serveur laisse l’ancienne valeur et le dit', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await modifierLaFiche(compte, { reseaux: { instagram: 'https://www.instagram.com/studio.fictif' } })
		await page.goto('/auth/profil')
		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Instagram').fill('')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByTestId('carte-reseaux')).toContainText('instagram.com/studio.fictif')
		expect((await ficheDe(compte)).reseaux?.instagram).toBe('https://www.instagram.com/studio.fictif')

		await page.unroute('**/auth/profil')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-reseaux')).toContainText('à compléter')
		expect((await ficheDe(compte)).reseaux?.instagram ?? null).toBeNull()
	})
})

test.describe('126 : les coordonnées', { tag: '@mobile' }, () => {
	test('E30 : un téléphone invalide a son message sous le champ, sans requête', async ({ context, page }) => {
		await maquilleuse(context)
		await page.goto('/auth/profil')

		await page.getByRole('button', { name: 'Modifier mes coordonnées' }).click()
		await page.getByLabel('Téléphone', { exact: true }).fill('06 ab')
		await page.getByLabel('Email de contact').fill('pas-un-email')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByText('Ce numéro n’est pas valide')).toBeVisible()
		await expect(page.getByText('Cet email n’est pas valide')).toBeVisible()
		await expect(page.getByRole('dialog')).toBeVisible()
	})

	test('afficher puis couper : la date est enregistrée, la page publique suit, puis n’a plus rien', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		const slug = (await ficheDe(compte)).slug
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Non')

		await page.getByRole('button', { name: 'Modifier mes coordonnées' }).click()
		await page.getByLabel('Téléphone', { exact: true }).fill(TELEPHONE)
		await page.getByLabel('Afficher mon téléphone et mon email sur mon profil').check()
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'elles s’affichent sur ton profil' })).toBeVisible()
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Oui, depuis le')
		expect(typeof (await ficheDe(compte)).consentiLe).toBe('string')
		const affiche = await page.context().request.get(`/profil/${slug}`)
		expect(await affiche.text()).toContain('tel:0639981234')

		await page.getByRole('button', { name: 'Modifier mes coordonnées' }).click()
		await page.getByLabel('Afficher mon téléphone et mon email sur mon profil').uncheck()
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Non')
		expect((await ficheDe(compte)).consentiLe ?? null).toBeNull()
		await expect
			.poll(async () => (await (await page.context().request.get(`/profil/${slug}`)).text()).includes('39 98'))
			.toBe(false)
	})
})
