import { expect, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * The availability in her space (ticket 124; plan 02 E19-E29): a switch that is saved for real, a
 * card that says so, a failure that leaves the stored state, a held key that toggles once, and an
 * imported profile with no value that reads « Disponible ». All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 100)}` })
)

type Artist = TestAccount<'maquilleuse'>

async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	disponible: boolean | null = true
): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const sheet = await sheetOf(account)
	await payload.update({ collection: 'profiles', id: sheet.id, data: { firstName: 'Léa', lastName: 'Fictive' } })
	// An imported profile has no value: written under the hooks, as the import does.
	if (disponible === null)
		await payload.db.updateOne({ collection: 'profiles', id: sheet.id, data: { available: null }, returning: false })
	else await payload.update({ collection: 'profiles', id: sheet.id, data: { available: disponible } })
	await context.addCookies(account.session.cookies)
	return account
}

async function sheetOf(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return sheet
}

function followUploads(page: Page): string[] {
	const uploads: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') uploads.push(requete.url())
	})
	return uploads
}

const toggle = (page: Page) => page.getByRole('switch', { name: 'Je suis disponible' })
const card = (page: Page) => page.getByTestId('carte-disponibilite')

test.describe('124 : disponible ou indisponible', { tag: '@mobile' }, () => {
	test('E19-E29 : basculer, recharger : l’état est stocké, la carte et l’interrupteur le disent', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await expect(card(page)).toContainText('Disponible')
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'true')

		if (test.info().project.name === 'mobile') await toggle(page).tap()
		else await toggle(page).click()

		await expect(toggle(page)).toHaveAttribute('aria-checked', 'false')
		await expect(card(page)).toContainText('Pas disponible en ce moment')
		await expect(card(page)).toContainText('n’apparaît plus dans les résultats de recherche')
		await expect(page.getByRole('status').filter({ hasText: 'Tu es indisponible' })).toBeVisible()
		expect((await sheetOf(account)).available).toBe(false)

		await page.reload()
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'false')
		await expect(card(page)).toContainText('Pas disponible en ce moment')

		await toggle(page).click()
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'true')
		await expect(card(page)).not.toContainText('Pas disponible')
		expect((await sheetOf(account)).available).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('un profil importé sans valeur est affiché « Disponible »', async ({ context, page }) => {
		await artist(context, null)
		await page.goto('/auth/profil')

		await expect(card(page)).toContainText('Disponible')
		await expect(card(page)).not.toContainText('à compléter')
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'true')
	})

	test('un échec : retour à l’état enregistré, le message le dit, rien n’est stocké', async ({ context, page }) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await expect(card(page)).toContainText('Disponible')
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await toggle(page).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'true')
		await expect(card(page)).toContainText('Disponible')
		expect((await sheetOf(account)).available).toBe(true)
	})

	test('un double clic, une touche maintenue : une seule bascule', async ({ context, page }) => {
		const account = await artist(context)
		const uploads = followUploads(page)
		await page.goto('/auth/profil')
		await expect(card(page)).toContainText('Disponible')

		await toggle(page).dblclick()
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'false')
		await expect(toggle(page)).toBeEnabled()
		expect(uploads).toHaveLength(1)

		// A held Enter: the first press, then its repeats.
		await toggle(page).focus()
		await page.keyboard.down('Enter')
		for (let rank = 0; rank < 5; rank++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'true')
		await expect(toggle(page)).toBeEnabled()
		expect(uploads).toHaveLength(2)
		expect((await sheetOf(account)).available).toBe(true)
	})

	test('l’interrupteur est atteignable au clavier, assez grand pour un doigt', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await expect(card(page)).toBeVisible()

		await toggle(page).focus()
		await page.keyboard.press('Space')
		await expect(toggle(page)).toHaveAttribute('aria-checked', 'false')
		const mailbox = await toggle(page).boundingBox()
		expect(mailbox?.height ?? 0).toBeGreaterThanOrEqual(44)
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow).toBeLessThanOrEqual(0)
	})
})
