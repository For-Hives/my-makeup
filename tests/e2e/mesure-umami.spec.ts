import { expect, test } from '@playwright/test'
import { fauxUmami } from '../outils/faux-umami'

/**
 * The audience measure, end to end (tickets 111 and 143): a real browser loads a page, the tracker
 * comes from the site's own `/u` path, and the fake Umami of the bench receives what the site relays.
 *
 * Playwright's Chromium announces itself as an automated browser (`navigator.webdriver`, a
 * HeadlessChrome user agent), which the filter of the site refuses to measure: that is the second
 * test. The others play a browser that is not automated, the way a visitor's is.
 */

const umami = fauxUmami()

/** The user agent of an ordinary Chrome: the default one of the headless browser says « HeadlessChrome ». */
const AGENT_ORDINAIRE =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

test.beforeEach(async () => {
	await umami.vider()
})

test.describe('Un navigateur qui n’est pas automatisé', () => {
	test.use({ userAgent: AGENT_ORDINAIRE })

	test('une page vue arrive au faux Umami, par /u, sans cookie ni Referer, avec la version du build', async ({
		context,
		page,
		request,
	}) => {
		// The version of the build is the one /api/health shows: the tag of every event.
		const version = ((await (await request.get('/api/health')).json()) as { version: string }).version
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})

		const scripts: string[] = []
		page.on('request', requete => {
			const url = new URL(requete.url())
			if (url.pathname.startsWith('/u/')) scripts.push(`${requete.method()} ${url.pathname}`)
		})
		await page.goto('/?q=recherche-privee#haut')

		await expect.poll(async () => (await umami.recus()).length, { timeout: 10_000 }).toBeGreaterThan(0)
		const [recu] = await umami.recus()
		const corps = recu?.corps as { type: string; payload: Record<string, unknown> }
		expect(corps.type).toBe('event')
		expect(corps.payload).toMatchObject({
			website: 'e7010ee5-a940-4add-80bf-5483d2c515db',
			hostname: 'localhost',
			tag: version,
		})
		// The page view carries no event name; the address lost its search terms and its hash.
		expect(corps.payload.name).toBeUndefined()
		expect(String(corps.payload.url)).toMatch(/^http:\/\/localhost:\d+\/$/)
		expect(recu?.cookie).toBe(false)
		expect(recu?.referer).toBe(false)
		expect(recu?.autorisation).toBe(false)
		// The browser went through the site: the script and the send, under /u, and nowhere else.
		expect(scripts).toContain('GET /u/script.js')
		expect(scripts).toContain('POST /u/api/send')
	})
})

test.describe('Un navigateur automatisé', () => {
	test('rien n’est envoyé : le filtre de la page le refuse', async ({ page }) => {
		await page.goto('/')
		await page.waitForLoadState('networkidle')
		await page.waitForTimeout(1500)
		expect(await umami.recus()).toEqual([])
	})
})

test.describe('Le chemin /u', () => {
	test('le script est celui de l’instance, relayé', async ({ request }) => {
		const reponse = await request.get('/u/script.js')
		expect(reponse.status()).toBe(200)
		expect(reponse.headers()['content-type']).toContain('javascript')
		expect(await reponse.text()).toContain('window.umami')
		expect(reponse.headers()['set-cookie']).toBeUndefined()
	})

	test('une mesure postée avec un cookie, un Referer et une adresse arrive sans les deux premiers', async ({
		request,
	}) => {
		const reponse = await request.post('/u/api/send', {
			headers: {
				Cookie: 'authjs.session-token=valeur-fictive',
				Referer: 'https://exemple.test/auth/profil?x=1',
				Authorization: 'Bearer valeur-fictive',
				'X-Forwarded-For': '198.51.100.9, 203.0.113.7',
			},
			data: { type: 'event', payload: { name: 'cta_click', website: 'e7010ee5-a940-4add-80bf-5483d2c515db' } },
		})
		expect(reponse.status()).toBe(200)

		const [recu] = await umami.envois('cta_click')
		expect(recu).toMatchObject({ cookie: false, referer: false, autorisation: false, adresse: '203.0.113.7' })
	})

	test('un GET sur l’envoi répond 405, tout autre chemin sous /u répond 404', async ({ request }) => {
		expect((await request.get('/u/api/send')).status()).toBe(405)
		for (const chemin of [
			'/u',
			'/u/',
			'/u/autre-chemin',
			'/u/api/autre',
			'/u/api',
			'/u/dashboard',
			'/u/login',
			'/U/script.js',
		])
			expect((await request.get(chemin)).status(), chemin).toBe(404)
		expect(await umami.recus()).toEqual([])
	})
})
