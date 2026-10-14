/**
 * The read-only probes of the live site (tests/sondes/, plan 02 §7.6 R01, R03, R04, ticket 155).
 *
 * The site is simulated: under `bun test` nothing leaves this machine, and a request that
 * nothing simulates fails the test (tests/outils/http-sortant.ts). Every profile is fictional.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN_URL_FAMILIES, familiesFor } from '../../src/lib/urls-gelees'
import { configurationDesEssais } from '../outils/e2e'
import { EnvironnementRefuse, verifierCible } from '../outils/garde-environnement'
import { delay, HttpResponse, http, simuler } from '../outils/http-sortant'
import { cheminsDeProfils, empreinte, lireLeHtml } from '../sondes/contenu'
import {
	AGENT_DES_SONDES,
	CibleRefusee,
	cibleDesSondes,
	controlerRequete,
	garder,
	RequeteInterdite,
	type Transport,
} from '../sondes/garde'
import { creerLecteur, ecartLePlusCourt, type Horloge, LectureTropLongue } from '../sondes/lecteur'
import {
	adressesInconnues,
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

interface Site {
	/** Each request the simulated site received, as `METHOD /path`. */
	recues: string[]
}

/**
 * The simulated site: its sitemap, a page per profile, and a 404 for anything else. `pages`
 * replaces the answer to a path.
 */
function simulerLeSite(pages: Record<string, () => Response> = {}): Site {
	const site: Site = { recues: [] }
	simuler(
		http.all(`${CIBLE.origin}/*`, ({ request }) => {
			const { pathname } = new URL(request.url)
			site.recues.push(`${request.method} ${pathname}`)
			const page = pages[pathname]
			if (page) return page()
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
		expect(r01.constats).toContain('une lecture (GET /) passe la garde')
	})

	test('une garde qui laisse passer une écriture rend R01 rouge, et aucune requête ne part', async () => {
		const site = simulerLeSite()
		const passoire: typeof garder =
			(cible, transport = fetch) =>
			(entree, init) =>
				transport(new URL(String(entree), cible), init ?? {})

		const rapport = await lancerLesSondes({ cible: CIBLE, garde: passoire, horloge: horlogeFactice() })

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 rouge',
			'R03 non lancée',
			'R04 non lancée',
		])
		expect(rapport.resultats[0]?.constats).toContain('laissée passer : POST')
		expect(rapport.vert).toBe(false)
		expect(rapport.requetes).toBe(0)
		expect(site.recues).toEqual([])
	})

	test('une sonde qui tente une écriture est rouge et arrête la suite', async () => {
		const site = simulerLeSite()
		// A transport that turns every read into a write: the guard stands before it, so this never sends.
		const garde: typeof garder = (cible, transport) => {
			const lecture = garder(cible, transport)
			return (entree, init) => (init?.signal ? lecture(entree, { ...init, method: 'POST' }) : lecture(entree, init))
		}

		const rapport = await lancerLesSondes({ cible: CIBLE, garde, horloge: horlogeFactice() })

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual([
			'R01 vert',
			'R03 rouge',
			'R04 non lancée',
		])
		expect(rapport.resultats[1]?.constats[0]).toStartWith('Requête POST interrompue')
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

		const rapport = await lancerLesSondes({ cible: CIBLE, horloge: horlogeFactice(), hasard: premier })
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
		expect(defautsDUnProfil({ chemin: '/profil/x', statut: 200, type: 'application/json', corps: '{}' })).toEqual([
			'pas une page HTML (application/json)',
		])
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
	test('un lancement entier : 8 requêtes, toujours 500 ms au moins entre deux départs', async () => {
		const site = simulerLeSite()

		const rapport = await lancerLesSondes({ cible: CIBLE, horloge: horlogeFactice(), hasard: premier })

		expect(rapport.resultats.map(({ id, verdict }) => `${id} ${verdict}`)).toEqual(['R01 vert', 'R03 vert', 'R04 vert'])
		expect(rapport.vert).toBe(true)
		expect(rapport.requetes).toBe(8)
		expect(site.recues).toHaveLength(8)
		expect(site.recues.every(recue => recue.startsWith('GET '))).toBe(true)
		expect(rapport.ecartMinimalMs).toBe(500)
		expect(rapport.dureeMs).toBe(7 * 500)
		expect(formaterRapport(rapport)).toContain('8 requêtes GET en 3,5 s, 500 ms au moins entre deux requêtes')
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
		expect(() => verifierCible('https://my-makeup.fr', 'test')).toThrow('BASE_URL vise la prod')
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
	const SORTIES = [/\bfetch\s*\(/, /\bBun\.fetch\b/, /['"](?:node:)?https?['"]/, /['"]undici['"]/, /\bXMLHttpRequest\b/]

	test('seule la garde appelle fetch ; aucun autre fichier des sondes n’ouvre de connexion', () => {
		const dossier = path.join(RACINE, 'tests/sondes')
		const fautifs = readdirSync(dossier)
			.filter(fichier => fichier !== 'garde.ts')
			.flatMap(fichier => {
				const texte = readFileSync(path.join(dossier, fichier), 'utf8')
				return SORTIES.filter(sortie => sortie.test(texte)).map(sortie => `${fichier} : ${sortie}`)
			})

		expect(fautifs).toEqual([])
		expect(readFileSync(path.join(dossier, 'garde.ts'), 'utf8').match(/\bfetch\s*\(/g)).toHaveLength(1)
	})
})
