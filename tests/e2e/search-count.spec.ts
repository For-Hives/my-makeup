import { expect, test } from '@playwright/test'
import { agentByTest } from '../support/fake-umami'
import { testPayload } from '../support/payload-test'

/**
 * Issue 1002: a search is added once to the count of the day, with no text. A browser that is not
 * automated submits the form; the same search shown again (a reload, the address opened again, the back
 * button) adds nothing; a browser that opted out of the measure adds nothing. The rows are read in the
 * database of the bench; the test compares totals before and after, since other tests search too.
 */

test.describe.configure({ mode: 'serial' })

async function totals(): Promise<{ total: number; withCity: number }> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'search-counts', pagination: false, overrideAccess: true })
	return docs.reduce(
		(sum, row) => ({ total: sum.total + Number(row.total), withCity: sum.withCity + Number(row.withCity) }),
		{ total: 0, withCity: 0 }
	)
}

test.describe('Le compteur de recherches', () => {
	test.use(agentByTest())

	test.beforeEach(async ({ context }) => {
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
	})

	test('une recherche compte une fois ; la revoir ne recompte pas ; aucun texte ne part', async ({ page }) => {
		const before = await totals()
		const bodies: string[] = []
		page.on('request', request => {
			if (request.method() === 'POST' && request.headers()['next-action']) bodies.push(request.postData() ?? '')
		})
		await page.goto('/')
		await page.getByLabel('Prestation recherchée').fill('mariage lea@example.test')
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/\/search\?/)
		await expect.poll(async () => (await totals()).total - before.total, { timeout: 10_000 }).toBe(1)
		expect((await totals()).withCity - before.withCity).toBe(1)

		// The same search again: a reload, the address opened again, the back button.
		await page.reload()
		await page.goto(page.url())
		await page.goBack()
		await page.goForward()
		await page.waitForLoadState('networkidle')
		expect((await totals()).total - before.total).toBe(1)

		// Three keys and a code: nothing she typed went to the server.
		expect(bodies.length).toBeGreaterThan(0)
		const all = bodies.join('')
		expect(all).not.toContain('lea@example.test')
		expect(all).not.toContain('mariage')
		expect(all).not.toContain('Annecy')
	})

	test('un navigateur qui s’est opposé à la mesure ne compte pas', async ({ page }) => {
		await page.goto('/')
		await page.evaluate(() => localStorage.setItem('umami.disabled', '1'))
		const before = await totals()
		await page.goto('/search?city=Lyon')
		await expect(page.getByRole('main')).toBeVisible()
		await page.waitForLoadState('networkidle')
		expect((await totals()).total - before.total).toBe(0)
	})
})
