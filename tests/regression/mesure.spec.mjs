// Audience measurement (MES-10, plans/04 §3.1) against the fake Umami
// (tests/regression/mock-umami.mjs), launched by tests/regression/run.mjs:
// the Umami script and its sends go through /u on the site, the version is
// in data-tag, nothing leaves an automated browser or a browser that opted
// out, the proxy strips the cookies and the Referer and passes the visitor's
// IP, sampled Web Vitals arrive as « web-vitals » events, and the answer to
// « Comment as-tu connu My Makeup ? » arrives as « onboarding_source » (UI-05).
// Playwright gives navigator.webdriver = true and a HeadlessChrome user
// agent: each rule is checked alone, and a real visitor is played by forcing
// webdriver to false with an ordinary Chrome user agent.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { getElementsByTagName } from 'domutils'
import { parseDocument } from 'htmlparser2'
import {
	aller,
	connecter,
	inscrire,
	panne,
	reinitialiserStrapi,
} from './outils-strapi.mjs'

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
// data of the events of that name received by the fake Umami
const evenements = async nom =>
	(await envoisRecus())
		.filter(e => e.corps.payload.name === nom)
		.map(e => e.corps.payload.data)

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await piloter('/__umami/reset')
	// the fake Strapi is shared with espace.spec.mjs
	await reinitialiserStrapi()
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
	test('HTML : un script en ligne définit le filtre et l’attente, puis ajoute /u/script.js en async avec la version', async ({
		request,
		page,
	}) => {
		// / is rendered on each request, /a-propos at build time: same tag
		for (const chemin of ['/', '/a-propos']) {
			const html = await (await request.get(chemin)).text()
			expect(html).not.toContain('wadefade')
			const scripts = getElementsByTagName('script', parseDocument(html))
			// no <script src="/u/script.js"> tag in the HTML: the inline
			// script adds it, after the filter and the waiting room
			expect(
				scripts.filter(s => s.attribs.src === '/u/script.js'),
				chemin
			).toEqual([])
			const chargeur = scripts.findIndex(s =>
				(s.children[0]?.data ?? '').startsWith('window.mmAvantEnvoi=')
			)
			expect(chargeur, chemin).toBeGreaterThan(-1)
			const source = scripts[chargeur].children[0].data
			expect(source).toContain('window.mmAttenteUmami=')
			expect(source).toContain(`"data-tag":"${VERSION}"`)
			// before the scripts of Next
			expect(chargeur).toBeLessThan(
				scripts.findIndex(s => s.attribs.src?.startsWith('/_next/'))
			)

			await page.goto(chemin)
			const ajoutes = await page.evaluate(() =>
				[...document.querySelectorAll('script[src="/u/script.js"]')].map(s => ({
					async: s.async,
					defer: s.defer,
					dansLeHead: s.parentNode === document.head,
					attributs: Object.fromEntries(
						[...s.attributes].map(a => [a.name, a.value])
					),
				}))
			)
			expect(ajoutes, chemin).toHaveLength(1)
			// async: the deferred scripts of Next never wait for Umami
			expect(ajoutes[0]).toMatchObject({
				async: true,
				defer: false,
				dansLeHead: true,
				attributs: {
					src: '/u/script.js',
					'data-website-id': WEBSITE_ID,
					'data-host-url': '/u',
					'data-domains': 'localhost',
					'data-tag': VERSION,
					'data-before-send': 'mmAvantEnvoi',
				},
			})
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

		test('session expirée (RG-08) : session_expired part une fois, avec l’endroit lu dans ?ou= (api_401 sans ?ou= ou hors catalogue)', async ({
			page,
		}) => {
			await visiteurReel(page)
			const expirations = async () =>
				(await envoisRecus())
					.filter(e => e.corps.payload.name === 'session_expired')
					.map(e => e.corps.payload.data)
			for (const [ou, where] of [
				['middleware', 'middleware'],
				['jwt_expire', 'jwt_expire'],
				['api_401', 'api_401'],
				[null, 'api_401'],
				['ailleurs', 'api_401'],
			]) {
				await piloter('/__umami/reset')
				await page.goto(
					`/auth/signin?error=session-expiree${
						ou ? `&ou=${ou}` : ''
					}&callbackUrl=%2Fauth%2Fprofil`
				)
				await expect(page.locator('[data-cy="signin-url-error"]')).toHaveText(
					'Ta session a expiré, reconnecte-toi.'
				)
				await expect.poll(expirations).toEqual([{ where }])
				await page.waitForLoadState('networkidle')
				expect(await expirations()).toEqual([{ where }])
			}
		})

		// sign-up up to the name step of /auth/init-account
		async function etapeDuNom(page, email) {
			await inscrire(page, email)
			await expect(page.getByTestId('first_name')).toBeVisible({
				timeout: 15_000,
			})
			await page.getByTestId('first_name').fill('Al')
			await page.getByTestId('last_name').fill('Bo')
		}
		// The page's sends to /u/api/send. `apres(nom, data)` waits until the
		// page has sent that event and every send so far has its answer (the
		// proxy answers once Umami has): the fake Umami then holds all the
		// events sent before it.
		function suivreEnvois(page) {
			const vus = []
			const finis = new Set()
			page.on('request', requete => {
				if (new URL(requete.url()).pathname === '/u/api/send') vus.push(requete)
			})
			page.on('requestfinished', requete => finis.add(requete))
			page.on('requestfailed', requete => finis.add(requete))
			const envoye = (nom, data) =>
				vus.some(requete => {
					const payload = requete.postDataJSON()?.payload
					return (
						payload?.name === nom &&
						Object.entries(data).every(([cle, v]) => payload.data?.[cle] === v)
					)
				})
			return async (nom, data = {}) => {
				await expect.poll(() => envoye(nom, data)).toBe(true)
				await expect.poll(() => vus.every(r => finis.has(r))).toBe(true)
			}
		}
		// « Bienvenue » shown and the end of the onboarding received: it is
		// sent last, after any onboarding_source
		async function finDeLInscription(page, apres) {
			await expect(page.getByText(/Bienvenue sur My.Makeup/)).toBeVisible()
			await apres('onboarding_step', { step: 'termine' })
		}
		const question = page =>
			page.getByRole('group', { name: /Comment as-tu connu My.Makeup/ })

		test('onboarding_source : la réponse part une fois, seulement quand le nom est enregistré', async ({
			page,
		}) => {
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			await etapeDuNom(page, 'origine@test.local')
			await page.getByTestId('onboarding-source-instagram').check()

			// the save fails: nothing is counted. profile_save is sent as soon
			// as the PATCH answers, before the line that counts the answer.
			await panne({ patch: 500 })
			await page.getByTestId('submit').click()
			await expect(page.getByTestId('save-error')).toBeVisible()
			await apres('profile_save', { section: 'onboarding', ok: false })
			expect(await evenements('onboarding_source')).toEqual([])

			await panne({ patch: null })
			await page.getByTestId('submit').click()
			await finDeLInscription(page, apres)
			const envois = (await envoisRecus()).filter(
				e => e.corps.payload.name === 'onboarding_source'
			)
			expect(envois).toHaveLength(1)
			expect(envois[0].corps.payload).toMatchObject({
				website: WEBSITE_ID,
				tag: VERSION,
				name: 'onboarding_source',
				data: { source: 'instagram' },
			})
			expect(envois[0].corps.payload.url).toContain('/auth/init-account')
			expect(JSON.stringify(envois[0].corps)).not.toContain('origine@test')
		})

		test('onboarding_source : réponse effacée, l’inscription se termine et rien ne part', async ({
			page,
		}) => {
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			await etapeDuNom(page, 'sans-origine@test.local')
			const effacer = page.getByTestId('onboarding-source-effacer')
			await expect(effacer).toHaveCount(0)
			await page.getByTestId('onboarding-source-ecole').check()
			await effacer.click()
			await expect(
				question(page).getByRole('radio', { checked: true })
			).toHaveCount(0)
			await expect(effacer).toHaveCount(0)
			await expect(
				page.getByTestId('onboarding-source-instagram')
			).toBeFocused()

			await page.getByTestId('submit').click()
			await finDeLInscription(page, apres)
			expect(await evenements('onboarding_source')).toEqual([])
		})

		test('onboarding_source : profil déjà créé (retour sur la page), pas de question et rien ne part', async ({
			page,
		}) => {
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			// the test account already has its profile: the POST answers 400
			expect(await connecter(page)).toBe(true)
			await aller(page, '/auth/init-account')
			await expect(page.getByTestId('first_name')).toBeVisible({
				timeout: 15_000,
			})
			await expect(question(page)).toHaveCount(0)
			await page.getByTestId('first_name').fill('Al')
			await page.getByTestId('last_name').fill('Bo')
			await page.getByTestId('submit').click()
			await finDeLInscription(page, apres)
			expect(await evenements('onboarding_source')).toEqual([])
		})

		test('onboarding_source : la politique de confidentialité décrit la question', async ({
			page,
		}) => {
			await page.goto('/politique-de-confidentialite')
			const phrase = page.getByText(/Comment as-tu connu My Makeup \?/)
			await expect(phrase).toHaveCount(1)
			await expect(phrase).toContainText(
				'est envoyée à Umami de la même façon, sans cookie'
			)
			await expect(phrase).toContainText(
				"Elle n'est enregistrée ni dans le compte ni dans le profil"
			)
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

// the client code of Next has run: window.next set, the React root hydrated
const hydratee = () => {
	const racine = document.getElementById('__next')
	return (
		!!window.next &&
		!!racine &&
		Object.keys(racine).some(cle => cle.startsWith('__reactContainer'))
	)
}

// records each event handed to window.mmAttenteUmami (before the Umami
// script ran) and whether it was kept
async function espionnerAttente(page) {
	await page.addInitScript(() => {
		window.__enAttente = []
		let attente
		Object.defineProperty(window, 'mmAttenteUmami', {
			configurable: true,
			set(fonction) {
				attente = fonction
			},
			get() {
				return (
					attente &&
					((name, data) => {
						const garde = attente(name, data)
						window.__enAttente.push({ name, garde })
						return garde
					})
				)
			},
		})
	})
}

test.describe('MES-10 un Umami lent ou muet ne retient pas le site', () => {
	test('la page est hydratée pendant que /u/script.js attend encore', async ({
		page,
	}) => {
		// /script.js reaches the fake Umami, which does not answer
		await piloter('/__umami/retenir')
		const finies = new Set()
		page.on('requestfinished', requete => finies.add(requete))
		page.on('requestfailed', requete => finies.add(requete))
		for (const chemin of ['/', '/a-propos']) {
			const script = page.waitForRequest(
				r => new URL(r.url()).pathname === '/u/script.js'
			)
			await page.goto(chemin, { waitUntil: 'domcontentloaded' })
			await page.waitForFunction(hydratee)
			// only the load event waits for Umami
			expect(await page.evaluate(() => document.readyState), chemin).toBe(
				'interactive'
			)
			expect(finies.has(await script), chemin).toBe(false)
		}
		expect((await recus()).filter(r => r.chemin === '/script.js')).toHaveLength(
			2
		)
	})

	test.describe('visiteur réel', () => {
		test.use({ userAgent: CHROME })

		test('un événement suivi avant l’arrivée du script part quand il arrive', async ({
			page,
		}) => {
			await visiteurReel(page)
			await espionnerAttente(page)
			await piloter('/__umami/retenir')
			await page.goto('/regression-page-absente', {
				waitUntil: 'domcontentloaded',
			})
			// the 404 page tracks not_found as soon as it mounts
			await expect
				.poll(() => page.evaluate(() => window.__enAttente))
				.toContainEqual({ name: 'not_found', garde: true })
			expect(await envoisRecus()).toEqual([])

			await piloter('/__umami/liberer')
			const evenement = async () =>
				(await envoisRecus()).find(e => e.corps.payload.name === 'not_found')
			await expect.poll(evenement).toBeTruthy()
			expect((await evenement()).corps.payload).toMatchObject({
				website: WEBSITE_ID,
				tag: VERSION,
				data: { kind: 'autre' },
			})
			// and the page view, once the page has loaded
			await expect
				.poll(async () =>
					(await envoisRecus()).some(e => !e.corps.payload.name)
				)
				.toBe(true)
		})
	})
})
