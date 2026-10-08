// Audience measurement (MES-10, plans/04 §3.1) against the fake Umami
// (tests/regression/mock-umami.mjs), launched by tests/regression/run.mjs:
// the Umami script and its sends go through /u on the site, the version is
// in data-tag, nothing leaves an automated browser or a browser that opted
// out, the proxy strips the cookies and the Referer and passes the visitor's
// IP, and sampled Web Vitals arrive as « web-vitals » events.
// Playwright gives navigator.webdriver = true and a HeadlessChrome user
// agent: each rule is checked alone, and a real visitor is played by forcing
// webdriver to false with an ordinary Chrome user agent.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { getElementsByTagName } from 'domutils'
import { parseDocument } from 'htmlparser2'

const APP = process.env.RG_APP ?? 'http://localhost:3996'
const UMAMI = process.env.RG_UMAMI ?? 'http://127.0.0.1:4113'
const VERSION = process.env.RG_VERSION ?? '0123abc'
const WEBSITE_ID = 'e7010ee5-a940-4add-80bf-5483d2c515db'
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']
const CHROME =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const IP_LOCALE = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/

// Never against the production: local hosts only
for (const cible of [APP, UMAMI])
	if (!HOTES_LOCAUX.includes(new URL(cible).hostname))
		throw new Error(`cible non locale refusée : ${cible}`)

async function piloter(chemin) {
	return (await fetch(UMAMI + chemin)).json()
}
const recus = async () => (await piloter('/__umami/etat')).journal
const envoisRecus = async () =>
	(await recus()).filter(r => r.methode === 'POST' && r.chemin === '/api/send')

test.beforeEach(async () => {
	await piloter('/__umami/reset')
})

// every request of the page: hosts reached and sends to /u/api/send
function suivreRequetes(page) {
	const suivi = { hotes: new Set(), envois: [] }
	page.on('request', requete => {
		const url = new URL(requete.url())
		suivi.hotes.add(url.hostname)
		if (url.pathname === '/u/api/send') suivi.envois.push(requete)
	})
	return suivi
}

// records each call Umami makes to window.mmAvantEnvoi and whether it let
// the send through
async function espionnerAvantEnvoi(page) {
	await page.addInitScript(() => {
		window.__avantEnvoi = []
		let filtre
		Object.defineProperty(window, 'mmAvantEnvoi', {
			configurable: true,
			set(fonction) {
				filtre = fonction
			},
			get() {
				return (
					filtre &&
					((type, payload) => {
						const resultat = filtre(type, payload)
						window.__avantEnvoi.push({ type, envoye: !!resultat })
						return resultat
					})
				)
			},
		})
	})
}

async function visiteurReel(page) {
	await page.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, 'webdriver', {
			configurable: true,
			get: () => false,
		})
	})
}

const attendreUmami = page =>
	page.waitForFunction(
		() =>
			document.readyState === 'complete' &&
			typeof window.umami?.track === 'function'
	)

test.describe('MES-10 balise Umami', () => {
	test('HTML : script chargé depuis /u, version dans data-tag, filtre défini avant', async ({
		request,
	}) => {
		// / is rendered on each request, /a-propos at build time: same tag
		for (const chemin of ['/', '/a-propos']) {
			const html = await (await request.get(chemin)).text()
			expect(html).not.toContain('wadefade')
			const scripts = getElementsByTagName('script', parseDocument(html))
			const umami = scripts.findIndex(s => s.attribs.src === '/u/script.js')
			expect(umami, chemin).toBeGreaterThan(-1)
			expect(scripts[umami].attribs).toMatchObject({
				defer: '',
				'data-website-id': WEBSITE_ID,
				'data-host-url': '/u',
				'data-domains': 'localhost',
				'data-tag': VERSION,
				'data-before-send': 'mmAvantEnvoi',
			})
			const filtre = scripts.findIndex(s =>
				(s.children[0]?.data ?? '').startsWith('window.mmAvantEnvoi=')
			)
			expect(filtre, chemin).toBeGreaterThan(-1)
			expect(filtre).toBeLessThan(umami)
		}
		// the same version as the healthcheck, with SOURCE_COMMIT given to the
		// build only (tests/regression/run.mjs)
		expect(await (await request.get('/api/health')).json()).toEqual({
			ok: true,
			version: VERSION,
		})
	})

	test('proxy : /u/script.js vient du faux Umami, sans cookie, avec l’IP du visiteur', async ({
		request,
	}) => {
		const reponse = await request.get('/u/script.js', {
			headers: {
				cookie: 'mm-test=valeur-privee',
				referer: `${APP}/search?search=mariage`,
			},
		})
		expect(reponse.status()).toBe(200)
		expect(await reponse.text()).toContain("config('before-send')")
		const [recue] = await recus()
		expect(recue).toMatchObject({ methode: 'GET', chemin: '/script.js' })
		expect(recue.entetes.cookie).toBeUndefined()
		expect(recue.entetes.referer).toBeUndefined()
		expect(recue.entetes['true-client-ip']).toMatch(IP_LOCALE)
		expect(recue.entetes['x-forwarded-for']).toBeUndefined()
		expect(recue.entetes['x-real-ip']).toBeUndefined()
	})

	test('proxy : l’IP et le pays envoyés par le navigateur sont remplacés', async ({
		request,
	}) => {
		const reponse = await request.post('/u/api/send', {
			headers: {
				'x-forwarded-for': '198.51.100.1',
				'true-client-ip': '198.51.100.9',
				'cf-ipcountry': 'US',
				cookie: 'mm-test=valeur-privee',
			},
			data: {
				type: 'event',
				payload: { website: WEBSITE_ID, hostname: 'localhost', url: '/' },
			},
		})
		expect(reponse.status()).toBe(200)
		const [envoi] = await envoisRecus()
		// without Traefik in front, the X-Forwarded-For given is the visitor's
		expect(envoi.entetes['true-client-ip']).toBe('198.51.100.1')
		expect(envoi.entetes['x-forwarded-for']).toBeUndefined()
		expect(envoi.entetes['cf-ipcountry']).toBeUndefined()
		expect(envoi.entetes.cookie).toBeUndefined()
		expect(envoi.corps.payload.website).toBe(WEBSITE_ID)
	})

	test('proxy : une autre casse (/U/script.js, /u/API/send) ne mène pas à Umami', async ({
		request,
	}) => {
		const secrets = {
			cookie: 'next-auth.session-token=jeton-prive; mm-test=valeur-privee',
			authorization: 'Bearer secret-auth',
		}
		for (const chemin of ['/U/script.js', '/u/SCRIPT.JS', '/u/Script.js'])
			expect(
				(await request.get(chemin, { headers: secrets })).status(),
				chemin
			).toBe(404)
		for (const chemin of ['/U/api/send', '/u/API/send', '/u/api/Send'])
			expect(
				(
					await request.post(chemin, {
						headers: secrets,
						data: {
							type: 'event',
							payload: { website: WEBSITE_ID, hostname: 'localhost', url: '/' },
						},
					})
				).status(),
				chemin
			).toBe(404)
		expect(await recus()).toEqual([])
	})

	test('proxy : rien d’autre de l’instance n’est servi sous /u', async ({
		request,
	}) => {
		for (const chemin of ['/u/login', '/u/api/websites', '/u/api/auth/login'])
			expect((await request.get(chemin)).status(), chemin).toBe(404)
		expect(await recus()).toEqual([])
	})
})

test.describe('MES-10 qui est mesuré', () => {
	async function aucunEnvoi(page) {
		const suivi = suivreRequetes(page)
		await espionnerAvantEnvoi(page)
		const script = page.waitForResponse(r => r.url() === `${APP}/u/script.js`)
		await page.goto('/')
		expect((await script).status()).toBe(200)
		await attendreUmami(page)
		// the page view was attempted, and refused by the filter
		await expect
			.poll(() => page.evaluate(() => window.__avantEnvoi.length))
			.toBeGreaterThan(0)
		await page.evaluate(() => window.umami.track('sonde'))
		expect(
			(await page.evaluate(() => window.__avantEnvoi)).every(a => !a.envoye)
		).toBe(true)
		expect(suivi.envois).toEqual([])
		expect(await envoisRecus()).toEqual([])
		expect([...suivi.hotes].every(h => HOTES_LOCAUX.includes(h))).toBe(true)
	}

	test.describe('navigateur automatisé avec un user agent ordinaire', () => {
		test.use({ userAgent: CHROME })

		test('webdriver = true (défaut de Playwright) : aucun envoi', async ({
			page,
		}) => {
			await aucunEnvoi(page)
			expect(await page.evaluate(() => navigator.webdriver)).toBe(true)
			expect(await page.evaluate(() => navigator.userAgent)).toBe(CHROME)
		})
	})

	test('user agent HeadlessChrome (défaut de Playwright), même avec webdriver = false : aucun envoi', async ({
		page,
	}) => {
		await visiteurReel(page)
		await aucunEnvoi(page)
		expect(await page.evaluate(() => navigator.webdriver)).toBe(false)
		expect(await page.evaluate(() => navigator.userAgent)).toContain(
			'HeadlessChrome'
		)
	})

	test.describe('visiteur réel (webdriver = false, Chrome ordinaire)', () => {
		test.use({ userAgent: CHROME })

		test('la page vue passe par /u/api/send et arrive au faux Umami, nettoyée', async ({
			page,
			context,
		}) => {
			const suivi = suivreRequetes(page)
			await visiteurReel(page)
			await context.addCookies([
				{ name: 'mm-test', value: 'valeur-privee', url: APP },
			])
			const envoi = page.waitForResponse(
				r => r.url() === `${APP}/u/api/send` && r.request().method() === 'POST'
			)
			await page.goto(
				'/?utm_source=regression&utm_campaign=mes-10&code=secret-123#ancre'
			)
			expect(await page.evaluate(() => navigator.webdriver)).toBe(false)
			expect((await envoi).status()).toBe(200)

			// the page view: the only send without an event name
			const pageVue = async () =>
				(await envoisRecus()).find(e => !e.corps.payload.name)
			await expect.poll(pageVue).toBeTruthy()
			const vue = await pageVue()
			expect(vue.corps.type).toBe('event')
			expect(vue.corps.payload).toMatchObject({
				website: WEBSITE_ID,
				hostname: 'localhost',
				tag: VERSION,
				url: `${APP}/?utm_source=regression&utm_campaign=mes-10`,
			})
			expect(JSON.stringify(vue.corps)).not.toContain('secret-123')
			expect(vue.entetes.cookie).toBeUndefined()
			expect(vue.entetes.referer).toBeUndefined()
			expect(vue.entetes['user-agent']).toBe(CHROME)
			expect(vue.entetes['true-client-ip']).toMatch(IP_LOCALE)

			const script = (await recus()).find(r => r.chemin === '/script.js')
			expect(script.entetes.cookie).toBeUndefined()
			expect([...suivi.hotes].every(h => HOTES_LOCAUX.includes(h))).toBe(true)
		})

		test('arrivée depuis l’application Google (Android) : le référent garde l’identifiant de l’application', async ({
			page,
		}) => {
			const GOOGLE = 'android-app://com.google.android.googlequicksearchbox/'
			await visiteurReel(page)
			// what Chrome on Android gives a page opened from the Google app
			await page.addInitScript(referent => {
				Object.defineProperty(Document.prototype, 'referrer', {
					configurable: true,
					get: () => referent,
				})
			}, GOOGLE)
			await page.goto('/')
			expect(await page.evaluate(() => document.referrer)).toBe(GOOGLE)

			const pageVue = async () =>
				(await envoisRecus()).find(e => !e.corps.payload.name)
			await expect.poll(pageVue).toBeTruthy()
			const { payload } = (await pageVue()).corps
			expect(payload.referrer).toBe(GOOGLE)
			// the referrer domain Umami 3.2 derives (send route): « google. »
			// in it puts the visit in the organic search channel
			const domaine = new URL(
				payload.referrer,
				`https://${payload.hostname}`
			).hostname.replace(/^www\./, '')
			expect(domaine).toBe('com.google.android.googlequicksearchbox')
		})

		test('Web Vitals : un événement « web-vitals » par mesure, page sans query', async ({
			page,
		}) => {
			await visiteurReel(page)
			await page.goto('/blog?utm_source=regression')
			await expect
				.poll(async () =>
					(await envoisRecus())
						.filter(e => e.corps.payload.name === 'web-vitals')
						.map(e => e.corps.payload.data.name)
				)
				.toContain('TTFB')
			const vitals = (await envoisRecus()).filter(
				e => e.corps.payload.name === 'web-vitals'
			)
			for (const { corps } of vitals) {
				expect(Object.keys(corps.payload.data).sort()).toEqual([
					'name',
					'page',
					'rating',
					'value',
				])
				expect(corps.payload.data.page).toBe('/blog')
				expect(['good', 'needs-improvement', 'poor']).toContain(
					corps.payload.data.rating
				)
				expect(typeof corps.payload.data.value).toBe('number')
				expect(corps.payload.tag).toBe(VERSION)
			}
		})

		test('« Ne plus mesurer mes visites » : aucun envoi', async ({ page }) => {
			const suivi = suivreRequetes(page)
			await visiteurReel(page)
			await page.addInitScript(() =>
				window.localStorage.setItem('umami.disabled', '1')
			)
			await page.goto('/')
			await attendreUmami(page)
			await page.evaluate(() => window.umami.track('sonde'))
			expect(suivi.envois).toEqual([])
			expect(await envoisRecus()).toEqual([])
		})
	})
})
