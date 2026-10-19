/**
 * The read-only probes of the live site (tests/sondes/, plan 02 §7.6 R01, R03, R04, ticket 155).
 *
 * The site is simulated: under `bun test` nothing leaves this machine, and a request that
 * nothing simulates fails the test (tests/outils/http-sortant.ts). Every profile is fictional.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { FROZEN_URL_FAMILIES, familiesFor } from '../../src/lib/urls-gelees'
import { configurationDesEssais } from '../outils/e2e'
import { EnvironnementRefuse, verifierCible } from '../outils/garde-environnement'
import { delay, HttpResponse, http, simuler } from '../outils/http-sortant'
import {
	domaineEnregistre,
	finDeLEnregistrement,
	joursRestants,
	lecteurRdap,
	lireLeCertificat,
	sondeR06,
	surveillanceDe,
} from '../sondes/certificats'
import { cheminsDeProfils, empreinte, lireLeHtml } from '../sondes/contenu'
import { defautsDEntetes, ENTETES_DE_SECURITE, sondeR05 } from '../sondes/entetes'
import {
	AGENT_DES_SONDES,
	CHEMIN_DES_STATS,
	CibleRefusee,
	cibleDesSondes,
	controlerRequete,
	garder,
	RequeteInterdite,
	type Transport,
} from '../sondes/garde'
import { creerLecteur, ecartLePlusCourt, type Horloge, LectureTropLongue } from '../sondes/lecteur'
import { comparer, slugsPubliables, sondeR02 } from '../sondes/profils-publiables'
import type { Verdict } from '../sondes/resultat'
import {
	adressesInconnues,
	apiDesSondes,
	DEBUT_DES_ADRESSES_INCONNUES,
	defautsDUnProfil,
	formaterRapport,
	lancerLesSondes,
	sondeR01,
	sondeR03,
	sondeR04,
	tirer,
} from '../sondes/sondes'

const RACINE = path.resolve(import.meta.dir, '../..')
const CIBLE = new URL('https://site-sonde.example.test')

/** Seven fictional profiles, as the sitemap of the simulated site lists them. */
const PROFILS = Array.from({ length: 7 }, (_vide, rang) => `/profil/maquilleuse-fictive-${rang + 1}`)

/** A clock that only moves when the reader waits: the gaps it records are the ones the reader chose. */
function horlogeFactice(): Horloge {
	let maintenant = 0
	return {
		maintenant: () => maintenant,
		attendre: async ms => {
			maintenant += ms
		},
	}
}

/** Always the same draw: the first item left. */
const premier = () => 0

const sitemap = (chemins: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		`  <url><loc>${CIBLE.origin}</loc></url>`,
		`  <url><loc>${CIBLE.origin}/talent/maquillage-mariee</loc></url>`,
		...chemins.map(chemin => `  <url><loc>${CIBLE.origin}${chemin}</loc></url>`),
		'</urlset>',
	].join('\n')

/** A profile page as a server renders it: the data of the page in a script, where `null` is normal. */
const pageDeProfil = (corps = '<h1>Maquilleuse fictive</h1><p>Mariage et soirée, à Annecy</p>'): string =>
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
const ENTETES_DU_SITE: Record<string, string> = {
	'strict-transport-security': 'max-age=31536000',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=()',
	'content-security-policy-report-only': "default-src 'self'",
}
const LISTES_FERMEES = ['/api/admins', '/api/pros', '/api/auth-events']

const MAINTENANT = new Date('2026-10-15T08:00:00Z')
const dans = (joursACompter: number): Date => new Date(MAINTENANT.getTime() + joursACompter * 86_400_000)
const rdap = (fin: Date) => ({
	statut: 200,
	corps: JSON.stringify({ events: [{ eventAction: 'expiration', eventDate: fin.toISOString() }] }),
})

/** Certificates and domains that are fine for 200 days: no test of the full run reaches the network. */
const AUTRES_SONDES = {
	certificat: async () => dans(200),
	domaine: async () => rdap(dans(200)),
	maintenant: () => MAINTENANT,
}

interface Site {
	/** Each request the simulated site received, as `METHOD /path`. */
	recues: string[]
}

/**
 * The simulated site: its sitemap, a page per profile, and a 404 for anything else. `pages`
 * replaces the answer to a path.
 */
function simulerLeSite(pages: Record<string, (request: Request) => Response> = {}): Site {
	const site: Site = { recues: [] }
	simuler(
		http.all(`${CIBLE.origin}/*`, ({ request }) => {
			const { pathname } = new URL(request.url)
			site.recues.push(`${request.method} ${pathname}`)
			const page = pages[pathname]
			if (page) return page(request)
			if (pathname === '/') return HttpResponse.html('<h1>Accueil</h1>', { headers: ENTETES_DU_SITE })
			if (LISTES_FERMEES.includes(pathname)) return HttpResponse.json({ errors: [] }, { status: 403 })
			if (pathname === CHEMIN_DES_STATS) return HttpResponse.json({ errors: [] }, { status: 401 })
			if (pathname === '/sitemap.xml') return HttpResponse.xml(sitemap(PROFILS))
			if (PROFILS.includes(pathname)) return HttpResponse.html(pageDeProfil())
			return HttpResponse.html('<h1>Page introuvable</h1>', { status: 404 })
		})
	)
	return site
}

const lecteurDuSite = () => creerLecteur({ lecture: garder(CIBLE), horloge: horlogeFactice() })

/** A transport that records and never sends. */
function enregistreur(): { transport: Transport; recues: { adresse: URL; init: RequestInit }[] } {
	const recues: { adresse: URL; init: RequestInit }[] = []
	return {
		recues,
		transport: async (adresse, init) => {
			recues.push({ adresse, init })
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
		const { transport, recues } = enregistreur()

		await expect(garder(CIBLE, transport)('/contact', { method: methode })).rejects.toThrow(RequeteInterdite)
		expect(recues).toEqual([])
	})

	test('une requête POST donnée comme un objet Request est interrompue aussi', async () => {
		const { transport, recues } = enregistreur()
		const ecriture = new Request(`${CIBLE.origin}/api/sendMail`, { method: 'POST', body: '{"message":"factice"}' })

		await expect(garder(CIBLE, transport)(ecriture)).rejects.toThrow(RequeteInterdite)
		expect(recues).toEqual([])
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
		const { transport, recues } = enregistreur()

		await expect(garder(CIBLE, transport)(chemin)).rejects.toThrow('la mesure d’audience est bloquée')
		expect(recues).toEqual([])
	})

	test('chaque adresse de la mesure dans la table des URL gelées est bloquée', () => {
		const mesure = FROZEN_URL_FAMILIES.filter(famille =>
			famille.patterns.some(motif => motif === '/u' || motif.startsWith('/u/'))
		)
		const exemples = mesure.flatMap(famille => famille.examples.map(({ from }) => from))

		expect(mesure.map(famille => famille.id)).toEqual(['mesure-script', 'mesure-envoi', 'mesure-autre'])
		for (const exemple of exemples) expect(() => controlerRequete(exemple, {}, CIBLE)).toThrow(RequeteInterdite)
	})

	test.each([
		['une adresse complète', 'https://mesure.example.test/script.js'],
		['un objet URL', new URL('https://mesure.example.test/api/send')],
		['un objet Request', new Request('https://mesure.example.test/script.js')],
		['le même hôte en http', 'http://site-sonde.example.test/'],
		['un sous-domaine de la cible', 'https://www.site-sonde.example.test/'],
	])('une lecture vers un autre hôte est interrompue : %s', async (_cas, entree) => {
		const { transport, recues } = enregistreur()

		await expect(garder(CIBLE, transport)(entree)).rejects.toThrow('une sonde ne lit que la cible')
		expect(recues).toEqual([])
	})

	test.each(['cookie', 'Authorization'])('une lecture qui porte l’en-tête %s est interrompue', async nom => {
		const { transport, recues } = enregistreur()

		await expect(garder(CIBLE, transport)('/', { headers: { [nom]: 'valeur-factice' } })).rejects.toThrow(
			RequeteInterdite
		)
		expect(recues).toEqual([])
	})

	test('une lecture passe : un GET sur la cible, sans suivre de redirection, au nom des sondes', async () => {
		const { transport, recues } = enregistreur()

		const reponse = await garder(CIBLE, transport)('/profil/maquilleuse-fictive-1', { redirect: 'follow' })

		expect(reponse.status).toBe(200)
		expect(recues).toHaveLength(1)
		const [{ adresse, init } = { adresse: new URL(CIBLE), init: {} }] = recues
		expect(adresse.href).toBe(`${CIBLE.origin}/profil/maquilleuse-fictive-1`)
		expect(init.method).toBe('GET')
		expect(init.redirect).toBe('manual')
		expect(init.body).toBeUndefined()
		expect(new Headers(init.headers).get('user-agent')).toBe(AGENT_DES_SONDES)
	})

	test('rien ne part vers le site : ni l’écriture, ni la mesure ; la lecture, elle, arrive', async () => {
		const site = simulerLeSite()
		const lecture = garder(CIBLE)

		await expect(lecture('/contact', { method: 'POST', body: 'message=factice' })).rejects.toThrow(RequeteInterdite)
		await expect(lecture('/u/api/send', { method: 'POST', body: '{}' })).rejects.toThrow(RequeteInterdite)
		await expect(lecture('/u/script.js')).rejects.toThrow(RequeteInterdite)
		expect(site.recues).toEqual([])

		expect((await lecture('/sitemap.xml')).status).toBe(200)
		expect(site.recues).toEqual(['GET /sitemap.xml'])
	})

	test('R01 est verte avec la garde des sondes', async () => {
		const r01 = await sondeR01(CIBLE)

		expect(r01.verdict).toBe('vert')
		expect(r01.constats[0]).toContain('toutes interrompues avant de partir')
		expect(r01.constats).toContain('une lecture (GET /) passe la garde, et le jeton passe vers les statistiques seules')
	})

	test('une garde qui laisse passer une écriture rend R01 rouge, et aucune requête ne part', async () => {
		const site = simulerLeSite()
		const passoire: typeof garder =
			(cible, transport = fetch) =>
			(entree, init) =>
				transport(new URL(String(entree), cible), init ?? {})

		const rapport = await lancerLesSondes({
			cible: CIBLE,
			garde: passoire,
			horloge: horlogeFactice(),
			...AUTRES_SONDES,
		})

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 rouge',
			'R02 non lancée',
			'R03 non lancée',
			'R04 non lancée',
			'R05 non lancée',
			'R06 non lancée',
		])
		expect(rapport.resultats[0]?.constats).toContain('laissée passer : POST')
		expect(rapport.vert).toBe(false)
		expect(rapport.requetes).toBe(0)
		expect(site.recues).toEqual([])
	})

	test('une sonde qui tente une écriture est rouge et arrête la suite', async () => {
		const site = simulerLeSite()
		// A transport that turns every read into a write: the guard stands before it, so this never sends.
		const garde: typeof garder = (cible, transport, jeton) => {
			const lecture = garder(cible, transport, jeton)
			return (entree, init) => (init?.signal ? lecture(entree, { ...init, method: 'POST' }) : lecture(entree, init))
		}

		const rapport = await lancerLesSondes({ cible: CIBLE, garde, horloge: horlogeFactice(), ...AUTRES_SONDES })

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 vert',
			'R02 inconnu',
			'R03 rouge',
			'R04 non lancée',
			'R05 non lancée',
			'R06 non lancée',
		])
		expect(rapport.resultats[2]?.constats[0]).toStartWith('Requête POST interrompue')
		expect(site.recues).toEqual([])
	})
})

describe('R03 : des profils au hasard répondent 200, avec un h1 dans le HTML serveur, sans « undefined » ni « null »', () => {
	test('le sitemap donne les chemins des profils, sans les autres pages ni doublon', () => {
		const xml = `${sitemap(PROFILS)}\n<url><loc>${CIBLE.origin}${PROFILS[0]}</loc></url><url><loc>https://autre.example.test/profil/a&amp;b</loc></url>`

		expect(cheminsDeProfils(xml)).toEqual([...PROFILS, '/profil/a&b'])
	})

	test('cinq profils tirés au hasard, chacun lu une fois : verte', async () => {
		const site = simulerLeSite()

		const r03 = await sondeR03(lecteurDuSite(), premier)

		expect(r03.verdict).toBe('vert')
		expect(site.recues).toEqual(['GET /sitemap.xml', ...PROFILS.slice(0, 5).map(chemin => `GET ${chemin}`)])
		expect(r03.constats[0]).toBe('7 profils dans /sitemap.xml, 5 tirés au hasard')
		expect(r03.constats.slice(1)).toEqual(
			PROFILS.slice(0, 5).map(chemin => `profil #${empreinte(chemin)} : 200, h1 présent, ni « undefined » ni « null »`)
		)
	})

	test('le tirage est sans remise, et prend tout quand il y a moins de profils que demandé', () => {
		const suite = [0.99, 0, 0.5]
		const hasard = () => suite.shift() ?? 0

		expect(tirer(['a', 'b', 'c', 'd'], 3, hasard)).toEqual(['d', 'a', 'c'])
		expect(tirer(['a', 'b'], 5, Math.random).sort()).toEqual(['a', 'b'])
		expect(tirer(['a'], 1, () => 1)).toEqual(['a'])
	})

	test('le rapport ne recopie jamais l’adresse d’un profil : une empreinte la remplace', async () => {
		simulerLeSite()

		const rapport = await lancerLesSondes({
			cible: CIBLE,
			horloge: horlogeFactice(),
			hasard: premier,
			...AUTRES_SONDES,
		})
		const texte = formaterRapport(rapport)

		expect(texte).not.toContain('maquilleuse-fictive')
		expect(texte).toContain(`profil #${empreinte(PROFILS[0] ?? '')}`)
		// The example of docs/tests/sondes.md, where `printf %s <chemin> | sha256sum | cut -c1-8` gives the same.
		expect(empreinte('/profil/zoe-lefevre')).toBe('02d9dcb6')
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
			defautsDUnProfil({
				chemin: '/profil/x',
				statut: 200,
				type: 'text/html; charset=utf-8',
				corps: pageDeProfil(corps),
				entetes: new Headers(),
			})
		).toEqual([defaut])
	})

	test('les données de la page, dans ses scripts, et les mots qui contiennent « null » ne comptent pas', () => {
		const html = pageDeProfil('<h1>Maquilleuse fictive</h1><p>Rendez-vous annulé ; nullement pressée.</p>')

		expect(lireLeHtml(html)).toEqual({ titresH1: 1, occurrences: [] })
	})

	test('le titre et les balises meta comptent', () => {
		const html =
			'<html><head><title>null - My-Makeup</title><meta property="og:description" content="Maquilleuse à undefined"></head><body><h1>Maquilleuse fictive</h1></body></html>'

		expect(lireLeHtml(html).occurrences).toEqual([
			{ mot: 'null', lieu: 'texte', nombre: 1 },
			{ mot: 'undefined', lieu: 'content d’une balise meta', nombre: 1 },
		])
	})

	test.each([
		[308, 'réponse 308, 200 attendu'],
		[404, 'réponse 404, 200 attendu'],
		[500, 'réponse 500, 200 attendu'],
	])('rouge quand un profil répond %i, sans suivre de redirection', async (statut, defaut) => {
		const chemin = PROFILS[0] ?? ''
		const site = simulerLeSite({
			[chemin]: () => new HttpResponse(null, { status: statut, headers: { location: '/profil/autre-nom' } }),
		})

		const r03 = await sondeR03(lecteurDuSite(), premier, 1)

		expect(r03.verdict).toBe('rouge')
		expect(r03.constats[1]).toBe(`profil #${empreinte(chemin)} : ${defaut}`)
		expect(site.recues).not.toContain('GET /profil/autre-nom')
	})

	test('rouge quand un profil n’est pas une page HTML', () => {
		expect(
			defautsDUnProfil({
				chemin: '/profil/x',
				statut: 200,
				type: 'application/json',
				corps: '{}',
				entetes: new Headers(),
			})
		).toEqual(['pas une page HTML (application/json)'])
	})

	test('rouge quand le sitemap ne répond pas, ou ne liste aucun profil', async () => {
		simulerLeSite({ '/sitemap.xml': () => new HttpResponse(null, { status: 500 }) })
		expect((await sondeR03(lecteurDuSite(), premier)).constats).toEqual(['/sitemap.xml : réponse 500'])

		simulerLeSite({ '/sitemap.xml': () => HttpResponse.xml(sitemap([])) })
		const r03 = await sondeR03(lecteurDuSite(), premier)
		expect(r03.verdict).toBe('rouge')
		expect(r03.constats).toEqual(['aucun profil dans /sitemap.xml'])
	})

	test('un profil qui ne répond pas est rouge, les autres sont lus', async () => {
		const chemin = PROFILS[0] ?? ''
		simulerLeSite({ [chemin]: () => HttpResponse.error() })

		const r03 = await sondeR03(lecteurDuSite(), premier, 2)

		expect(r03.verdict).toBe('rouge')
		expect(r03.constats[1]).toStartWith(`profil #${empreinte(chemin)} : `)
		expect(r03.constats[2]).toBe(
			`profil #${empreinte(PROFILS[1] ?? '')} : 200, h1 présent, ni « undefined » ni « null »`
		)
	})
})

describe('R04 : une adresse inconnue répond 404', () => {
	test('une adresse à la racine et une sous /profil/, au nom tiré au hasard : verte sur deux 404', async () => {
		const site = simulerLeSite()

		const r04 = await sondeR04(lecteurDuSite(), premier)

		const nom = `${DEBUT_DES_ADRESSES_INCONNUES}-aaaaaaaaaa`
		expect(r04.verdict).toBe('vert')
		expect(r04.constats).toEqual([`/${nom} : 404`, `/profil/${nom} : 404`])
		expect(site.recues).toEqual([`GET /${nom}`, `GET /profil/${nom}`])
	})

	test('les adresses changent à chaque lancement', () => {
		expect(adressesInconnues(Math.random)).not.toEqual(adressesInconnues(Math.random))
	})

	test('la table des URL gelées promet 404 pour ces adresses, aujourd’hui et après la bascule', () => {
		const [racine = '', profil = ''] = adressesInconnues(Math.random)
		const en404 = (adresse: string) =>
			familiesFor(adresse).filter(famille => famille.status === 404 && famille.statusToday.includes(404))

		expect(en404(racine).map(famille => famille.id)).toEqual(['adresse-inconnue'])
		expect(en404(profil).map(famille => famille.id)).toContain('slug-inconnu')
	})

	test.each([
		[200, 'réponse 200, 404 attendu'],
		[301, 'réponse 301, 404 attendu'],
		[500, 'réponse 500, 404 attendu'],
	])('rouge quand une adresse inconnue répond %i', async (statut, constat) => {
		const nom = `/${DEBUT_DES_ADRESSES_INCONNUES}-aaaaaaaaaa`
		simulerLeSite({ [nom]: () => new HttpResponse('Accueil', { status: statut, headers: { location: '/' } }) })

		const r04 = await sondeR04(lecteurDuSite(), premier)

		expect(r04.verdict).toBe('rouge')
		expect(r04.constats[0]).toBe(`${nom} : ${constat}`)
	})
})

describe('Deux requêtes par seconde au plus, une à la fois', () => {
	test('un lancement entier : 16 requêtes, toujours 500 ms au moins entre deux départs', async () => {
		const site = simulerLeSite()

		const rapport = await lancerLesSondes({
			cible: CIBLE,
			horloge: horlogeFactice(),
			hasard: premier,
			...AUTRES_SONDES,
		})

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 vert',
			'R02 inconnu',
			'R03 vert',
			'R04 vert',
			'R05 vert',
			'R06 vert',
		])
		// Without a token R02 is `inconnu`: not a pass, not an alert either.
		expect(rapport.vert).toBe(false)
		expect(rapport.rouge).toBe(false)
		expect(rapport.requetes).toBe(16)
		expect(site.recues).toHaveLength(16)
		expect(site.recues.every(recue => recue.startsWith('GET '))).toBe(true)
		expect(rapport.ecartMinimalMs).toBe(500)
		expect(rapport.dureeMs).toBe(15 * 500)
		expect(formaterRapport(rapport)).toContain('16 requêtes GET en 7,5 s, 500 ms au moins entre deux requêtes')
		expect(formaterRapport(rapport)).toContain('Aucune sonde rouge, mais 1 inconnue : ce n’est pas un vert.')
	})

	test('des lectures demandées ensemble partent l’une après l’autre, jamais deux à la fois', async () => {
		let enCours = 0
		let auPlus = 0
		const lent: Transport = async () => {
			enCours += 1
			auPlus = Math.max(auPlus, enCours)
			await Promise.resolve()
			enCours -= 1
			return new Response('ok')
		}
		const lecteur = creerLecteur({ lecture: garder(CIBLE, lent), horloge: horlogeFactice() })

		await Promise.all(['/a', '/b', '/c', '/d'].map(chemin => lecteur.lire(chemin)))

		expect(auPlus).toBe(1)
		expect(lecteur.departs).toEqual([0, 500, 1000, 1500])
		expect(ecartLePlusCourt(lecteur.departs)).toBe(500)
	})

	test('une lecture en échec ne bloque pas les suivantes', async () => {
		const { transport } = enregistreur()
		const lecteur = creerLecteur({ lecture: garder(CIBLE, transport), horloge: horlogeFactice() })

		await expect(lecteur.lire('/u/script.js')).rejects.toThrow(RequeteInterdite)
		expect((await lecteur.lire('/')).statut).toBe(200)
	})

	test('un site muet est abandonné au bout du délai', async () => {
		simuler(
			http.get(`${CIBLE.origin}/*`, async () => {
				await delay('infinite')
				return HttpResponse.html('jamais')
			})
		)
		const lecteur = creerLecteur({ lecture: garder(CIBLE), horloge: horlogeFactice(), delaiMs: 20 })

		await expect(lecteur.lire('/')).rejects.toThrow(LectureTropLongue)
	})
})

describe('La cible des sondes', () => {
	test.each([
		['https://my-makeup.fr', 'https://my-makeup.fr'],
		['https://my-makeup.fr/', 'https://my-makeup.fr'],
		['http://localhost:3100', 'http://localhost:3100'],
		['http://127.0.0.1:3100/', 'http://127.0.0.1:3100'],
	])('accepte %s', (valeur, origine) => {
		expect(cibleDesSondes(valeur).origin).toBe(origine)
	})

	test.each([
		['un site en ligne en http', 'http://my-makeup.fr'],
		['un chemin', 'https://my-makeup.fr/profil'],
		['un paramètre', 'https://my-makeup.fr/?x=1'],
		['un identifiant', 'https://visiteuse:factice@my-makeup.fr'],
		['un autre protocole', 'ftp://my-makeup.fr'],
		['une adresse sans protocole', 'my-makeup.fr'],
	])('refuse %s', (_cas, valeur) => {
		expect(() => cibleDesSondes(valeur)).toThrow(CibleRefusee)
	})
})

describe('U86 : la garde des essais de bout en bout refuse toujours la prod', () => {
	test('la prod, que les sondes lisent, reste refusée aux essais', () => {
		expect(cibleDesSondes('https://my-makeup.fr').hostname).toBe('my-makeup.fr')
		expect(() => verifierCible('https://my-makeup.fr')).toThrow('BASE_URL vise la prod')
		expect(() =>
			configurationDesEssais({ SONDES_CIBLE: 'https://my-makeup.fr', BASE_URL: 'https://www.my-makeup.fr' })
		).toThrow(EnvironnementRefuse)
	})

	test('ni Playwright ni bun test ne ramassent les sondes : aucun fichier d’essai dans tests/sondes', () => {
		const fichiers = readdirSync(path.join(RACINE, 'tests/sondes'))

		expect(fichiers).toContain('sondes.ts')
		expect(fichiers.filter(fichier => /\.(spec|test)\.tsx?$/.test(fichier))).toEqual([])
	})
})

describe('R01 : aucune sonde ne contourne la garde', () => {
	/** Ways out of this machine other than the transport of the guard. */
	const SORTIES = [
		/\bfetch\s*\(/,
		/\bBun\.fetch\b/,
		/['"](?:node:)?https?['"]/,
		/['"]undici['"]/,
		/\bXMLHttpRequest\b/,
		/['"](?:node:)?(?:net|tls|dns|dgram|http2)['"]/,
		/\bBun\.(?:connect|listen|spawn)\b/,
	]

	test('seule la garde appelle fetch ; aucun autre fichier des sondes n’ouvre de connexion, sauf la poignée TLS de R06', () => {
		const dossier = path.join(RACINE, 'tests/sondes')
		const fautifs = readdirSync(dossier)
			.filter(fichier => fichier !== 'garde.ts' && fichier !== 'certificats.ts')
			.flatMap(fichier => {
				const texte = readFileSync(path.join(dossier, fichier), 'utf8')
				return SORTIES.filter(sortie => sortie.test(texte)).map(sortie => `${fichier} : ${sortie}`)
			})

		expect(fautifs).toEqual([])
		expect(readFileSync(path.join(dossier, 'garde.ts'), 'utf8').match(/\bfetch\s*\(/g)).toHaveLength(1)
	})
})

test('R06 : seul certificats.ts ouvre une connexion TLS, une seule, sans rien y envoyer', () => {
	const texte = readFileSync(path.join(RACINE, 'tests/sondes/certificats.ts'), 'utf8')

	expect(texte.match(/\btls\.connect\(/g)).toHaveLength(1)
	expect(texte).not.toMatch(/\bfetch\s*\(|\.write\(|\bnet\b|\bBun\./)
})

/* ------------------------------------------------------------------------------------------
 * The token of the service (R02)
 * ---------------------------------------------------------------------------------------- */

const JETON = 'jeton-factice-du-test-0123456789abcdef'

describe('Le jeton du service ne part que vers les statistiques', () => {
	test('il passe vers /api/stats/weekly, sur la cible, en GET', async () => {
		const { transport, recues } = enregistreur()

		await garder(
			CIBLE,
			transport,
			JETON
		)(`${CHEMIN_DES_STATS}?from=a&to=b`, {
			headers: { authorization: `Bearer ${JETON}` },
		})

		expect(recues).toHaveLength(1)
		expect(new Headers(recues[0]?.init.headers).get('authorization')).toBe(`Bearer ${JETON}`)
	})

	test.each([
		['sur une autre page', '/', `Bearer ${JETON}`],
		['sur la mesure d’audience', '/u/script.js', `Bearer ${JETON}`],
		['sur une autre route de l’API', '/api/pros', `Bearer ${JETON}`],
		['avec un autre jeton', CHEMIN_DES_STATS, 'Bearer un-autre-jeton'],
		['sans le mot Bearer', CHEMIN_DES_STATS, JETON],
	])('il est refusé %s', async (_cas, chemin, valeur) => {
		const { transport, recues } = enregistreur()

		await expect(garder(CIBLE, transport, JETON)(chemin, { headers: { authorization: valeur } })).rejects.toThrow(
			RequeteInterdite
		)
		expect(recues).toEqual([])
	})

	test('sans jeton réglé, rien ne passe avec Authorization, même vers les statistiques', async () => {
		const { transport, recues } = enregistreur()

		await expect(
			garder(CIBLE, transport)(CHEMIN_DES_STATS, { headers: { authorization: `Bearer ${JETON}` } })
		).rejects.toThrow(RequeteInterdite)
		expect(recues).toEqual([])
	})

	test('le jeton ne va jamais vers un autre hôte', async () => {
		const { transport, recues } = enregistreur()

		await expect(
			garder(
				CIBLE,
				transport,
				JETON
			)(`https://autre.example.test${CHEMIN_DES_STATS}`, {
				headers: { authorization: `Bearer ${JETON}` },
			})
		).rejects.toThrow(RequeteInterdite)
		expect(recues).toEqual([])
	})

	test('un cookie reste refusé, jeton ou non', async () => {
		const { transport, recues } = enregistreur()

		await expect(
			garder(CIBLE, transport, JETON)(CHEMIN_DES_STATS, { headers: { cookie: 'session=factice' } })
		).rejects.toThrow(RequeteInterdite)
		expect(recues).toEqual([])
	})
})

/* ------------------------------------------------------------------------------------------
 * R02: the sitemap against the publishable profiles
 * ---------------------------------------------------------------------------------------- */

const reponseDesStats =
	(slugs: readonly string[]): (() => Response) =>
	() =>
		HttpResponse.json({ version: 1, publiables: { slugs, parDepartement: {} } })

const SLUGS = PROFILS.map(chemin => chemin.replace('/profil/', ''))

const lecteurAvecJeton = () => creerLecteur({ lecture: garder(CIBLE, undefined, JETON), horloge: horlogeFactice() })
const sondeDeR02 = (jeton?: string | null) =>
	sondeR02(lecteurAvecJeton(), { jeton: jeton === null ? undefined : (jeton ?? JETON), maintenant: () => MAINTENANT })

describe('R02 : le sitemap et les profils publiables sont les mêmes', () => {
	test('sans jeton : inconnu, pas vert, et aucune requête ne part', async () => {
		const site = simulerLeSite()

		for (const jeton of [null, '']) {
			const r02 = await sondeDeR02(jeton)

			expect(r02.verdict).toBe('inconnu')
			expect(r02.constats[0]).toContain('pas de jeton (SONDES_STATS_TOKEN)')
		}
		expect(site.recues).toEqual([])
	})

	test('égalité exacte : vert, le jeton part vers les statistiques seules, sur une période de 7 jours', async () => {
		let entete: string | null = null
		let adresse = ''
		const site = simulerLeSite({
			[CHEMIN_DES_STATS]: request => {
				entete = request.headers.get('authorization')
				adresse = request.url
				return reponseDesStats(SLUGS)()
			},
		})

		const r02 = await sondeDeR02()

		expect(r02.verdict).toBe('vert')
		expect(r02.constats).toEqual([
			`${PROFILS.length} profils dans /sitemap.xml, ${PROFILS.length} profils publiables`,
			'égalité exacte',
		])
		expect(site.recues).toEqual(['GET /sitemap.xml', `GET ${CHEMIN_DES_STATS}`])
		expect(entete as string | null).toBe(`Bearer ${JETON}`)
		const periode = new URL(adresse).searchParams
		expect(periode.get('to')).toBe(MAINTENANT.toISOString())
		expect(periode.get('from')).toBe(dans(-7).toISOString())
	})

	test('un profil du sitemap qui n’est pas publiable : rouge, par son empreinte, jamais par son adresse', async () => {
		simulerLeSite({ [CHEMIN_DES_STATS]: reponseDesStats(SLUGS.slice(1)) })

		const r02 = await sondeDeR02()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats).toContain(
			`1 dans le sitemap mais non publiable (empreintes : #${empreinte(PROFILS[0] ?? '')})`
		)
		expect(r02.constats.join(' ')).not.toContain('maquilleuse-fictive')
	})

	test('un profil publiable absent du sitemap : rouge', async () => {
		simulerLeSite({ [CHEMIN_DES_STATS]: reponseDesStats([...SLUGS, 'maquilleuse-fictive-8']) })

		const r02 = await sondeDeR02()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats[1]).toStartWith('1 publiable absent du sitemap')
	})

	test('même nombre, autres profils : rouge (l’égalité est celle des adresses, pas seulement du compte)', async () => {
		simulerLeSite({ [CHEMIN_DES_STATS]: reponseDesStats([...SLUGS.slice(1), 'maquilleuse-fictive-8']) })

		const r02 = await sondeDeR02()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats[0]).toBe(`${PROFILS.length} profils dans /sitemap.xml, ${PROFILS.length} profils publiables`)
		expect(r02.constats).toHaveLength(3)
	})

	test.each([
		['jeton refusé', () => HttpResponse.json({}, { status: 401 }), 'refuse le jeton (401)'],
		['route absente', () => HttpResponse.html('introuvable', { status: 404 }), 'répond 404, 200 attendu'],
		['réponse sans la liste', () => HttpResponse.json({ version: 1 }), 'n’a pas la forme attendue'],
		['réponse illisible', () => HttpResponse.html('pas du JSON'), 'n’a pas la forme attendue'],
	])('%s : rouge, et le jeton n’est jamais dans le rapport', async (_cas, reponse, texte) => {
		simulerLeSite({ [CHEMIN_DES_STATS]: reponse })

		const r02 = await sondeDeR02()

		expect(r02.verdict).toBe('rouge')
		expect(r02.constats.join(' ')).toContain(texte)
		expect(r02.constats.join(' ')).not.toContain(JETON)
	})

	test('un sitemap en erreur : rouge', async () => {
		simulerLeSite({ '/sitemap.xml': () => HttpResponse.html('', { status: 500 }) })

		expect((await sondeDeR02()).constats).toEqual(['/sitemap.xml : réponse 500'])
	})

	test('comparer et slugsPubliables', () => {
		expect(comparer(['/a', '/b'], ['/b', '/a'])).toEqual({
			egal: true,
			constats: ['2 profils dans /sitemap.xml, 2 profils publiables', 'égalité exacte'],
		})
		expect(comparer([], []).egal).toBe(true)
		expect(comparer(['/a'], []).egal).toBe(false)
		expect(slugsPubliables('{"publiables":{"slugs":["a","b"]}}')).toEqual(['a', 'b'])
		expect(slugsPubliables('{"publiables":{"slugs":[1]}}')).toBeUndefined()
		expect(slugsPubliables('{"publiables":[]}')).toBeUndefined()
		expect(slugsPubliables('[')).toBeUndefined()
	})

	test('le jeton est lu par la commande dans SONDES_STATS_TOKEN seulement : le .env n’est jamais lu', () => {
		const texte = readFileSync(path.join(RACINE, 'tests/sondes/sondes.ts'), 'utf8')

		expect(texte).toContain('process.env[NOM_DU_JETON]')
		expect(readFileSync(path.join(RACINE, 'package.json'), 'utf8')).toContain('"sondes": "bun --no-env-file')
	})
})

/* ------------------------------------------------------------------------------------------
 * R05: headers, closed lists, old routes, Strapi
 * ---------------------------------------------------------------------------------------- */

const API = new URL('https://api-sonde.example.test')

/** Strapi's API as it answers an anonymous visitor today. */
function simulerStrapi(reponses: Record<string, number> = {}): string[] {
	const recues: string[] = []
	simuler(
		http.all(`${API.origin}/*`, ({ request }) => {
			const { pathname } = new URL(request.url)
			recues.push(`${request.method} ${pathname}`)
			const statut = reponses[pathname] ?? (pathname === '/documentation' ? 404 : 403)
			return HttpResponse.json({ error: { status: statut } }, { status: statut })
		})
	)
	return recues
}

describe('R05 : en-têtes présents, listes privées fermées, anciennes routes en 404', () => {
	const lecteurDeApi = () => creerLecteur({ lecture: garder(API), horloge: horlogeFactice() })

	test('le site fermé comme il faut : vert, 9 lectures', async () => {
		const site = simulerLeSite()

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('vert')
		expect(site.recues).toEqual([
			'GET /',
			'GET /api/admins',
			'GET /api/pros',
			'GET /api/auth-events',
			`GET ${CHEMIN_DES_STATS}`,
			'GET /api/upload/files',
			'GET /api/users',
			'GET /documentation',
		])
		expect(r05.constats).toContain('partie Strapi non jouée (pas d’API Strapi à lire)')
	})

	test.each([...ENTETES_DE_SECURITE])('l’en-tête %s absent de l’accueil : rouge, il est nommé', async nom => {
		const { [nom]: _retire, ...entetes } = ENTETES_DU_SITE
		simulerLeSite({ '/': () => HttpResponse.html('<h1>Accueil</h1>', { headers: entetes }) })

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats[0]).toBe(`/ : en-tête absent : ${nom}`)
	})

	test('x-powered-by présent, ou nosniff faussé : rouge', async () => {
		simulerLeSite({
			'/': () =>
				HttpResponse.html('<h1>Accueil</h1>', {
					headers: { ...ENTETES_DU_SITE, 'x-powered-by': 'Next.js', 'x-content-type-options': 'sniff' },
				}),
		})

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats[0]).toContain('x-content-type-options n’est pas « nosniff »')
		expect(r05.constats[0]).toContain('en-tête x-powered-by présent')
	})

	test('une accueil qui redirige n’est pas un accueil avec ses en-têtes : rouge', async () => {
		simulerLeSite({ '/': () => new Response(null, { status: 308, headers: { location: '/accueil' } }) })

		expect((await sondeR05({ site: lecteurDuSite() })).constats[0]).toBe('/ : réponse 308, 200 attendu')
	})

	test.each([
		'/api/admins',
		'/api/pros',
		'/api/auth-events',
	])('la liste privée %s qui répond 200 : rouge', async chemin => {
		simulerLeSite({ [chemin]: () => HttpResponse.json({ docs: [] }) })

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(`${chemin} : réponse 200, 401 ou 403 attendu (liste privée fermée)`)
	})

	test('401 et 403 sont deux façons de fermer une liste', async () => {
		simulerLeSite({ '/api/pros': () => HttpResponse.json({}, { status: 401 }) })

		expect((await sondeR05({ site: lecteurDuSite() })).verdict).toBe('vert')
	})

	test.each([
		'/api/upload/files',
		'/api/users',
		'/documentation',
	])('l’ancienne route %s qui répond encore : rouge', async chemin => {
		simulerLeSite({ [chemin]: () => HttpResponse.json({}, { status: 403 }) })

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(`${chemin} : réponse 403, 404 attendu (ancienne route disparue)`)
	})

	test('les statistiques ouvertes sans jeton : rouge', async () => {
		simulerLeSite({ [CHEMIN_DES_STATS]: () => HttpResponse.json({}) })

		expect((await sondeR05({ site: lecteurDuSite() })).verdict).toBe('rouge')
	})

	test('un site muet : rouge sur chaque ligne, sans arrêter les suivantes', async () => {
		const site = simulerLeSite({ '/api/pros': () => HttpResponse.error() })

		const r05 = await sondeR05({ site: lecteurDuSite() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats.find(constat => constat.startsWith('/api/pros'))).toBeDefined()
		expect(site.recues).toHaveLength(8)
	})

	test('tant que Strapi tourne : /api/upload/files et /api/users en 403, /documentation en 404', async () => {
		simulerLeSite()
		const strapi = simulerStrapi()

		const r05 = await sondeR05({ site: lecteurDuSite(), strapi: lecteurDeApi() })

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
		simulerLeSite()
		simulerStrapi({ [chemin]: statut })

		const r05 = await sondeR05({ site: lecteurDuSite(), strapi: lecteurDeApi() })

		expect(r05.verdict).toBe('rouge')
		expect(r05.constats).toContain(constat)
	})

	test('l’API de Strapi : celle du vrai site par défaut, aucune sur demande, aucune ailleurs', () => {
		const prod = cibleDesSondes('https://my-makeup.fr')

		expect(apiDesSondes(undefined, prod)?.origin).toBe('https://api.my-makeup.fr')
		expect(apiDesSondes('aucune', prod)).toBeUndefined()
		expect(apiDesSondes('https://api-autre.example.test', prod)?.origin).toBe('https://api-autre.example.test')
		expect(apiDesSondes(undefined, CIBLE)).toBeUndefined()
		expect(apiDesSondes(undefined, cibleDesSondes('http://localhost:3356'))).toBeUndefined()
		expect(() => apiDesSondes('http://api.example.test', prod)).toThrow(CibleRefusee)
	})

	test('un lancement avec l’API de Strapi lit les deux origines, 500 ms d’écart sur chacune', async () => {
		simulerLeSite()
		const strapi = simulerStrapi()

		const rapport = await lancerLesSondes({
			cible: CIBLE,
			api: API,
			horloge: horlogeFactice(),
			hasard: premier,
			...AUTRES_SONDES,
		})

		expect(rapport.resultats.find(({ id }) => id === 'R05')?.verdict).toBe('vert')
		expect(strapi).toHaveLength(3)
		expect(rapport.requetes).toBe(19)
		expect(rapport.ecartMinimalMs).toBe(500)
	})

	test('defautsDEntetes', () => {
		expect(defautsDEntetes(new Headers(ENTETES_DU_SITE))).toEqual([])
		expect(defautsDEntetes(new Headers())).toHaveLength(ENTETES_DE_SECURITE.length)
	})
})

/* ------------------------------------------------------------------------------------------
 * R06: certificates and domains
 * ---------------------------------------------------------------------------------------- */

describe('R06 : certificats sous 21 jours, domaines sous 30 jours', () => {
	const surveillance = { hotes: ['site.example.test', 'photos.example.test'], domaines: ['example.test'] }
	const lancer = (certificat: (hote: string) => Promise<Date>, domaine: Parameters<typeof sondeR06>[0]['domaine']) =>
		sondeR06({ surveillance, certificat, domaine, maintenant: () => MAINTENANT })

	test('tout est loin : vert', async () => {
		const r06 = await lancer(
			async () => dans(80),
			async () => rdap(dans(400))
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
		const r06 = await lancer(
			async hote => (hote === 'photos.example.test' ? dans(jours) : dans(90)),
			async () => rdap(dans(400))
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
		const r06 = await lancer(
			async () => dans(90),
			async () => rdap(dans(jours))
		)

		expect(r06.verdict).toBe(verdict)
		if (verdict === 'rouge') expect(r06.constats[2]).toContain('alerte sous 30 jours')
	})

	test('un certificat que la poignée refuse : rouge, avec la raison', async () => {
		const r06 = await lancer(
			async hote => {
				if (hote === 'site.example.test') throw new Error('certificate has expired')
				return dans(90)
			},
			async () => rdap(dans(400))
		)

		expect(r06.verdict).toBe('rouge')
		expect(r06.constats[0]).toBe('certificat de site.example.test : refusé (certificate has expired)')
	})

	test('un registre qui ne répond pas, ou sans date : inconnu, jamais vert', async () => {
		for (const domaine of [
			async () => ({ statut: 503, corps: '' }),
			async () => ({ statut: 200, corps: '{"events":[]}' }),
			async () => ({ statut: 200, corps: 'pas du JSON' }),
			async () => undefined,
		]) {
			const r06 = await lancer(async () => dans(90), domaine)

			expect(r06.verdict).toBe('inconnu')
			expect(r06.constats[2]).toStartWith('domaine example.test : ')
		}
	})

	test('un registre injoignable : inconnu', async () => {
		const r06 = await lancer(
			async () => dans(90),
			async () => {
				throw new Error('boum')
			}
		)

		expect(r06.verdict).toBe('inconnu')
		expect(r06.constats[2]).toBe('domaine example.test : registre injoignable (Error : boum)')
	})

	test('rouge l’emporte sur inconnu', async () => {
		const r06 = await lancer(
			async () => dans(2),
			async () => undefined
		)

		expect(r06.verdict).toBe('rouge')
	})

	test('un lancement entier : le site, sa copie www, l’API, les photos et Umami ; ses domaines', () => {
		const prod = surveillanceDe(cibleDesSondes('https://my-makeup.fr'), new URL('https://api.my-makeup.fr'))

		expect(prod?.hotes).toEqual([
			'my-makeup.fr',
			'www.my-makeup.fr',
			'api.my-makeup.fr',
			'r2-my-makeup.andy-cinquin.fr',
			'umami.wadefade.fr',
		])
		expect(prod?.domaines).toEqual(['my-makeup.fr', 'andy-cinquin.fr', 'wadefade.fr'])
		expect(surveillanceDe(cibleDesSondes('https://my-makeup.fr'))?.hotes).not.toContain('api.my-makeup.fr')
		expect(surveillanceDe(cibleDesSondes('https://temporaire.example.test'))?.hotes).toEqual([
			'temporaire.example.test',
			'r2-my-makeup.andy-cinquin.fr',
			'umami.wadefade.fr',
		])
		expect(surveillanceDe(cibleDesSondes('http://localhost:3356'))).toBeUndefined()
		expect(domaineEnregistre('a.b.example.fr')).toBe('example.fr')
	})

	test('sur une cible locale : R06 est inconnue, rien ne part vers un certificat', async () => {
		const local = new URL('http://localhost:3356')
		simuler(http.all(`${local.origin}/*`, () => HttpResponse.html('<h1>x</h1>', { status: 404 })))
		const certificat = async (): Promise<Date> => {
			throw new Error('ne doit pas être appelé')
		}

		const rapport = await lancerLesSondes({
			cible: local,
			horloge: horlogeFactice(),
			certificat,
			domaine: async () => undefined,
		})

		expect(rapport.resultats.find(({ id }) => id === 'R06')).toMatchObject({ verdict: 'inconnu' })
	})

	test('le registre est lu par un GET gardé, un registre à la fois ; une extension inconnue ne part nulle part', async () => {
		const recues: string[] = []
		simuler(
			http.get('https://rdap.nic.fr/domain/:domaine', ({ request, params }) => {
				recues.push(`${params.domaine} ${request.headers.get('user-agent')}`)
				return HttpResponse.json({ events: [{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }] })
			})
		)
		const lire = lecteurRdap(undefined, horlogeFactice())

		const reponse = await lire('example.fr')

		expect(reponse?.statut).toBe(200)
		expect(finDeLEnregistrement(reponse?.corps ?? '')?.toISOString()).toBe('2030-01-01T00:00:00.000Z')
		expect(recues).toEqual([`example.fr ${AGENT_DES_SONDES}`])
		expect(await lire('example.xyz')).toBeUndefined()
	})

	test('joursRestants et finDeLEnregistrement', () => {
		expect(joursRestants(new Date('2026-11-05T08:00:00Z'), MAINTENANT)).toBe(21)
		expect(
			finDeLEnregistrement('{"events":[{"eventAction":"registration","eventDate":"2001-01-01T00:00:00Z"}]}')
		).toBeUndefined()
		expect(finDeLEnregistrement('{"events":[{"eventAction":"expiration","eventDate":"pas une date"}]}')).toBeUndefined()
	})
})

describe('R06 : la poignée TLS lit la date de fin du certificat', () => {
	let dossier: string | undefined
	let serveur: tls.Server | undefined

	afterEach(() => {
		serveur?.close()
		serveur = undefined
		if (dossier) rmSync(dossier, { recursive: true, force: true })
		dossier = undefined
	})

	/** A local authority and a server certificate for `localhost`, good for 10 days. Skipped without openssl. */
	function certificatLocal(): { cle: string; certificat: string } | undefined {
		try {
			dossier = mkdtempSync(path.join(tmpdir(), 'sonde-tls-'))
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
					path.join(dossier, 'cle.pem'),
					'-out',
					path.join(dossier, 'certificat.pem'),
					'-subj',
					'/CN=localhost',
					'-addext',
					'subjectAltName=DNS:localhost',
				],
				{ stdio: 'ignore' }
			)
			return {
				cle: readFileSync(path.join(dossier, 'cle.pem'), 'utf8'),
				certificat: readFileSync(path.join(dossier, 'certificat.pem'), 'utf8'),
			}
		} catch {
			return undefined
		}
	}

	test('un certificat que la chaîne accepte : sa date de fin, environ 10 jours', async () => {
		const paire = certificatLocal()
		if (!paire) return
		serveur = tls.createServer({ key: paire.cle, cert: paire.certificat }, socket => socket.end())
		await new Promise<void>(resolve => serveur?.listen(0, '127.0.0.1', resolve))
		const port = (serveur.address() as { port: number }).port

		const fin = await lireLeCertificat({ ca: paire.certificat, port })('localhost')

		expect(joursRestants(fin, new Date())).toBeGreaterThan(9)
		expect(joursRestants(fin, new Date())).toBeLessThan(10.1)
	})

	test('un certificat que la chaîne refuse (autorité inconnue) : la poignée échoue, la sonde est rouge', async () => {
		const paire = certificatLocal()
		if (!paire) return
		serveur = tls.createServer({ key: paire.cle, cert: paire.certificat }, socket => socket.end())
		await new Promise<void>(resolve => serveur?.listen(0, '127.0.0.1', resolve))
		const port = (serveur.address() as { port: number }).port

		await expect(lireLeCertificat({ port })('localhost')).rejects.toThrow()
	})
})
