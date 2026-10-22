import { expect, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { openFurtherCards } from '../support/further-cards'
import { testPayload } from '../support/payload-test'

/**
 * The panels of the networks and of the contact details (tickets 125 and 126; plan 02 U28, E30,
 * E31): « @pseudo » saved as the address, a refusal under the field with no request, a failure that
 * changes nothing, and a choice to show the contact details that the public page follows. All
 * made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${200 + (++counter % 50)}` })
)

type Artist = TestAccount<'maquilleuse'>

const PHONE = '06 39 98 12 34'

async function artist(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	await context.addCookies(account.session.cookies)
	await modifySheet(account, { firstName: 'Léa', lastName: 'Fictive', specialty: 'Maquillage mariée' })
	return account
}

async function modifySheet(compte: Artist, data: Record<string, unknown>) {
	const payload = await testPayload()
	await payload.update({ collection: 'profiles', id: (await sheetOf(compte)).id, data })
}

async function sheetOf(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return sheet
}

test.describe('125 : les réseaux', { tag: '@mobile' }, () => {
	test('U28 : « @pseudo » est rangé comme l’adresse complète, et la valeur est stockée', async ({ context, page }) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)

		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.getByLabel('Instagram').fill('@studio.fictif')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes réseaux sont enregistrés.' })).toBeVisible()
		await expect(page.getByTestId('carte-reseaux')).toContainText('https://www.instagram.com/studio.fictif')
		expect((await sheetOf(account)).networks?.instagram).toBe('https://www.instagram.com/studio.fictif')
		expect(await violationsSevere(page)).toEqual([])
	})

	test('E30 : l’adresse d’un autre site est refusée sous le champ, sans requête', async ({ context, page }) => {
		const account = await artist(context)
		const uploads: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') uploads.push(requete.url())
		})
		await page.goto('/auth/profil')
		await openFurtherCards(page)

		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.getByLabel('Instagram').fill('https://www.facebook.com/studio.fictif')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByText('Cette adresse n’est pas celle d’Instagram')).toBeVisible()
		expect(uploads).toHaveLength(0)
		expect((await sheetOf(account)).networks?.instagram ?? null).toBeNull()
	})

	test('E31 : vider un champ retire le réseau ; un échec du serveur laisse l’ancienne valeur et le dit', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await modifySheet(account, { networks: { instagram: 'https://www.instagram.com/studio.fictif' } })
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await page.getByRole('button', { name: 'Modifier mes réseaux' }).click()
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Instagram').fill('')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByTestId('carte-reseaux')).toContainText('instagram.com/studio.fictif')
		expect((await sheetOf(account)).networks?.instagram).toBe('https://www.instagram.com/studio.fictif')

		await page.unroute('**/auth/profil')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-reseaux')).toContainText('à compléter')
		expect((await sheetOf(account)).networks?.instagram ?? null).toBeNull()
	})
})

test.describe('126 : les coordonnées', { tag: '@mobile' }, () => {
	test('E30 : un téléphone invalide a son message sous le champ, sans requête', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)

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
		const account = await artist(context)
		const slug = (await sheetOf(account)).slug
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Non')

		await page.getByRole('button', { name: 'Modifier mes coordonnées' }).click()
		await page.getByLabel('Téléphone', { exact: true }).fill(PHONE)
		await page.getByLabel('Afficher mon téléphone et mon email sur mon profil').check()
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'elles s’affichent sur ton profil' })).toBeVisible()
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Oui, depuis le')
		expect(typeof (await sheetOf(account)).consentedAt).toBe('string')
		const shown = await page.context().request.get(`/profil/${slug}`)
		expect(await shown.text()).toContain('tel:0639981234')

		await page.getByRole('button', { name: 'Modifier mes coordonnées' }).click()
		await page.getByLabel('Afficher mon téléphone et mon email sur mon profil').uncheck()
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('carte-coordonnees')).toContainText('Non')
		expect((await sheetOf(account)).consentedAt ?? null).toBeNull()
		await expect
			.poll(async () => (await (await page.context().request.get(`/profil/${slug}`)).text()).includes('39 98'))
			.toBe(false)
	})
})
