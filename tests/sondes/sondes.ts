/**
 * The read-only probes of a live site (plan 02 §7.6, ticket 155): R01, R03 and R04.
 *
 *     bun run sondes                                      # the site in production
 *     SONDES_CIBLE=http://localhost:3100 bun run sondes   # another target: the bench, a temporary domain
 *
 * - R01: the guard interrupts any request that is not a read, and blocks the audience
 *   measurement. Checked first, without the network: if the guard lets one forbidden request
 *   through, nothing else runs.
 * - R03: five profiles drawn at random from the sitemap answer 200, with an `h1` in the HTML
 *   the server sends, and neither « undefined » nor « null » in what it shows.
 * - R04: an unknown address answers 404, at the root and under `/profil/`.
 *
 * Every request goes through the guard (tests/sondes/garde.ts), one at a time, two per second
 * at most (tests/sondes/lecteur.ts). The report never writes the address of a real profile.
 * The addresses are those of the frozen URL table: they do not change with the v3, so the same
 * probes read the current site today and the v3 after the switch (docs/tests/sondes.md).
 *
 * Not a `bun test` file: under `bun test`, no request leaves this machine
 * (tests/outils/http-sortant.ts). The logic is tested in tests/unit/sondes.test.ts.
 */

import { SITE_ORIGIN } from '../../src/lib/urls-gelees'
import { cheminsDeProfils, empreinte, lireLeHtml, type Occurrence } from './contenu'
import { CibleRefusee, cibleDesSondes, garder, RequeteInterdite, type Transport } from './garde'
import { creerLecteur, ecartLePlusCourt, HORLOGE_REELLE, type Horloge, type Lecteur, type Page } from './lecteur'

export type IdDeSonde = 'R01' | 'R03' | 'R04'
export type Verdict = 'vert' | 'rouge' | 'non lancée'

export interface Resultat {
	id: IdDeSonde
	titre: string
	verdict: Verdict
	/** What the probe saw, one line each, in French. Never the address of a real profile. */
	constats: string[]
}

export interface Rapport {
	cible: string
	resultats: Resultat[]
	/** Requests that reached the target. */
	requetes: number
	/** Shortest gap between the starts of two requests, or null with fewer than two. */
	ecartMinimalMs: number | null
	dureeMs: number
	/** True when every probe is green. */
	vert: boolean
}

/** How many profiles R03 reads. */
export const NOMBRE_DE_PROFILS = 5
export const CHEMIN_DU_SITEMAP = '/sitemap.xml'

/** The beginning of the unknown addresses R04 asks for; a random end keeps every cache out. */
export const DEBUT_DES_ADRESSES_INCONNUES = 'sonde-inexistante'

const TITRES: Record<IdDeSonde, string> = {
	R01: 'La garde interrompt toute écriture et bloque la mesure d’audience',
	R03: 'Des profils au hasard : 200, un h1 dans le HTML serveur, ni « undefined » ni « null »',
	R04: 'Une adresse inconnue répond 404',
}

const resultat = (id: IdDeSonde, ok: boolean, constats: string[]): Resultat => ({
	id,
	titre: TITRES[id],
	verdict: ok ? 'vert' : 'rouge',
	constats,
})

/** Why a request failed, without an address that could name a profile. */
function raison(erreur: unknown): string {
	if (!(erreur instanceof Error)) return 'erreur inconnue'
	const message = erreur.message.replace(/\/profil\/[^\s/?#'"]+/g, '/profil/<…>')
	return erreur.name === 'LectureTropLongue' ? message : `${erreur.name} : ${message}`
}

/* ------------------------------------------------------------------------------------------
 * R01: the guard, checked before any request leaves
 * ---------------------------------------------------------------------------------------- */

/**
 * The forbidden requests R01 tries, and why each is forbidden. Every one must be interrupted
 * before the transport sees it.
 */
const ESSAIS_INTERDITS: readonly { nom: string; entree: string; init: RequestInit }[] = [
	{ nom: 'POST', entree: '/', init: { method: 'POST', body: '{}' } },
	{ nom: 'PUT', entree: '/', init: { method: 'PUT', body: '{}' } },
	{ nom: 'PATCH', entree: '/', init: { method: 'PATCH', body: '{}' } },
	{ nom: 'DELETE', entree: '/', init: { method: 'DELETE' } },
	{ nom: 'POST /u/api/send', entree: '/u/api/send', init: { method: 'POST', body: '{}' } },
	{ nom: 'GET /u/script.js', entree: '/u/script.js', init: {} },
	{ nom: 'GET /u/api/send', entree: '/u/api/send', init: {} },
	{ nom: 'GET vers un autre hôte', entree: 'https://mesure.example.test/script.js', init: {} },
	{ nom: 'GET avec un cookie', entree: '/', init: { headers: { cookie: 'session=factice' } } },
]

/**
 * R01. The guard of this run is tried on a transport that only records: the forbidden requests
 * must all be interrupted before it, and a plain read must reach it. Nothing goes to the network.
 */
export async function sondeR01(cible: URL, garde: typeof garder = garder): Promise<Resultat> {
	const recues: string[] = []
	const lecture = garde(cible, async adresse => {
		recues.push(adresse.pathname)
		return new Response(null, { status: 204 })
	})

	const passees: string[] = []
	const autres: string[] = []
	for (const { nom, entree, init } of ESSAIS_INTERDITS) {
		try {
			await lecture(entree, init)
			passees.push(nom)
		} catch (erreur) {
			if (!(erreur instanceof RequeteInterdite)) autres.push(`${nom} : ${raison(erreur)}`)
		}
	}
	const interdites = recues.length
	await lecture('/').catch((erreur: unknown) => autres.push(`lecture de contrôle : ${raison(erreur)}`))
	const controle = recues.length === interdites + 1

	const constats = [
		`${ESSAIS_INTERDITS.length} requêtes interdites essayées (${ESSAIS_INTERDITS.map(({ nom }) => nom).join(', ')}) : ${
			passees.length === 0 && interdites === 0 ? 'toutes interrompues avant de partir' : `${passees.length} passée(s)`
		}`,
		...passees.map(nom => `laissée passer : ${nom}`),
		...autres,
		controle ? 'une lecture (GET /) passe la garde' : 'la lecture de contrôle (GET /) n’a pas passé la garde',
	]
	return resultat('R01', passees.length === 0 && interdites === 0 && autres.length === 0 && controle, constats)
}

/* ------------------------------------------------------------------------------------------
 * R03: profiles drawn at random from the sitemap
 * ---------------------------------------------------------------------------------------- */

/** `nombre` items drawn without replacement, in the order of the draw. */
export function tirer<T>(liste: readonly T[], nombre: number, hasard: () => number): T[] {
	const copie = [...liste]
	const tires: T[] = []
	while (tires.length < nombre && copie.length > 0) {
		const rang = Math.min(copie.length - 1, Math.floor(hasard() * copie.length))
		tires.push(...copie.splice(rang, 1))
	}
	return tires
}

const decrireOccurrence = ({ mot, lieu, nombre }: Occurrence): string =>
	`« ${mot} » ${nombre === 1 ? 'une fois' : `${nombre} fois`} (${lieu})`

/** What is wrong with a profile page, one phrase each; empty when nothing is. */
export function defautsDUnProfil(page: Page): string[] {
	if (page.statut !== 200) return [`réponse ${page.statut}, 200 attendu`]
	if (!page.type?.includes('text/html')) return [`pas une page HTML (${page.type ?? 'sans type'})`]
	const { titresH1, occurrences } = lireLeHtml(page.corps)
	return [...(titresH1 === 0 ? ['aucun h1 dans le HTML serveur'] : []), ...occurrences.map(decrireOccurrence)]
}

export async function sondeR03(lecteur: Lecteur, hasard: () => number, nombre = NOMBRE_DE_PROFILS): Promise<Resultat> {
	const sitemap = await lecteur.lire(CHEMIN_DU_SITEMAP)
	if (sitemap.statut !== 200) return resultat('R03', false, [`${CHEMIN_DU_SITEMAP} : réponse ${sitemap.statut}`])
	const chemins = cheminsDeProfils(sitemap.corps)
	if (chemins.length === 0) return resultat('R03', false, [`aucun profil dans ${CHEMIN_DU_SITEMAP}`])

	const tires = tirer(chemins, nombre, hasard)
	const constats = [`${chemins.length} profils dans ${CHEMIN_DU_SITEMAP}, ${tires.length} tirés au hasard`]
	let ok = true
	for (const chemin of tires) {
		const nom = `profil #${empreinte(chemin)}`
		let defauts: string[]
		try {
			defauts = defautsDUnProfil(await lecteur.lire(chemin))
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			defauts = [raison(erreur)]
		}
		if (defauts.length > 0) ok = false
		constats.push(
			`${nom} : ${defauts.length === 0 ? '200, h1 présent, ni « undefined » ni « null »' : defauts.join(' ; ')}`
		)
	}
	return resultat('R03', ok, constats)
}

/* ------------------------------------------------------------------------------------------
 * R04: unknown addresses
 * ---------------------------------------------------------------------------------------- */

const ALPHABET_DES_SUFFIXES = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** The unknown addresses of a run: one at the root, one under `/profil/`, both shaped like a slug. */
export function adressesInconnues(hasard: () => number): string[] {
	const suffixe = Array.from(
		{ length: 10 },
		() =>
			ALPHABET_DES_SUFFIXES[
				Math.min(ALPHABET_DES_SUFFIXES.length - 1, Math.floor(hasard() * ALPHABET_DES_SUFFIXES.length))
			]
	).join('')
	const nom = `${DEBUT_DES_ADRESSES_INCONNUES}-${suffixe}`
	return [`/${nom}`, `/profil/${nom}`]
}

export async function sondeR04(lecteur: Lecteur, hasard: () => number): Promise<Resultat> {
	let ok = true
	const constats: string[] = []
	for (const chemin of adressesInconnues(hasard)) {
		let constat: string
		try {
			const { statut } = await lecteur.lire(chemin)
			if (statut !== 404) ok = false
			constat = statut === 404 ? '404' : `réponse ${statut}, 404 attendu`
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			ok = false
			constat = raison(erreur)
		}
		constats.push(`${chemin} : ${constat}`)
	}
	return resultat('R04', ok, constats)
}

/* ------------------------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------------------------- */

export interface OptionsDesSondes {
	cible: URL
	/** What sends the requests: `fetch` unless a test stands in for it. */
	transport?: Transport
	horloge?: Horloge
	/** A number in [0, 1), like Math.random. */
	hasard?: () => number
	nombreDeProfils?: number
	/** The guard. Always `garder`, except in the test that proves a broken guard stops the run. */
	garde?: typeof garder
}

const nonLancee = (id: IdDeSonde, pourquoi: string): Resultat => ({
	id,
	titre: TITRES[id],
	verdict: 'non lancée',
	constats: [pourquoi],
})

/**
 * Runs R01, then R03 and R04 on the target. A request interrupted by the guard during a probe
 * makes it red and stops the run: a probe that tries to write is broken, whatever it found.
 */
export async function lancerLesSondes({
	cible,
	transport,
	horloge = HORLOGE_REELLE,
	hasard = Math.random,
	nombreDeProfils = NOMBRE_DE_PROFILS,
	garde = garder,
}: OptionsDesSondes): Promise<Rapport> {
	const debut = horloge.maintenant()
	const resultats: Resultat[] = [await sondeR01(cible, garde)]
	const lecteur = creerLecteur({ lecture: garde(cible, transport), horloge })
	const suite: readonly [IdDeSonde, () => Promise<Resultat>][] = [
		['R03', () => sondeR03(lecteur, hasard, nombreDeProfils)],
		['R04', () => sondeR04(lecteur, hasard)],
	]

	let arret = resultats[0]?.verdict === 'vert' ? undefined : 'la garde ne tient pas (R01) : aucune requête n’est partie'
	for (const [id, sonde] of suite) {
		if (arret) {
			resultats.push(nonLancee(id, arret))
			continue
		}
		try {
			resultats.push(await sonde())
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) {
				resultats.push(resultat(id, false, [erreur.message]))
				arret = 'une requête interdite a arrêté les sondes'
			} else resultats.push(resultat(id, false, [raison(erreur)]))
		}
	}

	return {
		cible: cible.origin,
		resultats,
		requetes: lecteur.departs.length,
		ecartMinimalMs: ecartLePlusCourt(lecteur.departs),
		dureeMs: horloge.maintenant() - debut,
		vert: resultats.every(({ verdict }) => verdict === 'vert'),
	}
}

const secondes = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** The report of a run, in French, as the terminal shows it. */
export function formaterRapport(rapport: Rapport): string {
	const lignes = [`Sondes en lecture seule vers ${rapport.cible}`, '']
	for (const { id, titre, verdict, constats } of rapport.resultats) {
		lignes.push(`${id} ${verdict.toUpperCase()} : ${titre}`)
		for (const constat of constats) lignes.push(`    - ${constat}`)
	}
	const ecart =
		rapport.ecartMinimalMs === null
			? ''
			: `, ${Math.round(rapport.ecartMinimalMs)} ms au moins entre deux requêtes (2 par seconde au plus)`
	lignes.push(
		'',
		`${rapport.requetes} requête${rapport.requetes > 1 ? 's' : ''} GET en ${secondes(rapport.dureeMs)}${ecart}.`,
		rapport.vert ? 'Toutes les sondes sont vertes.' : 'Au moins une sonde n’est pas verte.'
	)
	return lignes.join('\n')
}

if (import.meta.main) {
	let cible: URL
	try {
		cible = cibleDesSondes(process.env.SONDES_CIBLE || SITE_ORIGIN)
	} catch (erreur) {
		if (!(erreur instanceof CibleRefusee)) throw erreur
		console.error(erreur.message)
		process.exit(2)
	}
	const rapport = await lancerLesSondes({ cible })
	console.log(formaterRapport(rapport))
	process.exit(rapport.vert ? 0 : 1)
}
