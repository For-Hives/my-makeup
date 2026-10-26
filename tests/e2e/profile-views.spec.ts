import { expect, test } from '@playwright/test'
import { parisDayBefore } from '../../src/lib/weekly-stats'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * Ticket 1001: the daily counter of the views of a profile. A page opened in a browser counts once per
 * tab, with no cookie; her own visit counts nothing; her space shows her the numbers of the 30 days. All
 * made-up people. A real browser says « HeadlessChrome » and `navigator.webdriver`: both are what the
 * counter ignores on purpose, so the tests dress the browser as an ordinary one.
 */

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 50)}` })
)

// What a test made, taken away at its end: a published profile left behind would show in the lists of the crawl.
const made: (number | string)[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of made.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) {
			await payload.delete({ collection: 'profile-views', where: { profile: { equals: id } } }).catch(() => undefined)
			await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		}
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

async function publishedProfile() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Spécialité fictive', chosenStatus: 'published' },
	})
	const { docs: fresh } = await payload.find({
		collection: 'profiles',
		depth: 0,
		where: { id: { equals: profile.id } },
	})
	made.push(account.id)
	return { account, payload, id: profile.id, slug: fresh[0]?.slug ?? '' }
}

async function total(payloadOf: Awaited<ReturnType<typeof testPayload>>, profile: number): Promise<number> {
	const { docs } = await payloadOf.find({
		collection: 'profile-views',
		depth: 0,
		pagination: false,
		where: { profile: { equals: profile } },
	})
	return docs.reduce((sum, { count }) => sum + count, 0)
}

test.describe('1001 : compter une vue par onglet', () => {
	test.use({ userAgent: BROWSER })

	test('un onglet compte une fois malgré les rechargements, un second onglet compte encore, aucun cookie', async ({
		browser,
	}) => {
		const { payload, id, slug } = await publishedProfile()
		const open = async () => {
			const context = await browser.newContext({
				userAgent: BROWSER,
				extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.200' },
			})
			await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
			return context
		}
		const first = await open()
		const page = await first.newPage()
		const calls: string[] = []
		page.on('request', request => {
			if (request.url().includes('/api/profile-views')) calls.push(request.url())
		})
		await page.goto(`/profil/${slug}`)
		await expect.poll(() => total(payload, id)).toBe(1)
		expect(calls).toHaveLength(1)
		// The tab already told this page: a reload and a new visit send nothing.
		await page.reload({ waitUntil: 'networkidle' })
		await page.goto(`/profil/${slug}`, { waitUntil: 'networkidle' })
		expect(calls).toHaveLength(1)
		expect(await total(payload, id)).toBe(1)
		expect(await first.cookies()).toEqual([])

		const second = await open()
		await (await second.newPage()).goto(`/profil/${slug}`)
		await expect.poll(() => total(payload, id)).toBe(2)
		expect(await second.cookies()).toEqual([])
		await Promise.all([first.close(), second.close()])
	})

	test('la propriétaire qui ouvre sa propre page ne compte pas', async ({ context, page }) => {
		const { account, payload, id, slug } = await publishedProfile()
		await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
		await context.addCookies(account.session.cookies)
		const answered = page.waitForResponse(response => response.url().includes('/api/profile-views'))
		await page.goto(`/profil/${slug}`)
		// The server answers 204 all the same, and counts nothing.
		expect((await answered).status()).toBe(204)
		expect(await total(payload, id)).toBe(0)
	})
})

test.describe('1001 : ses vues dans son espace', { tag: '@mobile' }, () => {
	test('la phrase, les jours, sans débordement, sans violation grave', async ({ context, page }) => {
		const { account, payload, id } = await publishedProfile()
		const today = new Date()
		for (const [back, n] of [
			[0, 4],
			[1, 3],
			[40, 100],
		] as const) {
			// Days of the calendar, as her space counts them (a step of 24 hours shifts a day across a change of hour).
			const day = parisDayBefore(today, back)
			await payload.create({ collection: 'profile-views', data: { profile: id, day, count: n } })
		}
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		await expect(page.getByTestId('mes-vues-phrase')).toHaveText('Ta page a été vue 7 fois ces 30 derniers jours.')
		const summary = page.getByTestId('mes-vues').locator('summary')
		const box = await summary.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		await summary.click()
		await expect(page.getByTestId('mes-vues-jours').locator('li')).toHaveCount(30)
		await page.getByTestId('mes-vues').screenshot({ path: test.info().outputPath('mes-vues.png') })
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('un profil qui n’est pas publié n’affiche pas la carte', async ({ context, page }) => {
		const account = await createAccount('maquilleuse')
		made.push(account.id)
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('mes-vues')).toHaveCount(0)
	})
})
