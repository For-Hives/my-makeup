import { expect, test } from '@playwright/test'
import { AGENT_AUTOMATISE, fauxUmami, unAgentParEssai } from '../support/fake-umami'

/**
 * The audience measure, end to end (tickets 111 and 143): a real browser loads a page, the tracker
 * comes from the site's own `/u` path, and the fake Umami of the bench receives what the site relays.
 *
 * Playwright's Chromium announces itself as an automated browser (`navigator.webdriver`, a
 * HeadlessChrome user agent), which the filter of the site refuses to measure: that is the second
 * test. The others play a browser that is not automated, the way a visitor's is.
 */

// The fake Umami is one instance for every worker of the run: each test reads only what came with its
// own user agent (tests/outils/faux-umami.ts), never empties it, and never reads all of it.
test.use(unAgentParEssai())

test.describe('Un navigateur qui n’est pas automatisé', () => {
	test('une page vue arrive au faux Umami, par /u, sans cookie ni Referer, avec la version du build', async ({
		context,
		page,
		request,
		userAgent,
	}) => {
		const umami = fauxUmami().pourLAgent(userAgent)
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

	test('les Web Vitals de chaque visite arrivent au faux Umami, sans échantillon', async ({
		context,
		page,
		userAgent,
	}) => {
		const umami = fauxUmami().pourLAgent(userAgent)
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		const vus = async () => (await umami.envois('web-vitals')).length

		for (const visite of [1, 2, 3]) {
			const avant = await vus()
			await page.goto('/')
			// The browser reports the metrics it has when the page goes out of sight.
			await page.evaluate(() => {
				Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
				document.dispatchEvent(new Event('visibilitychange'))
			})
			await expect.poll(vus, { message: `visite ${visite}`, timeout: 10_000 }).toBeGreaterThan(avant)
		}

		const evenements = await umami.envois('web-vitals')
		for (const recu of evenements) {
			const { payload } = recu.corps as { payload: { data: Record<string, unknown>; tag: string } }
			expect(Object.keys(payload.data).sort()).toEqual(['name', 'page', 'rating', 'value'])
			expect(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']).toContain(payload.data.name)
			expect(['good', 'needs-improvement', 'poor']).toContain(payload.data.rating)
			expect(payload.data.page).toBe('/')
			expect(typeof payload.data.value).toBe('number')
		}
	})
})

test.describe('Un navigateur automatisé', () => {
	// The user agent of the headless browser, marked like the others: the filter of the page still refuses it.
	test.use(unAgentParEssai(AGENT_AUTOMATISE))

	test('rien n’est envoyé : le filtre de la page le refuse', async ({ page, userAgent }) => {
		const umami = fauxUmami().pourLAgent(userAgent)
		await page.goto('/')
		// The tracker has run when `window.umami` exists. Asking it for a page view then goes through
		// the filter of the page, which settles before the call returns: nothing is waited for by the clock.
		await page.waitForFunction(() => 'umami' in window)
		await page.evaluate(() => (window as unknown as { umami: { track: () => Promise<void> } }).umami.track())
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
		userAgent,
	}) => {
		const umami = fauxUmami().pourLAgent(userAgent)
		const reponse = await request.post('/u/api/send', {
			headers: {
				'User-Agent': String(userAgent),
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

	test('un GET sur l’envoi répond 405, tout autre chemin sous /u répond 404', async ({ request, userAgent }) => {
		const umami = fauxUmami().pourLAgent(userAgent)
		const avecSonAgent = { headers: { 'User-Agent': String(userAgent) } }
		expect((await request.get('/u/api/send', avecSonAgent)).status()).toBe(405)
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
			expect((await request.get(chemin, avecSonAgent)).status(), chemin).toBe(404)
		expect(await umami.recus()).toEqual([])
	})
})
