/**
 * The read-only probes of the live site (tests/probes/, plan 02 §7.6 R01, R03, R04, ticket 155).
 *
 * The site is simulated: under `bun test` nothing leaves this machine, and a request that
 * nothing simulates fails the test (tests/support/outgoing-http.ts). Every profile is fictional.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { FROZEN_URL_FAMILIES, familiesFor } from '../../src/lib/frozen-urls'
import {
	probeR06,
	readCertificate,
	readerRdap,
	recordEnd,
	remainingDays,
	savedDomain,
	watchOf,
} from '../probes/certificates'
import { fingerprint, profilePaths, readHtml } from '../probes/content'
import {
	checkRequest,
	ForbiddenRequest,
	keep,
	PROBE_AGENT,
	probeTarget,
	RefusedTarget,
	STATS_PATH,
	type Transport,
} from '../probes/guard'
import { headerDefaults, probeR05, SECURITY_HEADERS } from '../probes/headers'
import {
	draw,
	formatReport,
	launchProbes,
	probeApi,
	probeR01,
	probeR03,
	probeR04,
	profileDefaults,
	UNKNOWN_URL_START,
	unknownUrls,
} from '../probes/probes'
import { compare, probeR02, slugPublishable } from '../probes/publishable-profiles'
import { type Clock, createReader, ReadTooLong, shortestGap } from '../probes/reader'
import type { Verdict } from '../probes/result'
import { testConfiguration } from '../support/e2e'
import { checkTarget, RefusedEnvironment } from '../support/environment-guard'
import { delay, HttpResponse, http, simulate } from '../support/outgoing-http'

const ROOT = path.resolve(import.meta.dir, '../..')
const TARGET = new URL('https://site-sonde.example.test')

/** Seven fictional profiles, as the sitemap of the simulated site lists them. */
const PROFILES = Array.from({ length: 7 }, (_vide, rang) => `/profil/maquilleuse-fictive-${rang + 1}`)

/** A clock that only moves when the reader waits: the gaps it records are the ones the reader chose. */
function fakeClock(): Clock {
	let now = 0
	return {
		maintenant: () => now,
		attendre: async ms => {
			now += ms
		},
	}
}

/** Always the same draw: the first item left. */
const first = () => 0

const sitemap = (chemins: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		`  <url><loc>${TARGET.origin}</loc></url>`,
		`  <url><loc>${TARGET.origin}/talent/maquillage-mariee</loc></url>`,
		...chemins.map(chemin => `  <url><loc>${TARGET.origin}${chemin}</loc></url>`),
		'</urlset>',
	].join('\n')

/** A profile page as a server renders it: the data of the page in a script, where `null` is normal. */
const profilePage = (corps = '<h1>Maquilleuse fictive</h1><p>Mariage et soirée, à Annecy</p>'): string =>
	[
		'<!doctype html><html lang="fr"><head>',
		'<title>Maquilleuse fictive - My-Makeup</title>',
		'<meta name="description" content="Maquilleuse professionnelle à Annecy">',
		'</head><body>',
		corps,
		'<script id="__NEXT_DATA__" type="application/json">{"props":{"ville":null,"note":"undefined"}}</script>',
		'</body></html>',
	].join('')

/** The five headers of the v3, as the simulated site sends them. */
const SITE_HEADERS: Record<string, string> = {
	'strict-transport-security': 'max-age=31536000',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=()',
	'content-security-policy-report-only': "default-src 'self'",
}
const CLOSED_LISTS = ['/api/admins', '/api/pros', '/api/auth-events']

const NOW = new Date('2026-10-15T08:00:00Z')
const insideValue = (joursACompter: number): Date => new Date(NOW.getTime() + joursACompter * 86_400_000)
const rdap = (fin: Date) => ({
	statut: 200,
	corps: JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: fin.toISOString() }] }),
})

/** Certificates and domains that are fine for 200 days: no test of the full run reaches the network. */
const OTHER_PROBES = {
	certificat: async () => insideValue(200),
	domaine: async () => rdap(insideValue(200)),
	maintenant: () => NOW,
}

interface Site {
	/** Each request the simulated site received, as `METHOD /path`. */
	recues: string[]
}

/**
 * The simulated site: its sitemap, a page per profile, and a 404 for anything else. `pages`
 * replaces the answer to a path.
 */
function simulateSite(pages: Record<string, (request: Request) => Response> = {}): Site {
	const site: Site = { recues: [] }
	simulate(
		http.all(`${TARGET.origin}/*`, ({ request }) => {
			const { pathname } = new URL(request.url)
			site.recues.push(`${request.method} ${pathname}`)
			const page = pages[pathname]
			if (page) return page(request)
			if (pathname === '/') return HttpResponse.html('<h1>Accueil</h1>', { headers: SITE_HEADERS })
			if (CLOSED_LISTS.includes(pathname)) return HttpResponse.json({ errors: [] }, { status: 403 })
			if (pathname === STATS_PATH) return HttpResponse.json({ errors: [] }, { status: 401 })
			if (pathname === '/sitemap.xml') return HttpResponse.xml(sitemap(PROFILES))
			if (PROFILES.includes(pathname)) return HttpResponse.html(profilePage())
			return HttpResponse.html('<h1>Page introuvable</h1>', { status: 404 })
		})
	)
	return site
}

const siteReader = () => createReader({ lecture: keep(TARGET), horloge: fakeClock() })

/** A transport that records and never sends. */
function recorder(): { transport: Transport; recues: { adresse: URL; init: RequestInit }[] } {
	const received: { adresse: URL; init: RequestInit }[] = []
	return {
		recues: received,
		transport: async (adresse, init) => {
			received.push({ adresse, init })
			return new Response('ok', { status: 200 })
		},
	}
}

describe('R01 : toute requête autre qu’une lecture est interrompue, la mesure d’audience est bloquée', () => {
	test.each([
		'POST',
		'PUT',
		'PATCH',
		'DELETE',
		'OPTIONS',
		'HEAD',
		'post',
	])('une requête %s est interrompue avant le transport', async methode => {
		const { transport, recues: received } = recorder()

		await expect(keep(TARGET, transport)('/contact', { method: methode })).rejects.toThrow(ForbiddenRequest)
		expect(received).toEqual([])
	})

	test('une requête POST donnée comme un objet Request est interrompue aussi', async () => {
		const { transport, recues: received } = recorder()
		const write = new Request(`${TARGET.origin}/api/sendMail`, { method: 'POST', body: '{"message":"factice"}' })

		await expect(keep(TARGET, transport)(write)).rejects.toThrow(ForbiddenRequest)
		expect(received).toEqual([])
	})

	test.each([
		'/u',
		'/u/script.js',
		'/u/api/send',
		'/u/autre-chemin',
		'/u?parametre=1',
		'/%75/script.js',
		'/blog/../u/script.js',
		'/u//api/send',
	])('une lecture vers la mesure d’audience est interrompue : %s', async chemin => {
		const { transport, recues: received } = recorder()

		await expect(keep(TARGET, transport)(chemin)).rejects.toThrow('la mesure d’audience est bloquée')
		expect(received).toEqual([])
	})

	test('chaque adresse de la mesure dans la table des URL gelées est bloquée', () => {
		const analytics = FROZEN_URL_FAMILIES.filter(famille =>
			famille.patterns.some(motif => motif === '/u' || motif.startsWith('/u/'))
		)
		const examples = analytics.flatMap(famille => famille.examples.map(({ from }) => from))

		expect(analytics.map(famille => famille.id)).toEqual(['mesure-script', 'mesure-envoi', 'mesure-autre'])
		for (const example of examples) expect(() => checkRequest(example, {}, TARGET)).toThrow(ForbiddenRequest)
	})

	test.each([
		['une adresse complète', 'https://mesure.example.test/script.js'],
		['un objet URL', new URL('https://mesure.example.test/api/send')],
		['un objet Request', new Request('https://mesure.example.test/script.js')],
		['le même hôte en http', 'http://site-sonde.example.test/'],
		['un sous-domaine de la cible', 'https://www.site-sonde.example.test/'],
	])('une lecture vers un autre hôte est interrompue : %s', async (_cas, entree) => {
		const { transport, recues: received } = recorder()

		await expect(keep(TARGET, transport)(entree)).rejects.toThrow('une sonde ne lit que la cible')
		expect(received).toEqual([])
	})

	test.each(['cookie', 'Authorization'])('une lecture qui porte l’en-tête %s est interrompue', async nom => {
		const { transport, recues: received } = recorder()

		await expect(keep(TARGET, transport)('/', { headers: { [nom]: 'valeur-factice' } })).rejects.toThrow(
			ForbiddenRequest
		)
		expect(received).toEqual([])
	})

	test('une lecture passe : un GET sur la cible, sans suivre de redirection, au nom des sondes', async () => {
		const { transport, recues: received } = recorder()

		const response = await keep(TARGET, transport)('/profil/maquilleuse-fictive-1', { redirect: 'follow' })

		expect(response.status).toBe(200)
		expect(received).toHaveLength(1)
		const [{ adresse: url, init } = { adresse: new URL(TARGET), init: {} }] = received
		expect(url.href).toBe(`${TARGET.origin}/profil/maquilleuse-fictive-1`)
		expect(init.method).toBe('GET')
		expect(init.redirect).toBe('manual')
		expect(init.body).toBeUndefined()
		expect(new Headers(init.headers).get('user-agent')).toBe(PROBE_AGENT)
	})

	test('rien ne part vers le site : ni l’écriture, ni la mesure ; la lecture, elle, arrive', async () => {
		const site = simulateSite()
		const reading = keep(TARGET)

		await expect(reading('/contact', { method: 'POST', body: 'message=factice' })).rejects.toThrow(ForbiddenRequest)
		await expect(reading('/u/api/send', { method: 'POST', body: '{}' })).rejects.toThrow(ForbiddenRequest)
		await expect(reading('/u/script.js')).rejects.toThrow(ForbiddenRequest)
		expect(site.recues).toEqual([])

		expect((await reading('/sitemap.xml')).status).toBe(200)
		expect(site.recues).toEqual(['GET /sitemap.xml'])
	})

	test('R01 est verte avec la garde des sondes', async () => {
		const r01 = await probeR01(TARGET)

		expect(r01.verdict).toBe('vert')
		expect(r01.constats[0]).toContain('toutes interrompues avant de partir')
		expect(r01.constats).toContain('une lecture (GET /) passe la garde, et le jeton passe vers les statistiques seules')
	})

	test('une garde qui laisse passer une écriture rend R01 rouge, et aucune requête ne part', async () => {
		const site = simulateSite()
		const sieve: typeof keep =
			(cible, transport = fetch) =>
			(entree, init) =>
				transport(new URL(String(entree), cible), init ?? {})

		const report = await launchProbes({
			cible: TARGET,
			garde: sieve,
			horloge: fakeClock(),
			...OTHER_PROBES,
		})

		expect(report.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 rouge',
			'R02 non lancée',
			'R03 non lancée',
			'R04 non lancée',
			'R05 non lancée',
			'R06 non lancée',
		])
		expect(report.resultats[0]?.constats).toContain('laissée passer : POST')
		expect(report.vert).toBe(false)
		expect(report.requetes).toBe(0)
		expect(site.recues).toEqual([])
	})

	test('une sonde qui tente une écriture est rouge et arrête la suite', async () => {
		const site = simulateSite()
		// A transport that turns every read into a write: the guard stands before it, so this never sends.
		const guard: typeof keep = (cible, transport, jeton) => {
			const reading = keep(cible, transport, jeton)
			return (entree, init) => (init?.signal ? reading(entree, { ...init, method: 'POST' }) : reading(entree, init))
		}

		const report = await launchProbes({ cible: TARGET, garde: guard, horloge: fakeClock(), ...OTHER_PROBES })

		expect(report.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 vert',
			'R02 inconnu',
			'R03 rouge',
			'R04 non lancée',
			'R05 non lancée',
			'R06 non lancée',
		])
		expect(report.resultats[2]?.constats[0]).toStartWith('Requête POST interrompue')
		expect(site.recues).toEqual([])
	})
})

describe('R03 : des profils au hasard répondent 200, avec un h1 dans le HTML serveur, sans « undefined » ni « null »', () => {
	test('le sitemap donne les chemins des profils, sans les autres pages ni doublon', () => {
		const xml = `${sitemap(PROFILES)}\n<url><loc>${TARGET.origin}${PROFILES[0]}</loc></url><url><loc>https://autre.example.test/profil/a&amp;b</loc></url>`

		expect(profilePaths(xml)).toEqual([...PROFILES, '/profil/a&b'])
	})

	test('cinq profils tirés au hasard, chacun lu une fois : verte', async () => {
		const site = simulateSite()

		const r03 = await probeR03(siteReader(), first)

		expect(r03.verdict).toBe('vert')
		expect(site.recues).toEqual(['GET /sitemap.xml', ...PROFILES.slice(0, 5).map(chemin => `GET ${chemin}`)])
		expect(r03.constats[0]).toBe('7 profils dans /sitemap.xml, 5 tirés au hasard')
		expect(r03.constats.slice(1)).toEqual(
			PROFILES.slice(0, 5).map(
				chemin => `profil #${fingerprint(chemin)} : 200, h1 présent, ni « undefined » ni « null »`
			)
		)
	})

	test('le tirage est sans remise, et prend tout quand il y a moins de profils que demandé', () => {
		const suite = [0.99, 0, 0.5]
		const random = () => suite.shift() ?? 0

		expect(draw(['a', 'b', 'c', 'd'], 3, random)).toEqual(['d', 'a', 'c'])
		expect(draw(['a', 'b'], 5, Math.random).sort()).toEqual(['a', 'b'])
		expect(draw(['a'], 1, () => 1)).toEqual(['a'])
	})

	test('le rapport ne recopie jamais l’adresse d’un profil : une empreinte la remplace', async () => {
		simulateSite()

		const report = await launchProbes({
			cible: TARGET,
			horloge: fakeClock(),
			hasard: first,
			...OTHER_PROBES,
		})
		const text = formatReport(report)

		expect(text).not.toContain('maquilleuse-fictive')
		expect(text).toContain(`profil #${fingerprint(PROFILES[0] ?? '')}`)
		// The example of docs/tests/sondes.md, where `printf %s <chemin> | sha256sum | cut -c1-8` gives the same.
		expect(fingerprint('/profil/zoe-lefevre')).toBe('02d9dcb6')
	})

	test.each([
		['« null » dans le texte', '<h1>Maquilleuse fictive</h1><p>Se déplace à null km</p>', '« null » une fois (texte)'],
		['« undefined » dans le texte', '<h1>undefined</h1>', '« undefined » une fois (texte)'],
		[
			'deux textes voisins',
			'<h1>Maquilleuse fictive</h1><p><span>Annecy</span><span>null</span></p>',
			'« null » une fois (texte)',
		],
		[
			'un texte alternatif',
			'<h1>Maquilleuse fictive</h1><img src="/photo.webp" alt="undefined">',
			'« undefined » une fois (alt)',
		],
		['aucun h1', '<p>Maquilleuse fictive</p>', 'aucun h1 dans le HTML serveur'],
		['un h1 vide', '<h1> </h1><p>Maquilleuse fictive</p>', 'aucun h1 dans le HTML serveur'],
		[
			'un h1 écrit par le navigateur seulement',
			'<div id="racine"></div><script>document.getElementById("racine").innerHTML = "<h1>Maquilleuse</h1>"</script>',
			'aucun h1 dans le HTML serveur',
		],
	])('rouge sur %s', (_cas, corps, defaut) => {
		expect(
			profileDefaults({
				chemin: '/profil/x',
				statut: 200,
				type: 'text/html; charset=utf-8',
				corps: profilePage(corps),
				entetes: new Headers(),
			})
		).toEqual([defaut])
	})

	test('les données de la page, dans ses scripts, et les mots qui contiennent « null » ne comptent pas', () => {
		const html = profilePage('<h1>Maquilleuse fictive</h1><p>Rendez-vous annulé ; nullement pressée.</p>')

		expect(readHtml(html)).toEqual({ titresH1: 1, occurrences: [] })
	})

	test('le titre et les balises meta comptent', () => {
		const html =
			'<html><head><title>null - My-Makeup</title><meta property="og:description" content="Maquilleuse à undefined"></head><body><h1>Maquilleuse fictive</h1></body></html>'

		expect(readHtml(html).occurrences).toEqual([
			{ mot: 'null', lieu: 'texte', nombre: 1 },
			{ mot: 'undefined', lieu: 'content d’une balise meta', nombre: 1 },
		])
	})

	test.each([
		[308, 'réponse 308, 200 attendu'],
		[404, 'réponse 404, 200 attendu'],
		[500, 'réponse 500, 200 attendu'],
	])('rouge quand un profil répond %i, sans suivre de redirection', async (statut, defaut) => {
		const filePath = PROFILES[0] ?? ''
		const site = simulateSite({
			[filePath]: () => new HttpResponse(null, { status: statut, headers: { location: '/profil/autre-nom' } }),
		})

		const r03 = await probeR03(siteReader(), first, 1)

		expect(r03.verdict).toBe('rouge')
		expect(r03.constats[1]).toBe(`profil #${fingerprint(filePath)} : ${defaut}`)
		expect(site.recues).not.toContain('GET /profil/autre-nom')
	})

	test('rouge quand un profil n’est pas une page HTML', () => {
		expect(
			profileDefaults({
				chemin: '/profil/x',
				statut: 200,
				type: 'application/json',
				corps: '{}',
				entetes: new Headers(),
			})
		).toEqual(['pas une page HTML (application/json)'])
	})

	test('rouge quand le sitemap ne répond pas, ou ne liste aucun profil', async () => {
		simulateSite({ '/sitemap.xml': () => new HttpResponse(null, { status: 500 }) })
		expect((await probeR03(siteReader(), first)).constats).toEqual(['/sitemap.xml : réponse 500'])

		simulateSite({ '/sitemap.xml': () => HttpResponse.xml(sitemap([])) })
		const r03 = await probeR03(siteReader(), first)
		expect(r03.verdict).toBe('rouge')
		expect(r03.constats).toEqual(['aucun profil dans /sitemap.xml'])
	})

	test('un profil qui ne répond pas est rouge, les autres sont lus', async () => {
		const filePath = PROFILES[0] ?? ''
		simulateSite({ [filePath]: () => HttpResponse.error() })

		const r03 = await probeR03(siteReader(), first, 2)

		expect(r03.verdict).toBe('rouge')
		expect(r03.constats[1]).toStartWith(`profil #${fingerprint(filePath)} : `)
		expect(r03.constats[2]).toBe(
			`profil #${fingerprint(PROFILES[1] ?? '')} : 200, h1 présent, ni « undefined » ni « null »`
		)
	})
})

describe('R04 : une adresse inconnue répond 404', () => {
	test('une adresse à la racine et une sous /profil/, au nom tiré au hasard : verte sur deux 404', async () => {
		const site = simulateSite()

		const r04 = await probeR04(siteReader(), first)

		const name = `${UNKNOWN_URL_START}-aaaaaaaaaa`
		expect(r04.verdict).toBe('vert')
		expect(r04.constats).toEqual([`/${name} : 404`, `/profil/${name} : 404`])
		expect(site.recues).toEqual([`GET /${name}`, `GET /profil/${name}`])
	})

	test('les adresses changent à chaque lancement', () => {
		expect(unknownUrls(Math.random)).not.toEqual(unknownUrls(Math.random))
	})

	test('la table des URL gelées promet 404 pour ces adresses, aujourd’hui et après la bascule', () => {
		const [root = '', profile = ''] = unknownUrls(Math.random)
		const in404 = (adresse: string) =>
			familiesFor(adresse).filter(famille => famille.status === 404 && famille.statusToday.includes(404))

		expect(in404(root).map(famille => famille.id)).toEqual(['adresse-inconnue'])
		expect(in404(profile).map(famille => famille.id)).toContain('slug-inconnu')
	})

	test.each([
		[200, 'réponse 200, 404 attendu'],
		[301, 'réponse 301, 404 attendu'],
		[500, 'réponse 500, 404 attendu'],
	])('rouge quand une adresse inconnue répond %i', async (statut, constat) => {
		const name = `/${UNKNOWN_URL_START}-aaaaaaaaaa`
		simulateSite({ [name]: () => new HttpResponse('Accueil', { status: statut, headers: { location: '/' } }) })

		const r04 = await probeR04(siteReader(), first)

		expect(r04.verdict).toBe('rouge')
		expect(r04.constats[0]).toBe(`${name} : ${constat}`)
	})
})

describe('Deux requêtes par seconde au plus, une à la fois', () => {
	test('un lancement entier : 16 requêtes, toujours 500 ms au moins entre deux départs', async () => {
		const site = simulateSite()

		const report = await launchProbes({
			cible: TARGET,
			horloge: fakeClock(),
			hasard: first,
			...OTHER_PROBES,
		})

		expect(report.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 vert',
			'R02 inconnu',
			'R03 vert',
			'R04 vert',
			'R05 vert',
			'R06 vert',
		])
		// Without a token R02 is `inconnu`: not a pass, not an alert either.
		expect(report.vert).toBe(false)
		expect(report.rouge).toBe(false)
		expect(report.requetes).toBe(16)
		expect(site.recues).toHaveLength(16)
		expect(site.recues.every(recue => recue.startsWith('GET '))).toBe(true)
		expect(report.ecartMinimalMs).toBe(500)
		expect(report.dureeMs).toBe(15 * 500)
		expect(formatReport(report)).toContain('16 requêtes GET en 7,5 s, 500 ms au moins entre deux requêtes')
		expect(formatReport(report)).toContain('Aucune sonde rouge, mais 1 inconnue : ce n’est pas un vert.')
	})

	test('des lectures demandées ensemble partent l’une après l’autre, jamais deux à la fois', async () => {
		let inCourse = 0
		let atMost = 0
		const slow: Transport = async () => {
			inCourse += 1
			atMost = Math.max(atMost, inCourse)
			await Promise.resolve()
			inCourse -= 1
			return new Response('ok')
		}
		const reader = createReader({ lecture: keep(TARGET, slow), horloge: fakeClock() })

		await Promise.all(['/a', '/b', '/c', '/d'].map(chemin => reader.lire(chemin)))

		expect(atMost).toBe(1)
		expect(reader.departs).toEqual([0, 500, 1000, 1500])
		expect(shortestGap(reader.departs)).toBe(500)
	})

	test('une lecture en échec ne bloque pas les suivantes', async () => {
		const { transport } = recorder()
		const reader = createReader({ lecture: keep(TARGET, transport), horloge: fakeClock() })

		await expect(reader.lire('/u/script.js')).rejects.toThrow(ForbiddenRequest)
		expect((await reader.lire('/')).statut).toBe(200)
	})

	test('un site muet est abandonné au bout du délai', async () => {
		simulate(
			http.get(`${TARGET.origin}/*`, async () => {
				await delay('infinite')
				return HttpResponse.html('jamais')
			})
		)
		const reader = createReader({ lecture: keep(TARGET), horloge: fakeClock(), delaiMs: 20 })

		await expect(reader.lire('/')).rejects.toThrow(ReadTooLong)
	})
})

describe('La cible des sondes', () => {
	test.each([
		['https://my-makeup.fr', 'https://my-makeup.fr'],
		['https://my-makeup.fr/', 'https://my-makeup.fr'],
		['http://localhost:3100', 'http://localhost:3100'],
		['http://127.0.0.1:3100/', 'http://127.0.0.1:3100'],
	])('accepte %s', (valeur, origine) => {
		expect(probeTarget(valeur).origin).toBe(origine)
	})

	test.each([
		['un site en ligne en http', 'http://my-makeup.fr'],
		['un chemin', 'https://my-makeup.fr/profil'],
		['un paramètre', 'https://my-makeup.fr/?x=1'],
		['un identifiant', 'https://visiteuse:factice@my-makeup.fr'],
		['un autre protocole', 'ftp://my-makeup.fr'],
		['une adresse sans protocole', 'my-makeup.fr'],
	])('refuse %s', (_cas, valeur) => {
		expect(() => probeTarget(valeur)).toThrow(RefusedTarget)
	})
})

describe('U86 : la garde des essais de bout en bout refuse toujours la prod', () => {
	test('la prod, que les sondes lisent, reste refusée aux essais', () => {
		expect(probeTarget('https://my-makeup.fr').hostname).toBe('my-makeup.fr')
		expect(() => checkTarget('https://my-makeup.fr')).toThrow('BASE_URL vise la prod')
		expect(() =>
			testConfiguration({ PROBES_TARGET: 'https://my-makeup.fr', BASE_URL: 'https://www.my-makeup.fr' })
		).toThrow(RefusedEnvironment)
	})

	test('ni Playwright ni bun test ne ramassent les sondes : aucun fichier d’essai dans tests/probes', () => {
		const files = readdirSync(path.join(ROOT, 'tests/probes'))

		expect(files).toContain('probes.ts')
		expect(files.filter(fichier => /\.(spec|test)\.tsx?$/.test(fichier))).toEqual([])
	})
})

describe('R01 : aucune sonde ne contourne la garde', () => {
	/** Ways out of this machine other than the transport of the guard. */
	const OUTPUTS = [
		/\bfetch\s*\(/,
		/\bBun\.fetch\b/,
		/['"](?:node:)?https?['"]/,
		/['"]undici['"]/,
		/\bXMLHttpRequest\b/,
		/['"](?:node:)?(?:net|tls|dns|dgram|http2)['"]/,
		/\bBun\.(?:connect|listen|spawn)\b/,
	]

	test('seule la garde appelle fetch ; aucun autre fichier des sondes n’ouvre de connexion, sauf la poignée TLS de R06', () => {
		const folder = path.join(ROOT, 'tests/probes')
		const faulty = readdirSync(folder)
			.filter(fichier => fichier !== 'guard.ts' && fichier !== 'certificates.ts')
			.flatMap(fichier => {
				const text = readFileSync(path.join(folder, fichier), 'utf8')
				return OUTPUTS.filter(sortie => sortie.test(text)).map(sortie => `${fichier} : ${sortie}`)
			})

		expect(faulty).toEqual([])
		expect(readFileSync(path.join(folder, 'guard.ts'), 'utf8').match(/\bfetch\s*\(/g)).toHaveLength(1)
	})
})

test('R06 : seul certificates.ts ouvre une connexion TLS, une seule, sans rien y envoyer', () => {
	const text = readFileSync(path.join(ROOT, 'tests/probes/certificates.ts'), 'utf8')

	expect(text.match(/\btls\.connect\(/g)).toHaveLength(1)
	expect(text).not.toMatch(/\bfetch\s*\(|\.write\(|\bnet\b|\bBun\./)
})

/* ------------------------------------------------------------------------------------------
 * The token of the service (R02)
 * ---------------------------------------------------------------------------------------- */

const TOKEN = 'jeton-factice-du-test-0123456789abcdef'

describe('Le jeton du service ne part que vers les statistiques', () => {
	test('il passe vers /api/stats/weekly, sur la cible, en GET', async () => {
		const { transport, recues: received } = recorder()

		await keep(
			TARGET,
			transport,
			TOKEN
		)(`${STATS_PATH}?from=a&to=b`, {
			headers: { authorization: `Bearer ${TOKEN}` },
		})

		expect(received).toHaveLength(1)
		expect(new Headers(received[0]?.init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
	})

	test.each([
		['sur une autre page', '/', `Bearer ${TOKEN}`],
		['sur la mesure d’audience', '/u/script.js', `Bearer ${TOKEN}`],
		['sur une autre route de l’API', '/api/pros', `Bearer ${TOKEN}`],
		['avec un autre jeton', STATS_PATH, 'Bearer un-autre-jeton'],
		['sans le mot Bearer', STATS_PATH, TOKEN],
	])('il est refusé %s', async (_cas, chemin, valeur) => {
		const { transport, recues: received } = recorder()

		await expect(keep(TARGET, transport, TOKEN)(chemin, { headers: { authorization: valeur } })).rejects.toThrow(
			ForbiddenRequest
		)
		expect(received).toEqual([])
	})

	test('sans jeton réglé, rien ne passe avec Authorization, même vers les statistiques', async () => {
		const { transport, recues: received } = recorder()

		await expect(
			keep(TARGET, transport)(STATS_PATH, { headers: { authorization: `Bearer ${TOKEN}` } })
		).rejects.toThrow(ForbiddenRequest)
		expect(received).toEqual([])
	})

	test('le jeton ne va jamais vers un autre hôte', async () => {
		const { transport, recues: received } = recorder()

		await expect(
			keep(
				TARGET,
				transport,
				TOKEN
			)(`https://autre.example.test${STATS_PATH}`, {
				headers: { authorization: `Bearer ${TOKEN}` },
			})
		).rejects.toThrow(ForbiddenRequest)
		expect(received).toEqual([])
	})

	test('un cookie reste refusé, jeton ou non', async () => {
		const { transport, recues: received } = recorder()

		await expect(
			keep(TARGET, transport, TOKEN)(STATS_PATH, { headers: { cookie: 'session=factice' } })
		).rejects.toThrow(ForbiddenRequest)
		expect(received).toEqual([])
	})
})

/* ------------------------------------------------------------------------------------------
 * R02: the sitemap against the publishable profiles
 * ---------------------------------------------------------------------------------------- */

const statsResponse =
	(slugs: readonly string[]): (() => Response) =>
	() =>
		HttpResponse.json({ version: 1, publiables: { slugs, parDepartement: {} } })

const SLUGS = PROFILES.map(chemin => chemin.replace('/profil/', ''))

const readerWithToken = () => createReader({ lecture: keep(TARGET, undefined, TOKEN), horloge: fakeClock() })
const r02Probe = (jeton?: string | null) =>
	probeR02(readerWithToken(), { jeton: jeton === null ? undefined : (jeton ?? TOKEN), maintenant: () => NOW })

describe('R02 : le sitemap et les profils publiables sont les mêmes', () => {
	test('sans jeton : inconnu, pas vert, et aucune requête ne part', async () => {
		const site = simulateSite()

		for (const token of [null, '']) {
			const r02 = await r02Probe(token)

			expect(r02.verdict).toBe('inconnu')
			expect(r02.constats[0]).toContain('pas de jeton (PROBES_STATS_TOKEN)')
		}
		expect(site.recues).toEqual([])
	})

	test('égalité exacte : vert, le jeton part vers les statistiques seules, sur une période de 7 jours', async () => {
		let header: string | null = null
		let url = ''
		const site = simulateSite({
			[STATS_PATH]: request => {
				header = request.headers.get('authorization')
				url = request.url
				return statsResponse(SLUGS)()
			},
		})

		const r02 = await r02Probe()

		expect(r02.verdict).toBe('vert')
		expect(r02.constats).toEqual([
			`${PROFILES.length} profils dans /sitemap.xml, ${PROFILES.length} profils publiables`,
			'égalité exacte',
		])
		expect(site.recues).toEqual(['GET /sitemap.xml', `GET ${STATS_PATH}`])
		expect(header as string | null).toBe(`Bearer ${TOKEN}`)
		const period = new URL(url).searchParams
		expect(period.get('to')).toBe(NOW.toISOString())
		expect(period.get('from')).toBe(insideValue(-7).toISOString())
	})

	test('un profil du sitemap qui n’est pas publiable : rouge, par son empreinte, jamais par son adresse', async () => {
		simulateSite({ [STATS_PATH]: statsResponse(SLUGS.slice(1)) })

		const r02 = await r02Probe()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats).toContain(
			`1 dans le sitemap mais non publiable (empreintes : #${fingerprint(PROFILES[0] ?? '')})`
		)
		expect(r02.constats.join(' ')).not.toContain('maquilleuse-fictive')
	})

	test('un profil publiable absent du sitemap : rouge', async () => {
		simulateSite({ [STATS_PATH]: statsResponse([...SLUGS, 'maquilleuse-fictive-8']) })

		const r02 = await r02Probe()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats[1]).toStartWith('1 publiable absent du sitemap')
	})

	test('même nombre, autres profils : rouge (l’égalité est celle des adresses, pas seulement du compte)', async () => {
		simulateSite({ [STATS_PATH]: statsResponse([...SLUGS.slice(1), 'maquilleuse-fictive-8']) })

		const r02 = await r02Probe()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats[0]).toBe(`${PROFILES.length} profils dans /sitemap.xml, ${PROFILES.length} profils publiables`)
		expect(r02.constats).toHaveLength(3)
	})

	test.each([
		['jeton refusé', () => HttpResponse.json({}, { status: 401 }), 'refuse le jeton (401)'],
		['route absente', () => HttpResponse.html('introuvable', { status: 404 }), 'répond 404, 200 attendu'],
		['réponse sans la liste', () => HttpResponse.json({ version: 1 }), 'n’a pas la forme attendue'],
		['réponse illisible', () => HttpResponse.html('pas du JSON'), 'n’a pas la forme attendue'],
	])('%s : rouge, et le jeton n’est jamais dans le rapport', async (_cas, reponse, texte) => {
		simulateSite({ [STATS_PATH]: reponse })

		const r02 = await r02Probe()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats.join(' ')).toContain(texte)
		expect(r02.constats.join(' ')).not.toContain(TOKEN)
	})

	test('un sitemap en erreur : rouge', async () => {
		simulateSite({ '/sitemap.xml': () => HttpResponse.html('', { status: 500 }) })

		expect((await r02Probe()).constats).toEqual(['/sitemap.xml : réponse 500'])
	})

	test('comparer et slugsPubliables', () => {
		expect(compare(['/a', '/b'], ['/b', '/a'])).toEqual({
			egal: true,
			constats: ['2 profils dans /sitemap.xml, 2 profils publiables', 'égalité exacte'],
		})
		expect(compare([], []).egal).toBe(true)
		expect(compare(['/a'], []).egal).toBe(false)
		expect(slugPublishable('{"publiables":{"slugs":["a","b"]}}')).toEqual(['a', 'b'])
		expect(slugPublishable('{"publiables":{"slugs":[1]}}')).toBeUndefined()
		expect(slugPublishable('{"publiables":[]}')).toBeUndefined()
		expect(slugPublishable('[')).toBeUndefined()
	})

	test('le jeton est lu par la commande dans PROBES_STATS_TOKEN seulement : le .env n’est jamais lu', () => {
		const text = readFileSync(path.join(ROOT, 'tests/probes/probes.ts'), 'utf8')

		expect(text).toContain('process.env[TOKEN_NAME]')
		expect(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).toContain('"probes": "bun --no-env-file')
	})
})

/* ------------------------------------------------------------------------------------------
 * R05: headers, closed lists, old routes, Strapi
 * ---------------------------------------------------------------------------------------- */

const API = new URL('https://api-sonde.example.test')

/** Strapi's API as it answers an anonymous visitor today. */
function simulateStrapi(reponses: Record<string, number> = {}): string[] {
	const received: string[] = []
	simulate(
		http.all(`${API.origin}/*`, ({ request }) => {
			const { pathname } = new URL(request.url)
			received.push(`${request.method} ${pathname}`)
			const status = reponses[pathname] ?? (pathname === '/documentation' ? 404 : 403)
			return HttpResponse.json({ error: { status: status } }, { status: status })
		})
	)
	return received
}

describe('R05 : en-têtes présents, listes privées fermées, anciennes routes en 404', () => {
	const apiReader = () => createReader({ lecture: keep(API), horloge: fakeClock() })

	test('le site fermé comme il faut : vert, 9 lectures', async () => {
		const site = simulateSite()

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('vert')
		expect(site.recues).toEqual([
			'GET /',
			'GET /api/admins',
			'GET /api/pros',
			'GET /api/auth-events',
			`GET ${STATS_PATH}`,
			'GET /api/upload/files',
			'GET /api/users',
			'GET /documentation',
		])
		expect(r05.constats).toContain('partie Strapi non jouée (pas d’API Strapi à lire)')
	})

	test.each([...SECURITY_HEADERS])('l’en-tête %s absent de l’accueil : rouge, il est nommé', async nom => {
		const { [nom]: _retire, ...headers } = SITE_HEADERS
		simulateSite({ '/': () => HttpResponse.html('<h1>Accueil</h1>', { headers: headers }) })

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats[0]).toBe(`/ : en-tête absent : ${nom}`)
	})

	test('x-powered-by présent, ou nosniff faussé : rouge', async () => {
		simulateSite({
			'/': () =>
				HttpResponse.html('<h1>Accueil</h1>', {
					headers: { ...SITE_HEADERS, 'x-powered-by': 'Next.js', 'x-content-type-options': 'sniff' },
				}),
		})

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats[0]).toContain('x-content-type-options n’est pas « nosniff »')
		expect(r05.constats[0]).toContain('en-tête x-powered-by présent')
	})

	test('une accueil qui redirige n’est pas un accueil avec ses en-têtes : rouge', async () => {
		simulateSite({ '/': () => new Response(null, { status: 308, headers: { location: '/accueil' } }) })

		expect((await probeR05({ site: siteReader() })).constats[0]).toBe('/ : réponse 308, 200 attendu')
	})

	test.each([
		'/api/admins',
		'/api/pros',
		'/api/auth-events',
	])('la liste privée %s qui répond 200 : rouge', async chemin => {
		simulateSite({ [chemin]: () => HttpResponse.json({ docs: [] }) })

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(`${chemin} : réponse 200, 401 ou 403 attendu (liste privée fermée)`)
	})

	test('401 et 403 sont deux façons de fermer une liste', async () => {
		simulateSite({ '/api/pros': () => HttpResponse.json({}, { status: 401 }) })

		expect((await probeR05({ site: siteReader() })).verdict).toBe('vert')
	})

	test.each([
		'/api/upload/files',
		'/api/users',
		'/documentation',
	])('l’ancienne route %s qui répond encore : rouge', async chemin => {
		simulateSite({ [chemin]: () => HttpResponse.json({}, { status: 403 }) })

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(`${chemin} : réponse 403, 404 attendu (ancienne route disparue)`)
	})

	test('les statistiques ouvertes sans jeton : rouge', async () => {
		simulateSite({ [STATS_PATH]: () => HttpResponse.json({}) })

		expect((await probeR05({ site: siteReader() })).verdict).toBe('rouge')
	})

	test('un site muet : rouge sur chaque ligne, sans arrêter les suivantes', async () => {
		const site = simulateSite({ '/api/pros': () => HttpResponse.error() })

		const r05 = await probeR05({ site: siteReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats.find(constat => constat.startsWith('/api/pros'))).toBeDefined()
		expect(site.recues).toHaveLength(8)
	})

	test('tant que Strapi tourne : /api/upload/files et /api/users en 403, /documentation en 404', async () => {
		simulateSite()
		const strapi = simulateStrapi()

		const r05 = await probeR05({ site: siteReader(), strapi: apiReader() })

		expect(r05.verdict).toBe('vert')
		expect(strapi).toEqual(['GET /api/upload/files', 'GET /api/users', 'GET /documentation'])
		expect(r05.constats).toContain('Strapi /api/upload/files : 403 (API Strapi)')
		expect(r05.constats.some(constat => constat.includes('non jouée'))).toBe(false)
	})

	test.each([
		['/api/upload/files', 200, 'Strapi /api/upload/files : réponse 200, 403 attendu (API Strapi)'],
		['/api/users', 200, 'Strapi /api/users : réponse 200, 403 attendu (API Strapi)'],
		['/documentation', 200, 'Strapi /documentation : réponse 200, 404 attendu (API Strapi)'],
	])('Strapi qui ouvre %s : rouge', async (chemin, statut, constat) => {
		simulateSite()
		simulateStrapi({ [chemin]: statut })

		const r05 = await probeR05({ site: siteReader(), strapi: apiReader() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(constat)
	})

	test('l’API de Strapi : celle du vrai site par défaut, aucune sur demande, aucune ailleurs', () => {
		const prod = probeTarget('https://my-makeup.fr')

		expect(probeApi(undefined, prod)?.origin).toBe('https://api.my-makeup.fr')
		expect(probeApi('aucune', prod)).toBeUndefined()
		expect(probeApi('https://api-autre.example.test', prod)?.origin).toBe('https://api-autre.example.test')
		expect(probeApi(undefined, TARGET)).toBeUndefined()
		expect(probeApi(undefined, probeTarget('http://localhost:3356'))).toBeUndefined()
		expect(() => probeApi('http://api.example.test', prod)).toThrow(RefusedTarget)
	})

	test('un lancement avec l’API de Strapi lit les deux origines, 500 ms d’écart sur chacune', async () => {
		simulateSite()
		const strapi = simulateStrapi()

		const report = await launchProbes({
			cible: TARGET,
			api: API,
			horloge: fakeClock(),
			hasard: first,
			...OTHER_PROBES,
		})

		expect(report.resultats.find(({ id }) => id === 'R05')?.verdict).toBe('vert')
		expect(strapi).toHaveLength(3)
		expect(report.requetes).toBe(19)
		expect(report.ecartMinimalMs).toBe(500)
	})

	test('defautsDEntetes', () => {
		expect(headerDefaults(new Headers(SITE_HEADERS))).toEqual([])
		expect(headerDefaults(new Headers())).toHaveLength(SECURITY_HEADERS.length)
	})
})

/* ------------------------------------------------------------------------------------------
 * R06: certificates and domains
 * ---------------------------------------------------------------------------------------- */

describe('R06 : certificats sous 21 jours, domaines sous 30 jours', () => {
	const surveillance = { hotes: ['site.example.test', 'photos.example.test'], domaines: ['example.test'] }
	const launch = (certificat: (hote: string) => Promise<Date>, domaine: Parameters<typeof probeR06>[0]['domaine']) =>
		probeR06({ surveillance, certificat, domaine, maintenant: () => NOW })

	test('tout est loin : vert', async () => {
		const r06 = await launch(
			async () => insideValue(80),
			async () => rdap(insideValue(400))
		)

		expect(r06.verdict).toBe('vert')
		expect(r06.constats).toEqual([
			'certificat de site.example.test : valable encore 80 jours',
			'certificat de photos.example.test : valable encore 80 jours',
			'domaine example.test : enregistré encore 400 jours',
		])
	})

	test.each<[number, Verdict]>([
		[30, 'vert'],
		[21, 'vert'],
		[20.9, 'rouge'],
		[5, 'rouge'],
		[-1, 'rouge'],
	])('un certificat à %p jours : %s', async (jours, verdict) => {
		const r06 = await launch(
			async hote => (hote === 'photos.example.test' ? insideValue(jours) : insideValue(90)),
			async () => rdap(insideValue(400))
		)

		expect(r06.verdict).toBe(verdict)
		if (verdict === 'rouge') expect(r06.constats[1]).toContain('alerte sous 21 jours')
	})

	test.each<[number, Verdict]>([
		[90, 'vert'],
		[30, 'vert'],
		[29.9, 'rouge'],
		[3, 'rouge'],
		[-2, 'rouge'],
	])('un domaine à %p jours : %s', async (jours, verdict) => {
		const r06 = await launch(
			async () => insideValue(90),
			async () => rdap(insideValue(jours))
		)

		expect(r06.verdict).toBe(verdict)
		if (verdict === 'rouge') expect(r06.constats[2]).toContain('alerte sous 30 jours')
	})

	test('un certificat que la poignée refuse : rouge, avec la raison', async () => {
		const r06 = await launch(
			async hote => {
				if (hote === 'site.example.test') throw new Error('certificate has expired')
				return insideValue(90)
			},
			async () => rdap(insideValue(400))
		)

		expect(r06.verdict).toBe('rouge')
		expect(r06.constats[0]).toBe('certificat de site.example.test : refusé (certificate has expired)')
	})

	test('un registre qui ne répond pas, ou sans date : inconnu, jamais vert', async () => {
		for (const domain of [
			async () => ({ statut: 503, corps: '' }),
			async () => ({ statut: 200, corps: '{"events":[]}' }),
			async () => ({ statut: 200, corps: 'pas du JSON' }),
			async () => undefined,
		]) {
			const r06 = await launch(async () => insideValue(90), domain)

			expect(r06.verdict).toBe('inconnu')
			expect(r06.constats[2]).toStartWith('domaine example.test : ')
		}
	})

	test('un registre injoignable : inconnu', async () => {
		const r06 = await launch(
			async () => insideValue(90),
			async () => {
				throw new Error('boum')
			}
		)

		expect(r06.verdict).toBe('inconnu')
		expect(r06.constats[2]).toBe('domaine example.test : registre injoignable (Error : boum)')
	})

	test('rouge l’emporte sur inconnu', async () => {
		const r06 = await launch(
			async () => insideValue(2),
			async () => undefined
		)

		expect(r06.verdict).toBe('rouge')
	})

	test('un lancement entier : le site, sa copie www, l’API, les photos et Umami ; ses domaines', () => {
		const prod = watchOf(probeTarget('https://my-makeup.fr'), new URL('https://api.my-makeup.fr'))

		expect(prod?.hotes).toEqual([
			'my-makeup.fr',
			'www.my-makeup.fr',
			'api.my-makeup.fr',
			'r2-my-makeup.andy-cinquin.fr',
			'umami.wadefade.fr',
		])
		expect(prod?.domaines).toEqual(['my-makeup.fr', 'andy-cinquin.fr', 'wadefade.fr'])
		expect(watchOf(probeTarget('https://my-makeup.fr'))?.hotes).not.toContain('api.my-makeup.fr')
		expect(watchOf(probeTarget('https://temporaire.example.test'))?.hotes).toEqual([
			'temporaire.example.test',
			'r2-my-makeup.andy-cinquin.fr',
			'umami.wadefade.fr',
		])
		expect(watchOf(probeTarget('http://localhost:3356'))).toBeUndefined()
		expect(savedDomain('a.b.example.fr')).toBe('example.fr')
	})

	test('sur une cible locale : R06 est inconnue, rien ne part vers un certificat', async () => {
		const local = new URL('http://localhost:3356')
		simulate(http.all(`${local.origin}/*`, () => HttpResponse.html('<h1>x</h1>', { status: 404 })))
		const certificate = async (): Promise<Date> => {
			throw new Error('ne doit pas être appelé')
		}

		const report = await launchProbes({
			cible: local,
			horloge: fakeClock(),
			certificat: certificate,
			domaine: async () => undefined,
		})

		expect(report.resultats.find(({ id }) => id === 'R06')).toMatchObject({ verdict: 'inconnu' })
	})

	test('le registre est lu par un GET gardé, un registre à la fois ; une extension inconnue ne part nulle part', async () => {
		const received: string[] = []
		simulate(
			http.get('https://rdap.nic.fr/domain/:domaine', ({ request, params }) => {
				received.push(`${params.domaine} ${request.headers.get('user-agent')}`)
				return HttpResponse.json({ events: [{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }] })
			})
		)
		const read = readerRdap(undefined, fakeClock())

		const response = await read('example.fr')

		expect(response?.statut).toBe(200)
		expect(recordEnd(response?.corps ?? '')?.toISOString()).toBe('2030-01-01T00:00:00.000Z')
		expect(received).toEqual([`example.fr ${PROBE_AGENT}`])
		expect(await read('example.xyz')).toBeUndefined()
	})

	test('joursRestants et finDeLEnregistrement', () => {
		expect(remainingDays(new Date('2026-11-05T08:00:00Z'), NOW)).toBe(21)
		expect(recordEnd('{"events":[{"eventAction":"registration","eventDate":"2001-01-01T00:00:00Z"}]}')).toBeUndefined()
		expect(recordEnd('{"events":[{"eventAction":"expiration","eventDate":"pas une date"}]}')).toBeUndefined()
	})
})

describe('R06 : la poignée TLS lit la date de fin du certificat', () => {
	let folder: string | undefined
	let server: tls.Server | undefined

	afterEach(() => {
		server?.close()
		server = undefined
		if (folder) rmSync(folder, { recursive: true, force: true })
		folder = undefined
	})

	/** A local authority and a server certificate for `localhost`, good for 10 days. Skipped without openssl. */
	function certificateLocal(): { cle: string; certificat: string } | undefined {
		try {
			folder = mkdtempSync(path.join(tmpdir(), 'sonde-tls-'))
			execFileSync(
				'openssl',
				[
					'req',
					'-x509',
					'-newkey',
					'rsa:2048',
					'-nodes',
					'-days',
					'10',
					'-keyout',
					path.join(folder, 'cle.pem'),
					'-out',
					path.join(folder, 'certificat.pem'),
					'-subj',
					'/CN=localhost',
					'-addext',
					'subjectAltName=DNS:localhost',
				],
				{ stdio: 'ignore' }
			)
			return {
				cle: readFileSync(path.join(folder, 'cle.pem'), 'utf8'),
				certificat: readFileSync(path.join(folder, 'certificat.pem'), 'utf8'),
			}
		} catch {
			return undefined
		}
	}

	test('un certificat que la chaîne accepte : sa date de fin, environ 10 jours', async () => {
		const pair = certificateLocal()
		if (!pair) return
		server = tls.createServer({ key: pair.cle, cert: pair.certificat }, socket => socket.end())
		await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
		const port = (server.address() as { port: number }).port

		const end = await readCertificate({ ca: pair.certificat, port })('localhost')

		expect(remainingDays(end, new Date())).toBeGreaterThan(9)
		expect(remainingDays(end, new Date())).toBeLessThan(10.1)
	})

	test('un certificat que la chaîne refuse (autorité inconnue) : la poignée échoue, la sonde est rouge', async () => {
		const pair = certificateLocal()
		if (!pair) return
		server = tls.createServer({ key: pair.cle, cert: pair.certificat }, socket => socket.end())
		await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
		const port = (server.address() as { port: number }).port

		await expect(readCertificate({ port })('localhost')).rejects.toThrow()
	})
})
