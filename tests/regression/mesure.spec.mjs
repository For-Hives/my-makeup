// Audience measurement (MES-10, plans/04 §3.1) against the fake Umami
// (tests/regression/mock-umami.mjs), launched by tests/regression/run.mjs:
// the Umami script and its sends go through /u on the site, the version is
// in data-tag, nothing leaves an automated browser or a browser that opted
// out, the proxy strips the cookies and the Referer and passes the visitor's
// IP, sampled Web Vitals arrive as « web-vitals » events, the answer to
// « Comment as-tu connu My Makeup ? » arrives as « onboarding_source » (UI-05),
// and the artist's space sends « profile_visibility » and
// « profile_publiable » (MES-12), and « upload_error » with the kind of the
// API refusal (UI-03). A sign-in with Google sends its « login_result » on
// the page it comes back to (lot of 13/10).
// Playwright gives navigator.webdriver = true and a HeadlessChrome user
// agent: each rule is checked alone, and a real visitor is played by forcing
// webdriver to false with an ordinary Chrome user agent.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { getElementsByTagName } from 'domutils'
import { parseDocument } from 'htmlparser2'
import sharp from 'sharp'
import { COMPTE_TEST } from './mock-api.mjs'
import { API, aller, connecter, inscrire, panne, profilDeDepart, reinitialiserStrapi } from './outils-strapi.mjs'

const APP = process.env.RG_APP ?? 'http://localhost:3996'
const UMAMI = process.env.RG_UMAMI ?? 'http://127.0.0.1:4113'
const VERSION = process.env.RG_VERSION ?? '0123abc'
const WEBSITE_ID = 'e7010ee5-a940-4add-80bf-5483d2c515db'
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']
const CHROME =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const IP_LOCALE = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/

// Never against the production: local hosts only
for (const cible of [APP, UMAMI]) {
	if (!HOTES_LOCAUX.includes(new URL(cible).hostname)) throw new Error(`cible non locale refusée : ${cible}`)
}

async function piloter(chemin) {
	return (await fetch(UMAMI + chemin)).json()
}
const recus = async () => (await piloter('/__umami/etat')).journal
const envoisRecus = async () => (await recus()).filter(r => r.methode === 'POST' && r.chemin === '/api/send')
// data of the events of that name received by the fake Umami
const evenements = async nom =>
	(await envoisRecus()).filter(e => e.corps.payload.name === nom).map(e => e.corps.payload.data)

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
	page.waitForFunction(() => document.readyState === 'complete' && typeof window.umami?.track === 'function')

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
			const chargeur = scripts.findIndex(s => (s.children[0]?.data ?? '').startsWith('window.mmAvantEnvoi='))
			expect(chargeur, chemin).toBeGreaterThan(-1)
			const source = scripts[chargeur].children[0].data
			expect(source).toContain('window.mmAttenteUmami=')
			expect(source).toContain(`"data-tag":"${VERSION}"`)
			// before the scripts of Next
			expect(chargeur).toBeLessThan(scripts.findIndex(s => s.attribs.src?.startsWith('/_next/')))

			await page.goto(chemin)
			const ajoutes = await page.evaluate(() =>
				[...document.querySelectorAll('script[src="/u/script.js"]')].map(s => ({
					async: s.async,
					defer: s.defer,
					dansLeHead: s.parentNode === document.head,
					attributs: Object.fromEntries([...s.attributes].map(a => [a.name, a.value])),
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

	test('proxy : /u/script.js vient du faux Umami, sans cookie, avec l’IP du visiteur', async ({ request }) => {
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

	test('proxy : l’IP et le pays envoyés par le navigateur sont remplacés', async ({ request }) => {
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

	test('proxy : une autre casse (/U/script.js, /u/API/send) ne mène pas à Umami', async ({ request }) => {
		const secrets = {
			cookie: 'next-auth.session-token=jeton-prive; mm-test=valeur-privee',
			authorization: 'Bearer secret-auth',
		}
		for (const chemin of ['/U/script.js', '/u/SCRIPT.JS', '/u/Script.js']) {
			expect((await request.get(chemin, { headers: secrets })).status(), chemin).toBe(404)
		}
		for (const chemin of ['/U/api/send', '/u/API/send', '/u/api/Send']) {
			const reponse = await request.post(chemin, {
				headers: secrets,
				data: { type: 'event', payload: { website: WEBSITE_ID, hostname: 'localhost', url: '/' } },
			})
			expect(reponse.status(), chemin).toBe(404)
		}
		expect(await recus()).toEqual([])
	})

	test('proxy : rien d’autre de l’instance n’est servi sous /u', async ({ request }) => {
		for (const chemin of ['/u/login', '/u/api/websites', '/u/api/auth/login']) {
			expect((await request.get(chemin)).status(), chemin).toBe(404)
		}
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
		await expect.poll(() => page.evaluate(() => window.__avantEnvoi.length)).toBeGreaterThan(0)
		await page.evaluate(() => window.umami.track('sonde'))
		expect((await page.evaluate(() => window.__avantEnvoi)).every(a => !a.envoye)).toBe(true)
		expect(suivi.envois).toEqual([])
		expect(await envoisRecus()).toEqual([])
		expect([...suivi.hotes].every(h => HOTES_LOCAUX.includes(h))).toBe(true)
	}

	test.describe('navigateur automatisé avec un user agent ordinaire', () => {
		test.use({ userAgent: CHROME })

		test('webdriver = true (défaut de Playwright) : aucun envoi', async ({ page }) => {
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
		expect(await page.evaluate(() => navigator.userAgent)).toContain('HeadlessChrome')
	})

	test.describe('visiteur réel (webdriver = false, Chrome ordinaire)', () => {
		test.use({ userAgent: CHROME })

		registermesure1Scenario1()

		registermesure1Scenario2({})

		registermesure1Scenario3({})

		// The build of the test leaves NEXT_PUBLIC_WEB_VITALS_SAMPLE empty, as
		// the production does: the default decides (lot of 13/10, 100 %).
		test('Web Vitals : toute visite est mesurée, même au tirage le plus haut ; la politique de confidentialité ne parle plus d’une partie des pages', async ({
			page,
		}) => {
			await visiteurReel(page)
			// the draw of the page load (_app.js) at its highest: any sample
			// under 100 % leaves this visit out
			await page.addInitScript(() => {
				Math.random = () => 0.999_999
			})
			await page.goto('/blog')
			await expect.poll(async () => (await evenements('web-vitals')).map(mesure => mesure.name)).toContain('TTFB')

			await page.goto('/politique-de-confidentialite')
			const phrase = page.getByText(/Nous mesurons la fréquentation du site avec Umami/)
			await expect(phrase).toHaveCount(1)
			await expect(phrase).toContainText("la rapidité d'affichage des pages, et les clics")
			await expect(phrase).not.toContainText('une partie des pages')
		})

		registermesure1Scenario4({})

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
					return payload?.name === nom && Object.entries(data).every(([cle, v]) => payload.data?.[cle] === v)
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
		const question = page => page.getByRole('group', { name: /Comment as-tu connu My.Makeup/ })

		registermesure1Scenario5({ suivreEnvois, etapeDuNom, finDeLInscription })

		registermesure1Scenario6({ suivreEnvois, etapeDuNom, question, finDeLInscription })

		registermesure1Scenario7({ suivreEnvois, question, finDeLInscription })

		test('onboarding_source : la réponse « Une IA (ChatGPT, Gemini…) » part avec la valeur « ia »', async ({
			page,
		}) => {
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			await etapeDuNom(page, 'origine-ia@test.local')
			await question(page).getByLabel('Une IA (ChatGPT, Gemini…)', { exact: true }).check()
			await expect(page.getByTestId('onboarding-source-ia')).toBeChecked()
			await page.getByTestId('submit').click()
			await finDeLInscription(page, apres)
			expect(await evenements('onboarding_source')).toEqual([{ source: 'ia' }])
			expect(JSON.stringify(await envoisRecus())).not.toContain('origine-ia@test')
		})

		test('onboarding_source : la politique de confidentialité décrit la question', async ({ page }) => {
			await page.goto('/politique-de-confidentialite')
			const phrase = page.getByText(/Comment as-tu connu My Makeup \?/)
			await expect(phrase).toHaveCount(1)
			await expect(phrase).toContainText('est envoyée à Umami de la même façon, sans cookie')
			await expect(phrase).toContainText("Elle n'est enregistrée ni dans le compte ni dans le profil")
		})

		// --- the artist's space (MES-12) ---
		// her space loaded and counted: its page view reached the fake Umami
		// and nothing is on its way any more
		async function espaceCompte(page, chemin) {
			const vues = async () =>
				(await envoisRecus()).filter(
					e => !e.corps.payload.name && new URL(e.corps.payload.url).pathname === '/auth/profil'
				).length
			const avant = await vues()
			await aller(page, chemin)
			await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
			await expect.poll(vues).toBeGreaterThan(avant)
			await page.waitForLoadState('networkidle')
		}
		// nothing that names her, in any send of the page
		async function rienDePersonnel() {
			const tout = JSON.stringify(await envoisRecus())
			for (const mot of ['testine', 'Testine', 'Recette', 'Annecy', 'Studio']) {
				expect(tout, mot).not.toContain(mot)
			}
		}

		registermesure1Scenario8({ suivreEnvois, espaceCompte, rienDePersonnel })

		// a description of exactly n characters (no edge space)
		const texte = n => `${'Maquillage de mariée, essai compris. '.repeat(6).slice(0, n - 1)}.`
		// one criterion short: a description of 199 characters
		const presquePubliable = champs =>
			profilDeDepart({
				main_picture: { id: 1, name: 'photo-1.png', url: `${API}/media/1` },
				service_offers: [{ name: 'Mariée', price: '120 €', description: 'Essai et jour J' }],
				network: { instagram: 'studio.test', email: '', phone: '' },
				description: texte(199),
				...champs,
			})
		// a successful save through a card's modal, its profile_save received
		// and every send of the page answered
		async function sauver(page, apres, { bouton, champ, valeur, section }) {
			const sauvegardes = async () => (await evenements('profile_save')).length
			const avant = await sauvegardes()
			await page.getByTestId(bouton).click()
			await page.getByTestId(champ).fill(valeur)
			await page.getByTestId(`save-button-${section.cy}`).click()
			await expect(page.getByTestId(champ)).toBeHidden()
			await expect.poll(sauvegardes).toBe(avant + 1)
			await apres('profile_save', { section: section.nom, ok: true })
		}
		const DESCRIPTION = { cy: 'description', nom: 'description' }
		const decrire = (page, apres, valeur) =>
			sauver(page, apres, {
				bouton: 'update-description-button',
				champ: 'description-input',
				valeur,
				section: DESCRIPTION,
			})
		// the event carries no property at all
		const publiables = async () => (await evenements('profile_publiable')).map(d => d ?? {})

		registermesure1Scenario9({
			presquePubliable,
			suivreEnvois,
			espaceCompte,
			texte,
			publiables,
			decrire,
			rienDePersonnel,
		})

		registermesure1Scenario10({
			presquePubliable,
			suivreEnvois,
			espaceCompte,
			decrire,
			texte,
			publiables,
			sauver,
			rienDePersonnel,
		})

		registermesure1Scenario11({ suivreEnvois, espaceCompte, rienDePersonnel })

		// --- sign-in with Google (lot of 13/10) ---
		// Google is never reached. The button asks NextAuth where to go (POST
		// /api/auth/signin/google, which would contact Google to build the
		// address): the request is answered here, with the address Google
		// would send the browser back to. From there the real pages and the
		// real NextAuth routes run.
		const SIGNIN_GOOGLE = '**/api/auth/signin/google'
		const retourDeGoogle = (page, adresse) =>
			page.route(SIGNIN_GOOGLE, async route => {
				await route.fulfill({ json: { url: await adresse() } })
			})
		const connexions = () => evenements('login_result')
		const GOOGLE_OK = { method: 'google', ok: true, code: 'ok' }
		// every send of the page so far has reached the fake Umami
		async function pageCalme(page) {
			await page.waitForLoadState('networkidle')
		}

		test('login_result : une connexion Google réussie part une fois, sur la page de retour, pas au rechargement', async ({
			page,
		}) => {
			const suivi = suivreRequetes(page)
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			// Back from Google signed in. The callback of NextAuth cannot run
			// without Google (it exchanges a code there): the session cookie it
			// would set comes from the credentials route here, then the browser
			// goes to the page asked for, as NextAuth sends it.
			await retourDeGoogle(page, async () => {
				expect(await connecter(page)).toBe(true)
				return `${APP}/auth/profil`
			})
			await aller(page, '/auth/signin?callbackUrl=%2Fauth%2Fprofil')
			await page.getByTestId('google-signin').click()
			await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
			await apres('login_result', GOOGLE_OK)
			const envois = (await envoisRecus()).filter(e => e.corps.payload.name === 'login_result')
			expect(envois).toHaveLength(1)
			expect(envois[0].corps.payload).toMatchObject({
				website: WEBSITE_ID,
				tag: VERSION,
				name: 'login_result',
				data: GOOGLE_OK,
			})
			expect(new URL(envois[0].corps.payload.url).pathname).toBe('/auth/profil')

			// a reload, then another page: the attempt is not counted again
			await espaceCompte(page, '/auth/profil')
			await aller(page, '/')
			await pageCalme(page)
			expect(await connexions()).toEqual([GOOGLE_OK])
			await rienDePersonnel()
			expect([...suivi.hotes].every(h => HOTES_LOCAUX.includes(h))).toBe(true)
		})

		test('login_result : un retour de Google en échec part une fois avec son code, sur la page de connexion (NextAuth) comme sur /auth/error (refus de Strapi)', async ({
			page,
		}) => {
			await visiteurReel(page)
			for (const { retour, arrivee, message, code } of [
				{
					// refused at Google: the real callback of NextAuth sends
					// back to the sign-in page with ?error=Callback
					retour: '/api/auth/callback/google?error=access_denied',
					arrivee: /\/auth\/signin\?.*error=Callback/,
					message: page.getByTestId('signin-url-error'),
					code: 'service-indisponible',
				},
				{
					// Strapi refused the Google account: NextAuth sends its
					// code to /auth/error
					retour: '/api/auth/error?error=email-deja-avec-mot-de-passe',
					arrivee: /\/auth\/error\?error=email-deja-avec-mot-de-passe$/,
					message: page.getByTestId('auth-error-message'),
					code: 'email-deja-avec-mot-de-passe',
				},
			]) {
				await piloter('/__umami/reset')
				await page.unroute(SIGNIN_GOOGLE)
				await retourDeGoogle(page, () => `${APP}${retour}`)
				await aller(page, '/auth/signin')
				await page.getByTestId('google-signin').click()
				await expect(page).toHaveURL(arrivee)
				await expect(message).toBeVisible()
				const echec = { method: 'google', ok: false, code }
				await expect.poll(connexions).toEqual([echec])
				await pageCalme(page)

				// a reload shows the error again, the attempt is counted once
				await aller(page, page.url())
				await expect(message).toBeVisible()
				await pageCalme(page)
				expect(await connexions(), code).toEqual([echec])
			}
			await rienDePersonnel()
		})

		test('login_result : Google abandonné (retour sans session ni erreur) : rien ; Google qui ne part pas puis le formulaire : la seule connexion par email, même après rechargement', async ({
			page,
		}) => {
			const apres = suivreEnvois(page)
			await visiteurReel(page)
			// she gave up at Google: NextAuth sends back to the sign-in page
			await retourDeGoogle(page, () => `${APP}/api/auth/signin`)
			await aller(page, '/auth/signin')
			await page.getByTestId('google-signin').click()
			await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=/)
			await expect(page.getByTestId('google-signin')).toBeVisible()
			await pageCalme(page)
			expect(await connexions()).toEqual([])

			// the request of the button fails: the page stays, the mark too
			await page.unroute(SIGNIN_GOOGLE)
			await page.route(SIGNIN_GOOGLE, route => route.abort())
			const echec = page.waitForEvent('requestfailed', r => new URL(r.url()).pathname === '/api/auth/signin/google')
			await page.getByTestId('google-signin').click()
			await echec
			// then the form, on the same page: one sign-in, by email
			await page.getByTestId('email-input').fill(COMPTE_TEST.email)
			await page.getByTestId('password-input').fill(COMPTE_TEST.password)
			await page.getByTestId('email-signin').click()
			const parEmail = { method: 'email', ok: true, code: 'ok' }
			await apres('login_result', parEmail)
			// the next page load, signed in: the Google mark is gone with it
			await espaceCompte(page, '/auth/profil')
			await pageCalme(page)
			expect(await connexions()).toEqual([parEmail])
			await rienDePersonnel()
		})

		test('login_result : la politique de confidentialité décrit le repère gardé pendant la connexion avec Google', async ({
			page,
		}) => {
			await page.goto('/politique-de-confidentialite')
			const phrase = page.getByText(/Lors d'une connexion avec Google/)
			await expect(phrase).toHaveCount(1)
			await expect(phrase).toContainText('sans identifiant ni donnée sur vous')
			await expect(phrase).toContainText(
				"il est effacé à votre retour sur le site, et au plus tard à la fermeture de l'onglet"
			)
		})

		test('auth_error : la page de connexion reçue avec une erreur de NextAuth l’envoie une fois par chargement, avec un code connu ; une valeur inconnue devient « erreur-inconnue » ; la session expirée garde son seul événement', async ({
			page,
		}) => {
			await visiteurReel(page)
			const erreursAuth = () => evenements('auth_error')
			const INDISPONIBLE = 'Le service est momentanément indisponible, réessaie dans quelques minutes.'
			const INCONNUE = 'Une erreur est survenue, réessaie dans quelques minutes.'
			for (const [valeur, code, message] of [
				// the names NextAuth sends a failed Google sign-in back with
				['OAuthCallback', 'service-indisponible', INDISPONIBLE],
				['Callback', 'service-indisponible', INDISPONIBLE],
				['OAuthSignin', 'service-indisponible', INDISPONIBLE],
				// a name without a code of ours, then anything typed in the URL
				['OAuthAccountNotLinked', 'erreur-inconnue', INCONNUE],
				['jeanne%40example.test', 'erreur-inconnue', INCONNUE],
			]) {
				await piloter('/__umami/reset')
				await page.goto(`/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=${valeur}`)
				await expect(page.getByTestId('signin-url-error')).toHaveText(message)
				await expect.poll(erreursAuth, valeur).toEqual([{ code }])
				await pageCalme(page)
				expect(await erreursAuth(), valeur).toEqual([{ code }])
				// no Google sign-in was started in this tab: no login_result
				expect(await connexions(), valeur).toEqual([])
			}
			// what was typed in the URL never leaves
			expect(JSON.stringify(await envoisRecus())).not.toContain('jeanne')

			// a reload is another page load: counted once more
			await aller(page, page.url())
			await expect.poll(erreursAuth).toEqual([{ code: 'erreur-inconnue' }, { code: 'erreur-inconnue' }])

			// the session that ended is counted by session_expired alone
			await piloter('/__umami/reset')
			await page.goto('/auth/signin?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil')
			await expect.poll(() => evenements('session_expired')).toEqual([{ where: 'middleware' }])
			await pageCalme(page)
			expect(await erreursAuth()).toEqual([])

			// without an error: nothing
			await aller(page, '/auth/signin')
			await pageCalme(page)
			expect(await erreursAuth()).toEqual([])
		})

		test('« Ne plus mesurer mes visites » : aucun envoi', async ({ page }) => {
			const suivi = suivreRequetes(page)
			await visiteurReel(page)
			await page.addInitScript(() => window.localStorage.setItem('umami.disabled', '1'))
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
	return !!window.next && !!racine && Object.keys(racine).some(cle => cle.startsWith('__reactContainer'))
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
	test('la page est hydratée pendant que /u/script.js attend encore', async ({ page }) => {
		// /script.js reaches the fake Umami, which does not answer
		await piloter('/__umami/retenir')
		const finies = new Set()
		page.on('requestfinished', requete => finies.add(requete))
		page.on('requestfailed', requete => finies.add(requete))
		for (const chemin of ['/', '/a-propos']) {
			const script = page.waitForRequest(r => new URL(r.url()).pathname === '/u/script.js')
			await page.goto(chemin, { waitUntil: 'domcontentloaded' })
			await page.waitForFunction(hydratee)
			// only the load event waits for Umami
			expect(await page.evaluate(() => document.readyState), chemin).toBe('interactive')
			expect(finies.has(await script), chemin).toBe(false)
		}
		expect((await recus()).filter(r => r.chemin === '/script.js')).toHaveLength(2)
	})

	test.describe('visiteur réel', () => {
		test.use({ userAgent: CHROME })

		test('un événement suivi avant l’arrivée du script part quand il arrive', async ({ page }) => {
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
			const evenement = async () => (await envoisRecus()).find(e => e.corps.payload.name === 'not_found')
			await expect.poll(evenement).toBeTruthy()
			expect((await evenement()).corps.payload).toMatchObject({
				website: WEBSITE_ID,
				tag: VERSION,
				data: { kind: 'autre' },
			})
			// and the page view, once the page has loaded
			await expect.poll(async () => (await envoisRecus()).some(e => !e.corps.payload.name)).toBe(true)
		})
	})
})

function registermesure1Scenario1() {
	test('la page vue passe par /u/api/send et arrive au faux Umami, nettoyée', async ({ page, context }) => {
		const suivi = suivreRequetes(page)
		await visiteurReel(page)
		await context.addCookies([{ name: 'mm-test', value: 'valeur-privee', url: APP }])
		const envoi = page.waitForResponse(r => r.url() === `${APP}/u/api/send` && r.request().method() === 'POST')
		await page.goto('/?utm_source=regression&utm_campaign=mes-10&code=secret-123#ancre')
		expect(await page.evaluate(() => navigator.webdriver)).toBe(false)
		expect((await envoi).status()).toBe(200)

		// the page view: the only send without an event name
		const pageVue = async () => (await envoisRecus()).find(e => !e.corps.payload.name)
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
}

function registermesure1Scenario2() {
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

		const pageVue = async () => (await envoisRecus()).find(e => !e.corps.payload.name)
		await expect.poll(pageVue).toBeTruthy()
		const { payload } = (await pageVue()).corps
		expect(payload.referrer).toBe(GOOGLE)
		// the referrer domain Umami 3.2 derives (send route): « google. »
		// in it puts the visit in the organic search channel
		const domaine = new URL(payload.referrer, `https://${payload.hostname}`).hostname.replace(/^www\./, '')
		expect(domaine).toBe('com.google.android.googlequicksearchbox')
	})
}

function registermesure1Scenario3() {
	test('Web Vitals : un événement « web-vitals » par mesure, page sans query', async ({ page }) => {
		await visiteurReel(page)
		await page.goto('/blog?utm_source=regression')
		await expect
			.poll(async () =>
				(await envoisRecus()).filter(e => e.corps.payload.name === 'web-vitals').map(e => e.corps.payload.data.name)
			)
			.toContain('TTFB')
		const vitals = (await envoisRecus()).filter(e => e.corps.payload.name === 'web-vitals')
		for (const { corps } of vitals) {
			expect(Object.keys(corps.payload.data).sort()).toEqual(['name', 'page', 'rating', 'value'])
			expect(corps.payload.data.page).toBe('/blog')
			expect(['good', 'needs-improvement', 'poor']).toContain(corps.payload.data.rating)
			expect(typeof corps.payload.data.value).toBe('number')
			expect(corps.payload.tag).toBe(VERSION)
		}
	})
}

function registermesure1Scenario4() {
	test('session expirée (RG-08) : session_expired part une fois, avec l’endroit lu dans ?ou= (api_401 sans ?ou= ou hors catalogue)', async ({
		page,
	}) => {
		await visiteurReel(page)
		const expirations = async () =>
			(await envoisRecus()).filter(e => e.corps.payload.name === 'session_expired').map(e => e.corps.payload.data)
		for (const [ou, where] of [
			['middleware', 'middleware'],
			['jwt_expire', 'jwt_expire'],
			['api_401', 'api_401'],
			[null, 'api_401'],
			['ailleurs', 'api_401'],
		]) {
			await piloter('/__umami/reset')
			await page.goto(`/auth/signin?error=session-expiree${ou ? `&ou=${ou}` : ''}&callbackUrl=%2Fauth%2Fprofil`)
			await expect(page.locator('[data-cy="signin-url-error"]')).toHaveText('Ta session a expiré, reconnecte-toi.')
			await expect.poll(expirations).toEqual([{ where }])
			await page.waitForLoadState('networkidle')
			expect(await expirations()).toEqual([{ where }])
		}
	})
}

function registermesure1Scenario5({ suivreEnvois, etapeDuNom, finDeLInscription }) {
	test('onboarding_source : la réponse part une fois, seulement quand le nom est enregistré', async ({ page }) => {
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
		const envois = (await envoisRecus()).filter(e => e.corps.payload.name === 'onboarding_source')
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
}

function registermesure1Scenario6({ suivreEnvois, etapeDuNom, question, finDeLInscription }) {
	test('onboarding_source : réponse effacée, l’inscription se termine et rien ne part', async ({ page }) => {
		const apres = suivreEnvois(page)
		await visiteurReel(page)
		await etapeDuNom(page, 'sans-origine@test.local')
		const effacer = page.getByTestId('onboarding-source-effacer')
		await expect(effacer).toHaveCount(0)
		await page.getByTestId('onboarding-source-ecole').check()
		await effacer.click()
		await expect(question(page).getByRole('radio', { checked: true })).toHaveCount(0)
		await expect(effacer).toHaveCount(0)
		await expect(page.getByTestId('onboarding-source-instagram')).toBeFocused()

		await page.getByTestId('submit').click()
		await finDeLInscription(page, apres)
		expect(await evenements('onboarding_source')).toEqual([])
	})
}

function registermesure1Scenario7({ suivreEnvois, question, finDeLInscription }) {
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
}

function registermesure1Scenario8({ suivreEnvois, espaceCompte, rienDePersonnel }) {
	test('profile_visibility : un envoi par bascule de vue, double clic compris ; aucun au chargement, au rechargement ni au retour du navigateur', async ({
		page,
	}) => {
		const apres = suivreEnvois(page)
		const visibilite = () => evenements('profile_visibility')
		await visiteurReel(page)
		expect(await connecter(page)).toBe(true)
		// a page before her space, for the Back button
		await page.goto('/')
		await espaceCompte(page, '/auth/profil')
		expect(await visibilite()).toEqual([])

		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await apres('profile_visibility', { public: true })
		await page.getByTestId('profil-edit-view').click()
		await expect(page).not.toHaveURL(/publicView/)
		await apres('profile_visibility', { public: false })
		expect(await visibilite()).toEqual([{ public: true }, { public: false }])

		// a double click: two clicks before the view has switched, one send
		await page.getByTestId('profil-public-view').evaluate(lien => {
			lien.click()
			lien.click()
		})
		await expect(page).toHaveURL(/publicView=true/)
		await expect(page.getByTestId('profil-edit-view')).toBeVisible()
		await expect.poll(async () => (await visibilite()).length).toBe(3)
		await page.waitForLoadState('networkidle')
		await apres('profile_visibility', { public: true })
		expect(await visibilite()).toEqual([{ public: true }, { public: false }, { public: true }])

		// Back leaves her space (no history entry per switch), Forward and
		// a reload load the public view again: nothing more is sent
		await page.goBack()
		await expect(page).toHaveURL(url => url.pathname === '/')
		await page.goForward()
		await expect(page).toHaveURL(/\/auth\/profil\?publicView=true/)
		await expect(page.getByTestId('profil-edit-view')).toBeVisible()
		await espaceCompte(page, '/auth/profil?publicView=true')
		await expect(page.getByTestId('profil-edit-view')).toBeVisible()
		await page.waitForLoadState('networkidle')
		expect(await visibilite()).toHaveLength(3)
		await rienDePersonnel()
	})
}

function registermesure1Scenario9({
	presquePubliable,
	suivreEnvois,
	espaceCompte,
	texte,
	publiables,
	decrire,
	rienDePersonnel,
}) {
	test('profile_publiable : seulement au passage à publiable, un seul envoi sans propriété ; ni échec, ni rechargement, ni perte d’un critère', async ({
		page,
	}) => {
		await presquePubliable()
		const apres = suivreEnvois(page)
		await visiteurReel(page)
		expect(await connecter(page)).toBe(true)
		await espaceCompte(page, '/auth/profil')

		// the save fails: still one criterion short, nothing is sent
		await panne({ patch: 500 })
		await page.getByTestId('update-description-button').click()
		await page.getByTestId('description-input').fill(texte(200))
		await page.getByTestId('save-button-description').click()
		await expect(page.getByTestId('save-error')).toBeVisible()
		await apres('profile_save', { section: 'description', ok: false })
		await page.keyboard.press('Escape')
		await expect(page.getByTestId('description-input')).toBeHidden()
		await panne({ patch: null })
		expect(await publiables()).toEqual([])

		await decrire(page, apres, texte(200))
		await apres('profile_publiable')
		expect(await publiables()).toEqual([{}])

		// still publiable after another save, or after a reload: nothing
		await decrire(page, apres, texte(210))
		await espaceCompte(page, '/auth/profil')
		expect(await publiables()).toEqual([{}])

		// a save that breaks a criterion: a loss is never counted
		await decrire(page, apres, 'Maquilleuse à Annecy.')
		expect(await publiables()).toEqual([{}])
		await rienDePersonnel()
	})
}

function registermesure1Scenario10({
	presquePubliable,
	suivreEnvois,
	espaceCompte,
	decrire,
	texte,
	publiables,
	sauver,
	rienDePersonnel,
}) {
	test('profile_publiable : sans canal de contact ni formulaire de devis en ligne, la description complète ne suffit pas ; Instagram ajouté, un envoi', async ({
		page,
	}) => {
		// the test build has NEXT_PUBLIC_DEVIS_FORM_URL empty: the quote
		// form does not count as a contact channel, as on her public page
		await presquePubliable({
			network: { instagram: '', email: '', phone: '' },
		})
		const apres = suivreEnvois(page)
		await visiteurReel(page)
		expect(await connecter(page)).toBe(true)
		await espaceCompte(page, '/auth/profil')

		await decrire(page, apres, texte(200))
		expect(await publiables()).toEqual([])

		await sauver(page, apres, {
			bouton: 'update-social-medias-button',
			champ: 'instagram-input',
			valeur: 'https://www.instagram.com/studio.test',
			section: { cy: 'social-medias', nom: 'reseaux' },
		})
		await apres('profile_publiable')
		expect(await publiables()).toEqual([{}])
		await rienDePersonnel()
	})
}

function registermesure1Scenario11({ suivreEnvois, espaceCompte, rienDePersonnel }) {
	test('upload_error : un envoi de photo refusé par l’API part avec son genre, 413 → size, 400 → type, 503 → server', async ({
		page,
	}) => {
		const apres = suivreEnvois(page)
		await visiteurReel(page)
		expect(await connecter(page)).toBe(true)
		await espaceCompte(page, '/auth/profil')
		await page.getByTestId('update-resume-button').click()
		const portrait = await sharp({
			create: {
				width: 600,
				height: 600,
				channels: 3,
				background: { r: 200, g: 120, b: 160 },
			},
		})
			.png()
			.toBuffer()
		await page.getByTestId('file-main-upload').setInputFiles({
			name: 'portrait.png',
			mimeType: 'image/png',
			buffer: portrait,
		})
		// compressed and shown: a save now sends it
		await expect(page.getByTestId('modal-panel').getByAltText('photo de profil')).toHaveAttribute('src', /^blob:/)

		// each save sends the picture again, refused with that status
		for (const [status, kind, message] of [
			[413, 'size', /dépasse 10 Mo/],
			[400, 'type', /n'a pas été acceptée/],
			[503, 'server', /L'envoi de la photo a échoué/],
		]) {
			await panne({ upload: status })
			await page.getByTestId('save-button-resume').click()
			await expect(page.getByTestId('save-error')).toHaveText(message)
			await apres('upload_error', { kind })
		}
		expect(await evenements('upload_error')).toEqual([{ kind: 'size' }, { kind: 'type' }, { kind: 'server' }])
		await rienDePersonnel()
	})
}
