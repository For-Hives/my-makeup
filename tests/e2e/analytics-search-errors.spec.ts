import { expect, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles } from '../fixtures/search-profiles'
import { agentByTest, fakeUmami, type ReadingFakeUmami } from '../support/fake-umami'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The events of the search, the calls to action and the 404 (ticket 145; plan 04 §3.3, events 4 to 6
 * and 8). A browser that is not automated visits the site, and the fake Umami of the bench receives
 * what the site relays. Nothing typed may reach it.
 */

let umami: ReadingFakeUmami
let reference: SearchProfile

test.describe.configure({ mode: 'serial' })

type Data = Record<string, unknown>
const dataOf = (recu: { corps: unknown }): Data => (recu.corps as { payload: { data: Data } }).payload.data

test.describe('La mesure de la recherche, des appels à l’action et de la 404', () => {
	// An ordinary Chrome, with a mark of its own: the fake Umami is shared by every worker of the run, and the
	// test reads only what came from its browser (tests/support/fake-umami.ts).
	test.use(agentByTest())

	test.beforeAll(async () => {
		test.setTimeout(180_000)
		const profiles = await setSearchProfiles()
		const found = profiles.get('reference')
		if (!found) throw new Error('pas de profil d’essai « reference »')
		reference = found
	})

	test.beforeEach(async ({ context, request, userAgent }) => {
		await refreshProfilePages(request, reference)
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		umami = fakeUmami().pourLAgent(userAgent)
	})

	test('la soumission du formulaire : une fois, la tranche et la ville, jamais le texte ; le clic donne rang et profil', async ({
		page,
	}) => {
		await page.goto('/')
		await page.getByLabel('Prestation recherchée').fill('mariage lea@example.test')
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/\/search\?/)

		await expect.poll(async () => (await umami.envois('search_submit')).length, { timeout: 10_000 }).toBe(1)
		const [submission] = await umami.envois('search_submit')
		const data = submission ? dataOf(submission) : {}
		expect(Object.keys(data).sort()).toEqual(['from', 'has_city', 'results'])
		expect(data.from).toBe('formulaire')
		expect(data.has_city).toBe(true)
		expect(['0', '1-5', '6-20', '21+']).toContain(data.results)

		// A reload shows the same search again: not a new one.
		await page.reload()
		await page.waitForFunction(() => 'umami' in window)
		// A negative check waits for the network to settle: any event would have left by then.
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('search_submit')).length).toBe(1)

		// A click on a result: its rank and its profile.
		await page.goto('/search?city=Annecy')
		const cards = page.locator('main ul li a[href^="/profil/"]')
		await expect(cards.first()).toBeVisible()
		await cards.nth(1).click()
		await expect.poll(async () => (await umami.envois('search_result_click')).length, { timeout: 10_000 }).toBe(1)
		const [click] = await umami.envois('search_result_click')
		const clicked = click ? dataOf(click) : {}
		expect(Object.keys(clicked).sort()).toEqual(['pid', 'rank'])
		expect(clicked.rank).toBe(2)
		expect(typeof clicked.pid === 'number' || /^v3-\d+$/.test(String(clicked.pid))).toBe(true)

		// Nothing typed went anywhere.
		const all = JSON.stringify((await umami.recus()).map(recu => recu.corps))
		expect(all).not.toContain('lea@example.test')
		expect(all).not.toContain('mariage lea')
	})

	test('un appel à l’action de la page et celui de la navigation', async ({ page }) => {
		await page.goto('/')
		await page.getByRole('link', { name: 'Je suis maquilleuse' }).first().scrollIntoViewIfNeeded()
		await page.getByRole('link', { name: 'Je suis maquilleuse' }).first().click({ noWaitAfter: true })
		await expect.poll(async () => (await umami.envois('cta_click')).length, { timeout: 10_000 }).toBe(1)
		const [cta] = await umami.envois('cta_click')
		expect(cta ? dataOf(cta) : {}).toEqual({ where: 'cta_inscription' })

		await page.goto('/a-propos')
		await page
			.getByRole('navigation', { name: 'Navigation principale' })
			.getByRole('link', { name: 'Trouver une maquilleuse' })
			.click()
		await expect.poll(async () => (await umami.envois('cta_click')).length, { timeout: 10_000 }).toBe(2)
		const [, nav] = await umami.envois('cta_click')
		expect(['nav_recherche', 'nav_recherche_mobile']).toContain(nav ? dataOf(nav).where : null)
	})

	test('la 404 d’une adresse que rien ne sert : une fois, « autre »', async ({ page }) => {
		const response = await page.goto('/cette-page-n-existe-pas')
		expect(response?.status()).toBe(404)

		await expect.poll(async () => (await umami.envois('not_found')).length, { timeout: 10_000 }).toBe(1)
		const [missing] = await umami.envois('not_found')
		expect(missing ? dataOf(missing) : {}).toEqual({ kind: 'autre' })

		await page.reload()
		await page.waitForFunction(() => 'umami' in window)
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('not_found')).length).toBe(1)
	})

	test('la 404 : une fois, d’une liste fermée, rien de plus au rechargement', async ({ page }) => {
		const response = await page.goto('/profil/profil-qui-n-existe-pas')
		expect(response?.status()).toBe(404)

		await expect.poll(async () => (await umami.envois('not_found')).length, { timeout: 10_000 }).toBe(1)
		const [missing] = await umami.envois('not_found')
		expect(missing ? dataOf(missing) : {}).toEqual({ kind: 'profil' })

		await page.reload()
		await page.waitForFunction(() => 'umami' in window)
		// A negative check waits for the network to settle: any event would have left by then.
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('not_found')).length).toBe(1)
	})
})
