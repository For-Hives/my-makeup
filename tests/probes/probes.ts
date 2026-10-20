/**
 * The read-only probes of a live site (plan 02 §7.6, tickets 155 and 156): R01 to R06.
 *
 *     bun run probes                                      # the site in production
 *     PROBES_TARGET=http://localhost:3100 bun run probes   # another target: the bench, a temporary domain
 *     PROBES_STATS_TOKEN=… bun run probes                 # with the token of the service, R02 compares
 *     PROBES_API=aucune bun run probes                    # Strapi is stopped: no Strapi part in R05
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
 * Every request goes through the guard (tests/probes/guard.ts), one at a time, two per second
 * at most (tests/probes/reader.ts). The report never writes the address of a real profile.
 * The addresses are those of the frozen URL table: they do not change with the v3, so the same
 * probes read the current site today and the v3 after the switch (docs/tests/sondes.md).
 *
 * Not a `bun test` file: under `bun test`, no request leaves this machine
 * (tests/support/outgoing-http.ts). The logic is tested in tests/unit/sondes.test.ts.
 */

import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { probeR06, type ReadCertificate, type ReadDomain, readCertificate, readerRdap, watchOf } from './certificates'
import { fingerprint, type Occurrence, profilePaths, readHtml } from './content'
import { ForbiddenRequest, keep, probeTarget, RefusedTarget, STATS_PATH, type Transport } from './guard'
import { probeR05 } from './headers'
import { probeR02, SITEMAP_PATH, TOKEN_NAME } from './publishable-profiles'
import { type Clock, createReader, type Page, REAL_CLOCK, type Reader, shortestGap } from './reader'
import { type Finding, reasonOf, type Verdict } from './result'

export type { Verdict }
export { SITEMAP_PATH as CHEMIN_DU_SITEMAP }
export type ProbeId = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06'

export interface Result {
	id: ProbeId
	titre: string
	verdict: Verdict
	/** What the probe saw, one line each, in French. Never the address of a real profile. */
	constats: string[]
}

export interface Report {
	cible: string
	resultats: Result[]
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
export const PROFILE_COUNT = 5

/** The beginning of the unknown addresses R04 asks for; a random end keeps every cache out. */
export const UNKNOWN_URL_START = 'sonde-inexistante'

const TITLES: Record<ProbeId, string> = {
	R01: 'La garde interrompt toute écriture et bloque la mesure d’audience',
	R02: 'Les profils du sitemap sont exactement les profils publiables',
	R03: 'Des profils au hasard : 200, un h1 dans le HTML serveur, ni « undefined » ni « null »',
	R04: 'Une adresse inconnue répond 404',
	R05: 'En-têtes de sécurité présents, listes privées fermées, anciennes routes disparues',
	R06: 'Certificats valides plus de 21 jours, domaines plus de 30 jours',
}

const result = (id: ProbeId, ok: boolean, constats: string[]): Result => ({
	id,
	titre: TITLES[id],
	verdict: ok ? 'vert' : 'rouge',
	constats,
})

const since = (id: ProbeId, { verdict, constats: findings }: Finding): Result => ({
	id,
	titre: TITLES[id],
	verdict,
	constats: findings,
})

/** The Strapi API of the real site, read by R05 while it runs. */
export const API_STRAPI_BY_DEFAULT = 'https://api.my-makeup.fr'

const reason = reasonOf

/* ------------------------------------------------------------------------------------------
 * R01: the guard, checked before any request leaves
 * ---------------------------------------------------------------------------------------- */

/**
 * The forbidden requests R01 tries, and why each is forbidden. Every one must be interrupted
 * before the transport sees it.
 */
/** A token that exists only here: the guard of R01 is armed with it, to prove it is sent nowhere else. */
const FAKE_TOKEN = 'jeton-factice-de-la-sonde-r01'

const FORBIDDEN_TESTS: readonly { nom: string; entree: string; init: RequestInit }[] = [
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
		init: { headers: { authorization: `Bearer ${FAKE_TOKEN}` } },
	},
	{
		nom: 'GET des statistiques avec un autre jeton',
		entree: STATS_PATH,
		init: { headers: { authorization: 'Bearer autre-jeton-factice' } },
	},
	{
		nom: 'GET des statistiques avec un cookie',
		entree: STATS_PATH,
		init: { headers: { cookie: 'session=factice' } },
	},
]

/**
 * R01. The guard of this run is tried on a transport that only records: the forbidden requests
 * must all be interrupted before it, and a plain read must reach it. Nothing goes to the network.
 */
export async function probeR01(cible: URL, garde: typeof keep = keep): Promise<Result> {
	const received: string[] = []
	const reading = garde(
		cible,
		async adresse => {
			received.push(adresse.pathname)
			return new Response(null, { status: 204 })
		},
		FAKE_TOKEN
	)

	const passed: string[] = []
	const other: string[] = []
	for (const { nom: name, entree: entry, init } of FORBIDDEN_TESTS) {
		try {
			await reading(entry, init)
			passed.push(name)
		} catch (error) {
			if (!(error instanceof ForbiddenRequest)) other.push(`${name} : ${reason(error)}`)
		}
	}
	const forbidden = received.length
	await reading('/').catch((erreur: unknown) => other.push(`lecture de contrôle : ${reason(erreur)}`))
	await reading(STATS_PATH, { headers: { authorization: `Bearer ${FAKE_TOKEN}` } }).catch((erreur: unknown) =>
		other.push(`lecture de contrôle avec le jeton : ${reason(erreur)}`)
	)
	const check = received.length === forbidden + 2

	const findings = [
		`${FORBIDDEN_TESTS.length} requêtes interdites essayées (${FORBIDDEN_TESTS.map(({ nom: name }) => name).join(', ')}) : ${
			passed.length === 0 && forbidden === 0 ? 'toutes interrompues avant de partir' : `${passed.length} passée(s)`
		}`,
		...passed.map(nom => `laissée passer : ${nom}`),
		...other,
		check
			? 'une lecture (GET /) passe la garde, et le jeton passe vers les statistiques seules'
			: 'une lecture de contrôle (GET /, ou le jeton vers les statistiques) n’a pas passé la garde',
	]
	return result('R01', passed.length === 0 && forbidden === 0 && other.length === 0 && check, findings)
}

/* ------------------------------------------------------------------------------------------
 * R03: profiles drawn at random from the sitemap
 * ---------------------------------------------------------------------------------------- */

/** `nombre` items drawn without replacement, in the order of the draw. */
export function draw<T>(liste: readonly T[], nombre: number, hasard: () => number): T[] {
	const copy = [...liste]
	const drawn: T[] = []
	while (drawn.length < nombre && copy.length > 0) {
		const rank = Math.min(copy.length - 1, Math.floor(hasard() * copy.length))
		drawn.push(...copy.splice(rank, 1))
	}
	return drawn
}

const describeOccurrence = ({ mot, lieu, nombre }: Occurrence): string =>
	`« ${mot} » ${nombre === 1 ? 'une fois' : `${nombre} fois`} (${lieu})`

/** What is wrong with a profile page, one phrase each; empty when nothing is. */
export function profileDefaults(page: Page): string[] {
	if (page.statut !== 200) return [`réponse ${page.statut}, 200 attendu`]
	if (!page.type?.includes('text/html')) return [`pas une page HTML (${page.type ?? 'sans type'})`]
	const { titresH1: titleH1, occurrences } = readHtml(page.corps)
	return [...(titleH1 === 0 ? ['aucun h1 dans le HTML serveur'] : []), ...occurrences.map(describeOccurrence)]
}

export async function probeR03(lecteur: Reader, hasard: () => number, nombre = PROFILE_COUNT): Promise<Result> {
	const sitemap = await lecteur.lire(SITEMAP_PATH)
	if (sitemap.statut !== 200) return result('R03', false, [`${SITEMAP_PATH} : réponse ${sitemap.statut}`])
	const paths = profilePaths(sitemap.corps)
	if (paths.length === 0) return result('R03', false, [`aucun profil dans ${SITEMAP_PATH}`])

	const drawn = draw(paths, nombre, hasard)
	const findings = [`${paths.length} profils dans ${SITEMAP_PATH}, ${drawn.length} tirés au hasard`]
	let ok = true
	for (const path of drawn) {
		const name = `profil #${fingerprint(path)}`
		let defaults: string[]
		try {
			defaults = profileDefaults(await lecteur.lire(path))
		} catch (error) {
			if (error instanceof ForbiddenRequest) throw error
			defaults = [reason(error)]
		}
		if (defaults.length > 0) ok = false
		findings.push(
			`${name} : ${defaults.length === 0 ? '200, h1 présent, ni « undefined » ni « null »' : defaults.join(' ; ')}`
		)
	}
	return result('R03', ok, findings)
}

/* ------------------------------------------------------------------------------------------
 * R04: unknown addresses
 * ---------------------------------------------------------------------------------------- */

const SUFFIXES_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** The unknown addresses of a run: one at the root, one under `/profil/`, both shaped like a slug. */
export function unknownUrls(hasard: () => number): string[] {
	const suffix = Array.from(
		{ length: 10 },
		() => SUFFIXES_ALPHABET[Math.min(SUFFIXES_ALPHABET.length - 1, Math.floor(hasard() * SUFFIXES_ALPHABET.length))]
	).join('')
	const name = `${UNKNOWN_URL_START}-${suffix}`
	return [`/${name}`, `/profil/${name}`]
}

export async function probeR04(lecteur: Reader, hasard: () => number): Promise<Result> {
	let ok = true
	const findings: string[] = []
	for (const path of unknownUrls(hasard)) {
		let finding: string
		try {
			const { statut: status } = await lecteur.lire(path)
			if (status !== 404) ok = false
			finding = status === 404 ? '404' : `réponse ${status}, 404 attendu`
		} catch (error) {
			if (error instanceof ForbiddenRequest) throw error
			ok = false
			finding = reason(error)
		}
		findings.push(`${path} : ${finding}`)
	}
	return result('R04', ok, findings)
}

/* ------------------------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------------------------- */

export interface ProbeOptions {
	cible: URL
	/** What sends the requests: `fetch` unless a test stands in for it. */
	transport?: Transport
	horloge?: Clock
	/** A number in [0, 1), like Math.random. */
	hasard?: () => number
	nombreDeProfils?: number
	/** The guard. Always `garder`, except in the test that proves a broken guard stops the run. */
	garde?: typeof keep
	/** The token of the service for R02. Without it R02 is `inconnu`. */
	jeton?: string | undefined
	/** The Strapi API, for the Strapi part of R05 while it runs. Without it that part is not played. */
	api?: URL | undefined
	/** What reads a certificate: a TLS handshake unless a test stands in for it. */
	certificat?: ReadCertificate
	/** What reads the end date of a domain: the public registry unless a test stands in for it. */
	domaine?: ReadDomain
	/** The date of the run. */
	maintenant?: () => Date
}

const notLaunched = (id: ProbeId, pourquoi: string): Result => ({
	id,
	titre: TITLES[id],
	verdict: 'non lancée',
	constats: [pourquoi],
})

/**
 * Runs R01, then R02 to R06 on the target. A request interrupted by the guard during a probe
 * makes it red and stops the run: a probe that tries to write is broken, whatever it found.
 */
export async function launchProbes({
	cible: target,
	transport,
	horloge = REAL_CLOCK,
	hasard = Math.random,
	nombreDeProfils = PROFILE_COUNT,
	garde = keep,
	jeton,
	api,
	certificat = readCertificate(),
	domaine = readerRdap(transport, horloge),
	maintenant = () => new Date(),
}: ProbeOptions): Promise<Report> {
	const startedAt = horloge.maintenant()
	const results: Result[] = [await probeR01(target, garde)]
	const reader = createReader({ lecture: garde(target, transport, jeton || undefined), horloge })
	const readerApi = api ? createReader({ lecture: garde(api, transport), horloge }) : undefined
	const surveillance = watchOf(target, api)
	const suite: readonly [ProbeId, () => Promise<Result>][] = [
		['R02', async () => since('R02', await probeR02(reader, { jeton, maintenant }))],
		['R03', () => probeR03(reader, hasard, nombreDeProfils)],
		['R04', () => probeR04(reader, hasard)],
		['R05', async () => since('R05', await probeR05({ site: reader, strapi: readerApi }))],
		[
			'R06',
			async () =>
				since(
					'R06',
					surveillance
						? await probeR06({ surveillance, certificat, domaine, maintenant })
						: {
								verdict: 'inconnu',
								constats: ['la cible n’est pas en https : pas de certificat à lire, les domaines ne sont pas lus'],
							}
				),
		],
	]

	let stop = results[0]?.verdict === 'vert' ? undefined : 'la garde ne tient pas (R01) : aucune requête n’est partie'
	for (const [id, probe] of suite) {
		if (stop) {
			results.push(notLaunched(id, stop))
			continue
		}
		try {
			results.push(await probe())
		} catch (error) {
			if (error instanceof ForbiddenRequest) {
				results.push(result(id, false, [error.message]))
				stop = 'une requête interdite a arrêté les sondes'
			} else results.push(result(id, false, [reason(error)]))
		}
	}

	const readers = readerApi ? [reader, readerApi] : [reader]
	const gaps = readers.map(({ departs }) => shortestGap(departs)).filter((ecart): ecart is number => ecart !== null)
	return {
		cible: target.origin,
		resultats: results,
		requetes: readers.reduce((somme, { departs }) => somme + departs.length, 0),
		ecartMinimalMs: gaps.length === 0 ? null : Math.min(...gaps),
		dureeMs: horloge.maintenant() - startedAt,
		vert: results.every(({ verdict }) => verdict === 'vert'),
		rouge: results.some(({ verdict }) => verdict === 'rouge' || verdict === 'non lancée'),
	}
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** The report of a run, in French, as the terminal shows it. */
export function formatReport(rapport: Report): string {
	const lines = [`Sondes en lecture seule vers ${rapport.cible}`, '']
	for (const { id, titre: title, verdict, constats: findings } of rapport.resultats) {
		lines.push(`${id} ${verdict.toUpperCase()} : ${title}`)
		for (const finding of findings) lines.push(`    - ${finding}`)
	}
	const gap =
		rapport.ecartMinimalMs === null
			? ''
			: `, ${Math.round(rapport.ecartMinimalMs)} ms au moins entre deux requêtes (2 par seconde au plus)`
	const unknown = rapport.resultats.filter(({ verdict }) => verdict === 'inconnu').length
	lines.push(
		'',
		`${rapport.requetes} requête${rapport.requetes > 1 ? 's' : ''} GET en ${seconds(rapport.dureeMs)}${gap}.`,
		rapport.vert
			? 'Toutes les sondes sont vertes.'
			: rapport.rouge
				? 'Au moins une sonde est rouge ou n’a pas été lancée.'
				: `Aucune sonde rouge, mais ${unknown} inconnue${unknown > 1 ? 's' : ''} : ce n’est pas un vert.`
	)
	return lines.join('\n')
}

/** The Strapi API to read: `PROBES_API`, an origin; `aucune` once Strapi is stopped. The real site has its API by default. */
export function probeApi(valeur: string | undefined, cible: URL): URL | undefined {
	if (valeur === 'aucune') return undefined
	if (valeur) return probeTarget(valeur)
	return cible.origin === SITE_ORIGIN ? new URL(API_STRAPI_BY_DEFAULT) : undefined
}

if (import.meta.main) {
	let target: URL
	let api: URL | undefined
	try {
		target = probeTarget(process.env.PROBES_TARGET || SITE_ORIGIN)
		api = probeApi(process.env.PROBES_API, target)
	} catch (error) {
		if (!(error instanceof RefusedTarget)) throw error
		console.error(error.message)
		process.exit(2)
	}
	const report = await launchProbes({ cible: target, api, jeton: process.env[TOKEN_NAME] })
	console.log(formatReport(report))
	process.exit(report.rouge ? 1 : 0)
}
