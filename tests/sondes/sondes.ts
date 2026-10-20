/**
 * The read-only probes of a live site (plan 02 §7.6, tickets 155 and 156): R01 to R06.
 *
 *     bun run sondes                                      # the site in production
 *     SONDES_CIBLE=http://localhost:3100 bun run sondes   # another target: the bench, a temporary domain
 *     SONDES_STATS_TOKEN=… bun run sondes                 # with the token of the service, R02 compares
 *     SONDES_API=aucune bun run sondes                    # Strapi is stopped: no Strapi part in R05
 *
 * - R01: the guard interrupts any request that is not a read, and blocks the audience
 *   measurement. Checked first, without the network: if the guard lets one forbidden request
 *   through, nothing else runs.
 * - R02: the profile addresses of the sitemap are exactly the publishable profiles (the statistics
 *   route, with the token of the service). Without the token: `inconnu`, never `vert`.
 * - R03: five profiles drawn at random from the sitemap answer 200, with an `h1` in the HTML
 *   the server sends, and neither « undefined » nor « null » in what it shows.
 * - R04: an unknown address answers 404, at the root and under `/profil/`.
 * - R05: the security headers, the private lists closed, the old routes gone; Strapi's API while it runs.
 * - R06: certificates (21 days) and domains (30 days) of the site, the photos and Umami.
 *
 * Every request goes through the guard (tests/sondes/garde.ts), one at a time, two per second
 * at most (tests/sondes/lecteur.ts). The report never writes the address of a real profile.
 * The addresses are those of the frozen URL table: they do not change with the v3, so the same
 * probes read the current site today and the v3 after the switch (docs/tests/sondes.md).
 *
 * Not a `bun test` file: under `bun test`, no request leaves this machine
 * (tests/outils/http-sortant.ts). The logic is tested in tests/unit/sondes.test.ts.
 */

import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import {
	type LireUnCertificat,
	type LireUnDomaine,
	lecteurRdap,
	lireLeCertificat,
	sondeR06,
	surveillanceDe,
} from './certificats'
import { cheminsDeProfils, empreinte, lireLeHtml, type Occurrence } from './contenu'
import { sondeR05 } from './entetes'
import { CHEMIN_DES_STATS, CibleRefusee, cibleDesSondes, garder, RequeteInterdite, type Transport } from './garde'
import { creerLecteur, ecartLePlusCourt, HORLOGE_REELLE, type Horloge, type Lecteur, type Page } from './lecteur'
import { CHEMIN_DU_SITEMAP, NOM_DU_JETON, sondeR02 } from './profils-publiables'
import { type Constat, raisonDe, type Verdict } from './resultat'

export type { Verdict }
export { CHEMIN_DU_SITEMAP }
export type IdDeSonde = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06'

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
	/** True when every probe is green: an `inconnu` or a probe not run is not. */
	vert: boolean
	/** True when at least one probe is red or was not run: the exit code of the command. */
	rouge: boolean
}

/** How many profiles R03 reads. */
export const NOMBRE_DE_PROFILS = 5

/** The beginning of the unknown addresses R04 asks for; a random end keeps every cache out. */
export const DEBUT_DES_ADRESSES_INCONNUES = 'sonde-inexistante'

const TITRES: Record<IdDeSonde, string> = {
	R01: 'La garde interrompt toute écriture et bloque la mesure d’audience',
	R02: 'Les profils du sitemap sont exactement les profils publiables',
	R03: 'Des profils au hasard : 200, un h1 dans le HTML serveur, ni « undefined » ni « null »',
	R04: 'Une adresse inconnue répond 404',
	R05: 'En-têtes de sécurité présents, listes privées fermées, anciennes routes disparues',
	R06: 'Certificats valides plus de 21 jours, domaines plus de 30 jours',
}

const resultat = (id: IdDeSonde, ok: boolean, constats: string[]): Resultat => ({
	id,
	titre: TITRES[id],
	verdict: ok ? 'vert' : 'rouge',
	constats,
})

const depuis = (id: IdDeSonde, { verdict, constats }: Constat): Resultat => ({
	id,
	titre: TITRES[id],
	verdict,
	constats,
})

/** The Strapi API of the real site, read by R05 while it runs. */
export const API_STRAPI_PAR_DEFAUT = 'https://api.my-makeup.fr'

const raison = raisonDe

/* ------------------------------------------------------------------------------------------
 * R01: the guard, checked before any request leaves
 * ---------------------------------------------------------------------------------------- */

/**
 * The forbidden requests R01 tries, and why each is forbidden. Every one must be interrupted
 * before the transport sees it.
 */
/** A token that exists only here: the guard of R01 is armed with it, to prove it is sent nowhere else. */
const JETON_FACTICE = 'jeton-factice-de-la-sonde-r01'

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
	{
		nom: 'GET avec le jeton hors des statistiques',
		entree: '/',
		init: { headers: { authorization: `Bearer ${JETON_FACTICE}` } },
	},
	{
		nom: 'GET des statistiques avec un autre jeton',
		entree: CHEMIN_DES_STATS,
		init: { headers: { authorization: 'Bearer autre-jeton-factice' } },
	},
	{
		nom: 'GET des statistiques avec un cookie',
		entree: CHEMIN_DES_STATS,
		init: { headers: { cookie: 'session=factice' } },
	},
]

/**
 * R01. The guard of this run is tried on a transport that only records: the forbidden requests
 * must all be interrupted before it, and a plain read must reach it. Nothing goes to the network.
 */
export async function sondeR01(cible: URL, garde: typeof garder = garder): Promise<Resultat> {
	const recues: string[] = []
	const lecture = garde(
		cible,
		async adresse => {
			recues.push(adresse.pathname)
			return new Response(null, { status: 204 })
		},
		JETON_FACTICE
	)

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
	await lecture(CHEMIN_DES_STATS, { headers: { authorization: `Bearer ${JETON_FACTICE}` } }).catch((erreur: unknown) =>
		autres.push(`lecture de contrôle avec le jeton : ${raison(erreur)}`)
	)
	const controle = recues.length === interdites + 2

	const constats = [
		`${ESSAIS_INTERDITS.length} requêtes interdites essayées (${ESSAIS_INTERDITS.map(({ nom }) => nom).join(', ')}) : ${
			passees.length === 0 && interdites === 0 ? 'toutes interrompues avant de partir' : `${passees.length} passée(s)`
		}`,
		...passees.map(nom => `laissée passer : ${nom}`),
		...autres,
		controle
			? 'une lecture (GET /) passe la garde, et le jeton passe vers les statistiques seules'
			: 'une lecture de contrôle (GET /, ou le jeton vers les statistiques) n’a pas passé la garde',
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
	/** The token of the service for R02. Without it R02 is `inconnu`. */
	jeton?: string | undefined
	/** The Strapi API, for the Strapi part of R05 while it runs. Without it that part is not played. */
	api?: URL | undefined
	/** What reads a certificate: a TLS handshake unless a test stands in for it. */
	certificat?: LireUnCertificat
	/** What reads the end date of a domain: the public registry unless a test stands in for it. */
	domaine?: LireUnDomaine
	/** The date of the run. */
	maintenant?: () => Date
}

const nonLancee = (id: IdDeSonde, pourquoi: string): Resultat => ({
	id,
	titre: TITRES[id],
	verdict: 'non lancée',
	constats: [pourquoi],
})

/**
 * Runs R01, then R02 to R06 on the target. A request interrupted by the guard during a probe
 * makes it red and stops the run: a probe that tries to write is broken, whatever it found.
 */
export async function lancerLesSondes({
	cible,
	transport,
	horloge = HORLOGE_REELLE,
	hasard = Math.random,
	nombreDeProfils = NOMBRE_DE_PROFILS,
	garde = garder,
	jeton,
	api,
	certificat = lireLeCertificat(),
	domaine = lecteurRdap(transport, horloge),
	maintenant = () => new Date(),
}: OptionsDesSondes): Promise<Rapport> {
	const debut = horloge.maintenant()
	const resultats: Resultat[] = [await sondeR01(cible, garde)]
	const lecteur = creerLecteur({ lecture: garde(cible, transport, jeton || undefined), horloge })
	const lecteurApi = api ? creerLecteur({ lecture: garde(api, transport), horloge }) : undefined
	const surveillance = surveillanceDe(cible, api)
	const suite: readonly [IdDeSonde, () => Promise<Resultat>][] = [
		['R02', async () => depuis('R02', await sondeR02(lecteur, { jeton, maintenant }))],
		['R03', () => sondeR03(lecteur, hasard, nombreDeProfils)],
		['R04', () => sondeR04(lecteur, hasard)],
		['R05', async () => depuis('R05', await sondeR05({ site: lecteur, strapi: lecteurApi }))],
		[
			'R06',
			async () =>
				depuis(
					'R06',
					surveillance
						? await sondeR06({ surveillance, certificat, domaine, maintenant })
						: {
								verdict: 'inconnu',
								constats: ['la cible n’est pas en https : pas de certificat à lire, les domaines ne sont pas lus'],
							}
				),
		],
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

	const lecteurs = lecteurApi ? [lecteur, lecteurApi] : [lecteur]
	const ecarts = lecteurs
		.map(({ departs }) => ecartLePlusCourt(departs))
		.filter((ecart): ecart is number => ecart !== null)
	return {
		cible: cible.origin,
		resultats,
		requetes: lecteurs.reduce((somme, { departs }) => somme + departs.length, 0),
		ecartMinimalMs: ecarts.length === 0 ? null : Math.min(...ecarts),
		dureeMs: horloge.maintenant() - debut,
		vert: resultats.every(({ verdict }) => verdict === 'vert'),
		rouge: resultats.some(({ verdict }) => verdict === 'rouge' || verdict === 'non lancée'),
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
	const inconnues = rapport.resultats.filter(({ verdict }) => verdict === 'inconnu').length
	lignes.push(
		'',
		`${rapport.requetes} requête${rapport.requetes > 1 ? 's' : ''} GET en ${secondes(rapport.dureeMs)}${ecart}.`,
		rapport.vert
			? 'Toutes les sondes sont vertes.'
			: rapport.rouge
				? 'Au moins une sonde est rouge ou n’a pas été lancée.'
				: `Aucune sonde rouge, mais ${inconnues} inconnue${inconnues > 1 ? 's' : ''} : ce n’est pas un vert.`
	)
	return lignes.join('\n')
}

/** The Strapi API to read: `SONDES_API`, an origin; `aucune` once Strapi is stopped. The real site has its API by default. */
export function apiDesSondes(valeur: string | undefined, cible: URL): URL | undefined {
	if (valeur === 'aucune') return undefined
	if (valeur) return cibleDesSondes(valeur)
	return cible.origin === SITE_ORIGIN ? new URL(API_STRAPI_PAR_DEFAUT) : undefined
}

if (import.meta.main) {
	let cible: URL
	let api: URL | undefined
	try {
		cible = cibleDesSondes(process.env.SONDES_CIBLE || SITE_ORIGIN)
		api = apiDesSondes(process.env.SONDES_API, cible)
	} catch (erreur) {
		if (!(erreur instanceof CibleRefusee)) throw erreur
		console.error(erreur.message)
		process.exit(2)
	}
	const rapport = await lancerLesSondes({ cible, api, jeton: process.env[NOM_DU_JETON] })
	console.log(formaterRapport(rapport))
	process.exit(rapport.rouge ? 1 : 0)
}
