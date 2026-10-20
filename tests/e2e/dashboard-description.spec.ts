import { expect, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * The description in her space (ticket 122; plan 02 E19-E29 description, E31, U05, U27): written,
 * saved for real with its line breaks, counted against 200, bounded at 2 000, HTML removed, and
 * a server failure that keeps the old text and says so. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${200 + (++counter % 50)}` })
)

type Artist = TestAccount<'maquilleuse'>

async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	description?: string
): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: { firstName: 'Léa', lastName: 'Fictive', ...(description === undefined ? {} : { description }) },
	})
	await context.addCookies(account.session.cookies)
	return account
}

async function storedDescription(compte: Artist): Promise<string> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	return docs[0]?.description ?? ''
}

const modify = (page: Page) => page.getByRole('button', { name: 'Modifier ma description' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier ma description' })

async function open(page: Page) {
	if (test.info().project.name === 'mobile') await modify(page).tap()
	else await modify(page).click()
	await expect(dialogue(page)).toBeVisible()
}

test.describe('122 : la description', { tag: '@mobile' }, () => {
	test('E19 : écrire, enregistrer, recharger : le texte est stocké avec ses sauts de ligne', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-description')).toContainText('à compléter')
		await open(page)

		await page.getByLabel('Ta description').fill('Maquilleuse de mariée.\n\nJe me déplace dans toute la région.')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Ta description est enregistrée.' })).toBeVisible()
		await expect(modify(page)).toBeFocused()
		await expect(page.getByTestId('carte-description')).toContainText('Je me déplace dans toute la région.')
		expect(await storedDescription(account)).toBe('Maquilleuse de mariée.\n\nJe me déplace dans toute la région.')

		await page.reload()
		const card = page.getByTestId('carte-description')
		await expect(card).toContainText('Maquilleuse de mariée.')
		// The line breaks are shown, not folded: three lines high at least (two texts and a blank line).
		const heights = await card.locator('span.whitespace-pre-line').evaluate(el => ({
			ligne: Number.parseFloat(getComputedStyle(el).lineHeight),
			hauteur: el.getBoundingClientRect().height,
		}))
		expect(heights.hauteur).toBeGreaterThanOrEqual(heights.ligne * 2.5)
	})

	test('U05 : le compteur passe de 199 à 200 et annonce le seuil', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Ta description').fill('a'.repeat(199))
		await expect(page.getByTestId('compteur-description')).toContainText('199 / 200 caractères')
		await expect(dialogue(page).getByRole('status')).toHaveText('')

		await page.getByLabel('Ta description').fill(`${'a'.repeat(199)}b`)
		await expect(page.getByTestId('compteur-description')).toContainText('200 / 200 caractères')
		await expect(dialogue(page).getByRole('status')).toContainText('publiable')
		expect(await violationsSevere(page)).toEqual([])
	})

	test('U27 : 2 001 caractères refusés sans requête ; le HTML collé est retiré', async ({ context, page }) => {
		const account = await artist(context, 'Ancien texte')
		const uploads: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') uploads.push(requete.url())
		})
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Ta description').fill('a'.repeat(2001))
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByText('Ta description ne doit pas dépasser 2000 caractères.')).toBeVisible()
		expect(uploads).toHaveLength(0)
		expect(await storedDescription(account)).toBe('Ancien texte')

		await page.getByLabel('Ta description').fill('<b>Bonjour</b>\n<script>alert(1)</script>à toutes')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-description')).toContainText('Bonjour')
		expect(await storedDescription(account)).toBe('Bonjour\nà toutes')
		expect(uploads).toHaveLength(1)
	})

	test('E31 : un échec du serveur laisse l’ancien texte et le dit', async ({ context, page }) => {
		const account = await artist(context, 'Ancien texte')
		await page.goto('/auth/profil')
		await open(page)
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Ta description').fill('Nouveau texte')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByLabel('Ta description')).toHaveValue('Nouveau texte')
		await expect(page.getByTestId('carte-description')).toContainText('Ancien texte')
		expect(await storedDescription(account)).toBe('Ancien texte')
		await expect(page.getByRole('status').filter({ hasText: 'enregistrée' })).toHaveCount(0)

		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) await page.screenshot({ path: `${folder}/description-${test.info().project.name}.png` })
	})
})
