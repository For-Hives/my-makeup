import { expect, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * « Aperçu » (ticket 139, moved to the bar of her page by issue 1022; plan 02 RG-06): a link that works at 390, 1024 and 1440 px,
 * a preview with the content of the public page, a banner that says where the profile stands, and a
 * page that is private and not indexed. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${60 + (++counter % 150)}` })
)

type Artist = TestAccount<'maquilleuse'>

const FULL = {
	firstName: 'Léa',
	lastName: 'Aperçu',
	specialty: 'Maquillage mariée',
	description: 'Je maquille pour les mariages.',
	skills: [{ name: 'Teint lumineux' }],
	languages: [{ name: 'Français' }],
}

async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	profil: Record<string, unknown>
): Promise<{ compte: Artist; slug: string }> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({ collection: 'profiles', id: sheet.id, data: profil })
	await context.addCookies(account.session.cookies)
	return { compte: account, slug: (await payload.findByID({ collection: 'profiles', id: sheet.id, depth: 0 })).slug }
}

const overflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('139 : voir mon profil public', { tag: '@mobile' }, () => {
	test('RG-06 : « Aperçu » est visible, cliquable à 390, 1024 et 1440 px, et mène à l’aperçu', async ({
		context,
		page,
	}) => {
		await artist(context, FULL)
		for (const width of [390, 1024, 1440]) {
			await page.setViewportSize({ width: width, height: 900 })
			await page.goto('/auth/profil')
			const link = page.getByTestId('mode-apercu')
			await expect(link).toBeVisible()
			const mailbox = await link.boundingBox()
			expect(mailbox?.height ?? 0, `hauteur du lien à ${width} px`).toBeGreaterThanOrEqual(44)
			expect(await overflow(page), `débordement à ${width} px`).toBeLessThanOrEqual(0)
			await link.click()
			await expect(page).toHaveURL(/\/auth\/profil\?mode=preview$/)
			await expect(page.getByRole('heading', { level: 1, name: 'Léa Aperçu' })).toBeVisible()
			expect(await overflow(page), `débordement de l’aperçu à ${width} px`).toBeLessThanOrEqual(0)
		}
	})

	test('profil complet : le même contenu que la page publique, privé et noindex', async ({
		context,
		page,
		request,
	}) => {
		const { slug } = await artist(context, FULL)
		await page.goto('/auth/profil?mode=preview')
		const banner = page.getByTestId('bandeau-apercu')
		await expect(banner).toHaveAttribute('data-etat', 'non-publiable')

		const publicValue = await request.get(`/profil/${slug}`)
		expect(publicValue.status()).toBe(200)
		for (const text of [
			'Léa Aperçu',
			'Maquillage mariée',
			'Je maquille pour les mariages.',
			'Teint lumineux',
			'Français',
		]) {
			await expect(page.getByRole('main')).toContainText(text)
			expect(await publicValue.text()).toContain(text)
		}

		const response = await page.request.get('/auth/profil?mode=preview')
		expect(response.headers()['cache-control']).toBe('private, no-store')
		expect(response.headers()['x-robots-tag']).toContain('noindex')
		expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
		expect(await page.locator('link[rel="canonical"]').count()).toBe(0)
		expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0)
		expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('profil non listé : l’aperçu s’ouvre pour sa propriétaire, avec le bandeau', async ({
		context,
		page,
		request,
	}) => {
		const { slug } = await artist(context, { firstName: 'Zoé', lastName: 'Brouillon', available: false })
		await page.goto('/auth/profil?mode=preview')
		await expect(page.getByTestId('bandeau-apercu')).toHaveAttribute('data-etat', 'indisponible')
		await expect(page.getByRole('heading', { level: 1, name: 'Zoé Brouillon' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Modifier ma page' })).toBeVisible()
		// A visitor without a session is sent to the sign-in page, in one redirection.
		const visitor = await request.get('/auth/apercu-profil', { maxRedirects: 0 })
		expect(visitor.status()).toBe(307)
		expect(visitor.headers().location).toContain('/auth/signin?callbackUrl=%2Fauth%2Fapercu-profil')
		expect(slug).not.toBe('')
	})
})
