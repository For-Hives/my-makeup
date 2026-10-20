import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
	adresseDuVisiteur,
	DELAI_DU_RELAIS_MS,
	enTetesDuRelais,
	relayerLEnvoi,
	relayerLeScript,
} from '@/lib/analytics/relay'
import {
	BEFORE_SEND_NAME,
	DEFAULT_UMAMI_DOMAINS,
	UMAMI_LOADER_SOURCE,
	UMAMI_WEBSITE_ID,
	umamiDomains,
	umamiLoaderScript,
	umamiScriptAttributes,
	umamiTag,
	WAITING_ROOM_NAME,
} from '@/lib/analytics/umami'
import {
	EnvError,
	parseServerEnv,
	type RawEnv,
	SITE_ORIGIN,
	UMAMI_ORIGIN_DEFAULT,
	type UmamiEnv,
	umamiFromEnv,
} from '@/lib/env'
import { delay, HttpResponse, http, simuler } from '../outils/http-sortant'

// Made-up instance: a name that never resolves, simulated by the tests.
const INSTANCE = 'https://umami.exemple.test'
const REEL: UmamiEnv = { origin: INSTANCE, local: false }
// The bench keeps the cookies a simulated answer sets, per host: the send tests have an instance of their own.
const AUTRE_INSTANCE = 'https://umami-envoi.exemple.test'
const LOCAL: UmamiEnv = { origin: 'http://127.0.0.1:4200', local: true }
const DU_SITE = { host: 'my-makeup.fr' }

const BASE: RawEnv = {
	DATABASE_URI: 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test',
	PAYLOAD_SECRET: 'k'.repeat(64),
}

describe('UMAMI_ORIGIN (ticket 111)', () => {
	test('set, it is read in its exact form; a path is allowed, a query is not', () => {
		expect(umamiFromEnv(INSTANCE, undefined)).toEqual(REEL)
		expect(umamiFromEnv(`${INSTANCE}/umami`, undefined)).toEqual({ origin: `${INSTANCE}/umami`, local: false })
		expect(umamiFromEnv('http://127.0.0.1:4200', undefined)).toEqual(LOCAL)
		for (const refused of [
			`${INSTANCE}/`,
			`${INSTANCE}?a=1`,
			`${INSTANCE}#x`,
			'http://umami.exemple.test',
			'umami.exemple.test',
			'https://user:mdp@umami.exemple.test',
			'ftp://umami.exemple.test',
		])
			expect(umamiFromEnv(refused, undefined)).toBeUndefined()
	})

	test('unset, the live instance is the default on the site and nowhere else', () => {
		expect(umamiFromEnv(undefined, SITE_ORIGIN)).toEqual({ origin: UMAMI_ORIGIN_DEFAULT, local: false })
		expect(umamiFromEnv('  ', SITE_ORIGIN)).toEqual({ origin: UMAMI_ORIGIN_DEFAULT, local: false })
		expect(umamiFromEnv(undefined, 'https://v3.my-makeup.fr')).toBeUndefined()
		expect(umamiFromEnv(undefined, 'http://localhost:3000')).toBeUndefined()
		expect(umamiFromEnv(undefined, undefined)).toBeUndefined()
	})

	test('an origin the server cannot read stops it at start, naming the variable and not the value', () => {
		const message = (() => {
			try {
				parseServerEnv({ ...BASE, UMAMI_ORIGIN: 'https://secret-hote.exemple.test/?cle=abc' })
			} catch (error) {
				if (error instanceof EnvError) return error
				throw error
			}
			throw new Error('accepted')
		})()
		expect(message.variables).toEqual(['UMAMI_ORIGIN'])
		expect(message.message).not.toContain('secret-hote')
		expect(message.message).not.toContain('cle=abc')
	})

	test('the checked environment carries the instance, or nothing', () => {
		expect(parseServerEnv(BASE).umami).toBeUndefined()
		expect(parseServerEnv({ ...BASE, UMAMI_ORIGIN: INSTANCE }).umami).toEqual(REEL)
		expect(parseServerEnv({ ...BASE, UMAMI_ORIGIN: 'http://127.0.0.1:4200' }).umami).toEqual(LOCAL)
	})

	test('on the site, an instance of this machine is refused; unset it is the live instance', () => {
		const site = {
			...BASE,
			NODE_ENV: 'production',
			NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
			EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
			SMTP_HOST: 'relais.exemple.test',
			SMTP_PASSWORD: 'x'.repeat(20),
			SMTP_PORT: '465',
			SMTP_USER: 'resend',
		}
		expect(() => parseServerEnv({ ...site, UMAMI_ORIGIN: 'http://127.0.0.1:4200' })).toThrow(EnvError)
		expect(parseServerEnv(site).umami).toEqual({ origin: UMAMI_ORIGIN_DEFAULT, local: false })
	})
})

describe('l’étiquette et les domaines du script', () => {
	test('sans réglage, Umami ne compte que les deux noms du site', () => {
		expect(umamiDomains(undefined)).toEqual([...DEFAULT_UMAMI_DOMAINS])
		expect(umamiDomains('pas un nom !, ')).toEqual([...DEFAULT_UMAMI_DOMAINS])
		expect(umamiDomains(' Localhost, 127.0.0.1,localhost ')).toEqual(['localhost', '127.0.0.1'])
	})

	test('l’étiquette est la version, coupée à 50 caractères et sans les caractères que refuse Umami', () => {
		expect(umamiTag('4d70990')).toBe('4d70990')
		expect(umamiTag('=-@ 4d70990')).toBe('4d70990')
		expect(umamiTag('a'.repeat(80))).toHaveLength(50)
		expect(umamiTag('  ')).toBe('unknown')
		expect(umamiTag(undefined)).toBe('unknown')
	})

	test('les attributs : l’identifiant du site, le chemin /u, le filtre, l’étiquette du commit', () => {
		const attributs = umamiScriptAttributes({
			version: { commit: '4d70990f1f2e3d4c5b6a79881726354433221100' },
		})
		expect(attributs).toEqual({
			src: '/u/script.js',
			'data-website-id': UMAMI_WEBSITE_ID,
			'data-host-url': '/u',
			'data-domains': 'my-makeup.fr,www.my-makeup.fr',
			'data-tag': '4d70990',
			'data-before-send': BEFORE_SEND_NAME,
		})
	})
})

/** A window just big enough for the inline script, and what it did. */
function fenetre(surcharge: { webdriver?: boolean; agent?: string; cadre?: boolean; desactive?: boolean } = {}) {
	const ecouteurs: Record<string, () => void> = {}
	const script = {
		attributs: {} as Record<string, string>,
		async: false,
		setAttribute(nom: string, valeur: string) {
			this.attributs[nom] = valeur
		},
		addEventListener(nom: string, fn: () => void) {
			ecouteurs[nom] = fn
		},
	}
	const pose: unknown[] = []
	const suivis: { nom: string; donnees: unknown }[] = []
	const w: Record<string, unknown> = {
		navigator: { webdriver: surcharge.webdriver ?? false, userAgent: surcharge.agent ?? 'Mozilla/5.0 Firefox/130.0' },
		localStorage: { getItem: (cle: string) => (surcharge.desactive && cle === 'umami.disabled' ? '1' : null) },
		location: { href: 'https://my-makeup.fr/profil/exemple?q=maquillage&utm_source=insta&gclid=abc#haut' },
		document: {
			createElement: () => script,
			head: { appendChild: (element: unknown) => pose.push(element) },
		},
	}
	w.self = w
	w.top = surcharge.cadre ? {} : w
	new Function('window', umamiLoaderScript(umamiScriptAttributes({ version: { buildVersion: 'v-test' } })))(w)
	return {
		w,
		script,
		pose,
		suivis,
		charger() {
			w.umami = { track: (nom: string, donnees: unknown) => suivis.push({ nom, donnees }) }
			ecouteurs.load?.()
		},
		echouer: () => ecouteurs.error?.(),
		filtre: (type: string, charge: unknown) =>
			(w[BEFORE_SEND_NAME] as (type: string, charge: unknown) => unknown)(type, charge),
		salle: (nom: string, donnees: unknown) =>
			(w[WAITING_ROOM_NAME] as (nom: string, donnees: unknown) => boolean)(nom, donnees),
	}
}

describe('le script de l’en-tête de chaque page', () => {
	test('aucune syntaxe après ES2019 : un `?.` ou un `??` casse Safari avant 13.4', () => {
		expect(UMAMI_LOADER_SOURCE).not.toContain('?.')
		expect(UMAMI_LOADER_SOURCE).not.toContain('??')
		expect(UMAMI_LOADER_SOURCE).not.toContain('=>')
		expect(UMAMI_LOADER_SOURCE).not.toMatch(/\b(let|const|class)\b/)
	})

	test('il ajoute le script d’Umami, asynchrone, avec ses attributs', () => {
		const { script, pose } = fenetre()
		expect(pose).toEqual([script])
		expect(script.async).toBe(true)
		expect(script.attributs['data-before-send']).toBe(BEFORE_SEND_NAME)
		expect(script.attributs['data-tag']).toBe('v-test')
		expect(script.attributs.src).toBe('/u/script.js')
	})

	test('aucun `<` dans le texte inséré : une valeur ne peut pas fermer la balise', () => {
		const texte = umamiLoaderScript({ 'data-tag': '</script><b>' })
		expect(texte).not.toContain('</script>')
		expect(texte).toContain('\\u003c/script>')
	})

	test('le filtre nettoie l’adresse et le référent, comme avant', () => {
		const { filtre } = fenetre()
		expect(
			filtre('event', {
				url: 'https://my-makeup.fr/search?q=maquillage&utm_source=insta&utm_medium=social&gclid=abc#haut',
				referrer: 'https://www.google.com/search?q=secret#x',
				name: 'cta_click',
			})
		).toEqual({
			url: 'https://my-makeup.fr/search?utm_source=insta&utm_medium=social',
			referrer: 'https://www.google.com/search',
			name: 'cta_click',
		})
		expect(filtre('event', { referrer: 'android-app://com.google.android.googlequicksearchbox/x?y=1' })).toEqual({
			referrer: 'android-app://com.google.android.googlequicksearchbox/',
		})
	})

	test('un navigateur automatisé, un agent HeadlessChrome, une page encadrée, un refus de mesure : rien ne part', () => {
		const charge = { url: 'https://my-makeup.fr/' }
		expect(fenetre({ webdriver: true }).filtre('event', charge)).toBe(false)
		expect(fenetre({ agent: 'Mozilla/5.0 HeadlessChrome/130' }).filtre('event', charge)).toBe(false)
		expect(fenetre({ cadre: true }).filtre('event', charge)).toBe(false)
		expect(fenetre({ desactive: true }).filtre('event', charge)).toBe(false)
		expect(fenetre().filtre('event', null)).toBe(false)
	})

	test('aucun filtre des robots qui se déclarent : Googlebot et ses pairs restent comptés', () => {
		const charge = { url: 'https://my-makeup.fr/' }
		for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'bingbot/2.0', 'GPTBot/1.1', 'curl/8.0'])
			expect(fenetre({ agent }).filtre('event', charge)).toEqual(charge)
	})

	test('une erreur dans le filtre : rien ne part, et rien ne casse la page', () => {
		const { w, filtre } = fenetre()
		w.navigator = null
		expect(filtre('event', { url: 'x' })).toEqual({ url: 'https://my-makeup.fr/profil/x' })
		Object.defineProperty(w, 'location', {
			get() {
				throw new Error('boum')
			},
		})
		expect(filtre('event', { url: 'x' })).toBe(false)
	})

	test('un événement suivi avant le script attend, puis part dans l’ordre', () => {
		const f = fenetre()
		expect(f.salle('a', { n: 1 })).toBe(true)
		expect(f.salle('b', { n: 2 })).toBe(true)
		f.charger()
		expect(f.suivis).toEqual([
			{ nom: 'a', donnees: { n: 1 } },
			{ nom: 'b', donnees: { n: 2 } },
		])
		// Once the script has run, the room refuses: the caller hands the event to Umami itself.
		expect(f.salle('c', {})).toBe(false)
	})

	test('la salle d’attente tient 20 événements, et se vide si le script ne charge pas', () => {
		const pleine = fenetre()
		for (let i = 0; i < 20; i++) expect(pleine.salle('e', {})).toBe(true)
		expect(pleine.salle('e', {})).toBe(false)
		const echec = fenetre()
		expect(echec.salle('e', {})).toBe(true)
		echec.echouer()
		expect(echec.salle('e', {})).toBe(false)
	})
})

describe('l’adresse du visiteur et les en-têtes du relais', () => {
	test('l’adresse est la dernière entrée de X-Forwarded-For, jamais X-Real-IP', () => {
		expect(adresseDuVisiteur(new Headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7')
		expect(adresseDuVisiteur(new Headers({ 'x-forwarded-for': '2001:db8::7' }))).toBe('2001:db8::7')
		expect(adresseDuVisiteur(new Headers({ 'x-real-ip': '203.0.113.7' }))).toBeUndefined()
		expect(adresseDuVisiteur(new Headers({ 'x-forwarded-for': 'pas une adresse' }))).toBeUndefined()
		expect(adresseDuVisiteur(new Headers())).toBeUndefined()
	})

	test('le relais retient une liste d’en-têtes : ni cookie, ni Referer, ni adresse écrite par le navigateur', () => {
		const sortants = enTetesDuRelais(
			new Headers({
				cookie: 'session=abc',
				authorization: 'Bearer x',
				'proxy-authorization': 'Basic x',
				referer: 'https://my-makeup.fr/auth/profil?x=1',
				origin: 'https://my-makeup.fr',
				'true-client-ip': '6.6.6.6',
				'cf-connecting-ip': '6.6.6.6',
				'x-real-ip': '6.6.6.6',
				'x-vercel-ip-country': 'US',
				host: 'my-makeup.fr',
				connection: 'keep-alive',
				'content-length': '10',
				'x-forwarded-for': '1.2.3.4, 203.0.113.7',
				'user-agent': 'Mozilla/5.0 Firefox/130.0',
				'content-type': 'application/json',
				'accept-language': 'fr-FR',
				'x-umami-cache': 'jeton',
			})
		)
		expect(Object.fromEntries(sortants)).toEqual({
			'user-agent': 'Mozilla/5.0 Firefox/130.0',
			'content-type': 'application/json',
			'accept-language': 'fr-FR',
			'x-umami-cache': 'jeton',
			'true-client-ip': '203.0.113.7',
		})
	})
})

const envoi = (entetes: Record<string, string> = {}, corps = '{"type":"event","payload":{"name":"x"}}') =>
	new Request('https://my-makeup.fr/u/api/send', { method: 'POST', body: corps, headers: { ...DU_SITE, ...entetes } })
const script = (entetes: Record<string, string> = {}) =>
	new Request('https://my-makeup.fr/u/script.js', { headers: { ...DU_SITE, ...entetes } })

describe('le relais /u/script.js', () => {
	test('sans instance réglée, 404', async () => {
		expect((await relayerLeScript(script(), { umami: undefined })).status).toBe(404)
		expect((await relayerLEnvoi(envoi(), { umami: undefined })).status).toBe(404)
	})

	test('le script de l’instance est relayé sans cookie ni Referer', async () => {
		let recu: Headers | undefined
		simuler(
			http.get(`${INSTANCE}/script.js`, ({ request }) => {
				recu = request.headers
				return new HttpResponse('window.umami={}', {
					headers: { 'Content-Type': 'text/javascript', 'Set-Cookie': 'a=b' },
				})
			})
		)
		const reponse = await relayerLeScript(
			script({ cookie: 'session=abc', referer: 'https://my-makeup.fr/auth/profil', 'x-forwarded-for': '203.0.113.7' }),
			{ umami: REEL }
		)
		expect(reponse.status).toBe(200)
		expect(await reponse.text()).toBe('window.umami={}')
		expect(reponse.headers.get('content-type')).toBe('text/javascript')
		expect(reponse.headers.get('set-cookie')).toBeNull()
		expect(recu?.has('cookie')).toBe(false)
		expect(recu?.has('referer')).toBe(false)
		expect(recu?.get('true-client-ip')).toBe('203.0.113.7')
	})

	test('hors des hôtes du site, rien ne part vers l’instance : un script vide', async () => {
		let appels = 0
		simuler(
			http.get(`${INSTANCE}/script.js`, () => {
				appels++
				return new HttpResponse('window.umami={}')
			})
		)
		for (const hote of ['v3.my-makeup.fr', 'localhost:3000', 'my-makeup.fr.exemple.test']) {
			const reponse = await relayerLeScript(
				new Request('https://x.exemple.test/u/script.js', { headers: { host: hote } }),
				{ umami: REEL }
			)
			expect(reponse.status).toBe(200)
			expect(await reponse.text()).not.toContain('umami={}')
		}
		expect(appels).toBe(0)
		// www is a host of the site.
		const www = await relayerLeScript(script({ host: 'www.my-makeup.fr' }), { umami: REEL })
		expect(await www.text()).toContain('umami={}')
		expect(appels).toBe(1)
	})

	test('l’instance de ce poste (le faux Umami) est relayée depuis n’importe quel hôte', async () => {
		simuler(http.get('http://127.0.0.1:4200/script.js', () => new HttpResponse('faux')))
		const reponse = await relayerLeScript(script({ host: 'localhost:3311' }), { umami: LOCAL })
		expect(await reponse.text()).toBe('faux')
	})

	test('une instance muette est coupée au délai, 504', async () => {
		expect(DELAI_DU_RELAIS_MS).toBe(10_000)
		simuler(
			http.get(`${INSTANCE}/script.js`, async () => {
				await delay('infinite')
				return new HttpResponse('jamais')
			})
		)
		const debut = Date.now()
		const reponse = await relayerLeScript(script(), { umami: REEL, delaiMs: 150 })
		expect(reponse.status).toBe(504)
		expect(Date.now() - debut).toBeLessThan(2000)
	})

	test('une panne, une redirection : 502, jamais suivie', async () => {
		simuler(http.get(`${INSTANCE}/script.js`, () => HttpResponse.error()))
		expect((await relayerLeScript(script(), { umami: REEL })).status).toBe(502)
		simuler(
			http.get(
				`${INSTANCE}/script.js`,
				() => new HttpResponse(null, { status: 302, headers: { Location: 'https://autre.exemple.test/' } })
			)
		)
		expect((await relayerLeScript(script(), { umami: REEL })).status).toBe(502)
	})
})

describe('le relais /u/api/send', () => {
	test('une mesure part vers l’instance avec son corps, sans cookie ni Referer, et la réponse revient', async () => {
		let recu: { entetes: Headers; corps: string } | undefined
		simuler(
			http.post(`${AUTRE_INSTANCE}/api/send`, async ({ request }) => {
				recu = { entetes: request.headers, corps: await request.text() }
				return new HttpResponse('jeton', { headers: { 'Set-Cookie': 'a=b' } })
			})
		)
		const reponse = await relayerLEnvoi(
			envoi({
				cookie: 'session=abc',
				referer: 'https://my-makeup.fr/auth/profil',
				authorization: 'Bearer x',
				'x-forwarded-for': '203.0.113.7',
				'content-type': 'application/json',
			}),
			{ umami: { origin: AUTRE_INSTANCE, local: false } }
		)
		expect(reponse.status).toBe(200)
		expect(await reponse.text()).toBe('jeton')
		expect(reponse.headers.get('set-cookie')).toBeNull()
		expect(recu?.corps).toBe('{"type":"event","payload":{"name":"x"}}')
		expect([...(recu?.entetes.keys() ?? [])].sort()).toEqual(['content-type', 'true-client-ip'].sort())
		expect(recu?.entetes.get('true-client-ip')).toBe('203.0.113.7')
	})

	test('hors des hôtes du site, la mesure est reçue et jetée : rien ne part', async () => {
		let appels = 0
		simuler(
			http.post(`${AUTRE_INSTANCE}/api/send`, () => {
				appels++
				return new HttpResponse('jeton')
			})
		)
		const reponse = await relayerLEnvoi(envoi({ host: 'v3.my-makeup.fr' }), {
			umami: { origin: AUTRE_INSTANCE, local: false },
		})
		expect(reponse.status).toBe(204)
		expect(appels).toBe(0)
	})

	test('un corps trop gros n’est pas une mesure : 413', async () => {
		const gros = 'x'.repeat(40 * 1024)
		expect((await relayerLEnvoi(envoi({}, gros), { umami: { origin: AUTRE_INSTANCE, local: false } })).status).toBe(413)
	})

	test('une instance muette est coupée au délai, 504', async () => {
		simuler(
			http.post(`${AUTRE_INSTANCE}/api/send`, async () => {
				await delay('infinite')
				return new HttpResponse('jamais')
			})
		)
		expect(
			(await relayerLEnvoi(envoi(), { umami: { origin: AUTRE_INSTANCE, local: false }, delaiMs: 150 })).status
		).toBe(504)
	})

	test('la route ne répond qu’au POST, le script qu’au GET, et le reste de /u par un 404', async () => {
		const racine = path.join(process.cwd(), 'src/app/u')
		const envoyer = await import('@/app/u/api/send/route')
		const servir = await import('@/app/u/script.js/route')
		const reste = await import('@/app/u/[[...rest]]/route')
		expect(Object.keys(envoyer).filter(nom => /^[A-Z]+$/.test(nom))).toEqual(['POST'])
		expect(Object.keys(servir).filter(nom => /^[A-Z]+$/.test(nom))).toEqual(['GET'])
		const reponse = await reste.GET()
		expect(reponse.status).toBe(404)
		// Nothing else lives under /u.
		const fichiers = readdirSync(racine, { recursive: true, withFileTypes: true })
			.filter(entree => entree.isFile())
			.map(entree => path.relative(racine, path.join(entree.parentPath, entree.name)))
			.sort()
		expect(fichiers).toEqual([
			path.join('[[...rest]]', 'route.ts'),
			path.join('api', 'send', 'route.ts'),
			path.join('script.js', 'route.ts'),
		])
		expect(readFileSync(path.join(racine, 'api/send/route.ts'), 'utf8')).toContain('POST')
	})
})
