import { expect, test } from '@playwright/test'
import { fauxUmami, type LectureFauxUmami, unAgentParEssai } from '../outils/faux-umami'

/**
 * The three legal pages in a browser (ticket 112): they answer 200 with a single h1, and the button
 * of the privacy policy stops, then brings back, what this browser sends to the fake Umami. The text
 * word for word is checked without a browser (tests/unit/pages-juridiques.test.tsx); the addresses
 * are also held green by I45 (tests/e2e/parite-urls.spec.ts).
 */

const PAGES = [
	{ chemin: '/mentions-legales', titre: 'Mentions légales de My Makeup' },
	{ chemin: '/cgu', titre: 'CGU My Makeup' },
	{ chemin: '/politique-de-confidentialite', titre: 'Politique de confidentialité de My Makeup' },
] as const

test.describe('Les pages juridiques', { tag: '@mobile' }, () => {
	for (const { chemin, titre } of PAGES) {
		test(`${chemin} : 200, un seul h1, le texte`, async ({ page }) => {
			const reponse = await page.goto(chemin)

			expect(reponse?.status()).toBe(200)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(titre.replaceAll(' ', ' '))
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://my-makeup.fr${chemin}`)
			await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
			await expect(page.locator('article h2').first()).toBeVisible()
		})
	}
})

test.describe('L’opposition à la mesure', () => {
	let umami: LectureFauxUmami
	// The default agent of the headless browser says « HeadlessChrome », which the filter refuses to measure: an
	// ordinary Chrome, with a mark of its own. The fake Umami is shared by every worker of the run, and the test
	// reads only what came from its browser (tests/outils/faux-umami.ts).
	test.use(unAgentParEssai())

	test.beforeEach(async ({ context, userAgent }) => {
		umami = fauxUmami().pourLAgent(userAgent)
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
	})

	test('un clic coupe l’envoi au faux Umami sur ce navigateur, un second le rétablit', async ({ page }) => {
		const vues = async () => (await umami.envois()).length
		const vuesDesCgu = async () =>
			(await umami.recus()).filter(recu => JSON.stringify(recu.corps).includes('/cgu')).length
		const cle = () => page.evaluate(() => window.localStorage.getItem('umami.disabled'))

		// Before the click, the visit is counted.
		await page.goto('/politique-de-confidentialite')
		await expect.poll(vues, { timeout: 10_000 }).toBeGreaterThan(0)

		// One click: this browser is out.
		await page.getByRole('button', { name: 'Ne plus mesurer mes visites' }).click()
		await expect(page.getByText("La mesure d'audience est désactivée sur ce navigateur.")).toBeVisible()
		expect(await cle()).not.toBeNull()

		// The next page loads the tracker, which settles its answer before `track()` returns: nothing is waited for by the clock.
		await page.goto('/cgu')
		await page.waitForFunction(() => 'umami' in window)
		await page.evaluate(() => (window as unknown as { umami: { track: () => Promise<void> } }).umami.track())
		// Measures of the first page (sent before the click) may still reach the fake after it:
		// only what the page opened after the click sends counts.
		expect(await vuesDesCgu()).toBe(0)

		// The choice outlives the page: the button says so when the policy is opened again.
		await page.goto('/politique-de-confidentialite')
		await expect(page.getByRole('button', { name: "Réactiver la mesure d'audience" })).toBeVisible()

		// A second click brings the measure back.
		await page.getByRole('button', { name: "Réactiver la mesure d'audience" }).click()
		await expect(page.getByText("La mesure d'audience est active sur ce navigateur.")).toBeVisible()
		expect(await cle()).toBeNull()
		await page.goto('/cgu')
		await expect.poll(vuesDesCgu, { timeout: 10_000 }).toBeGreaterThan(0)
	})
})
