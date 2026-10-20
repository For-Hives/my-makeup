/**
 * The check of a host (ticket 173, docs/tests/controle-hote.md): the check of the day of the switch,
 * and of its rehearsal. It reads, and only reads, every address of the frozen inventory on a given
 * host, then the sitemap, the robots file, the old authentication routes and the script of the
 * audience measurement, and writes a dated report of numbers and fingerprints.
 *
 *   HOST_CHECK_TARGET=https://v3.my-makeup.fr \
 *   HOST_CHECK_ACCESS_USER=… HOST_CHECK_ACCESS_PASSWORD=… bun run cutover:check
 *   HOST_CHECK_TARGET=http://127.0.0.1:3100 bun run cutover:check    # the bench, a build of this machine
 *   HOST_CHECK_TARGET=https://my-makeup.fr bun run cutover:check     # the live site, reads only
 *
 * - The addresses are those of the frozen table (src/lib/frozen-urls.ts) and of the inventory
 *   (docs/migration/urls-inventaire.json), checked like I45 (tests/support/url-parity.ts): the status
 *   the table promises, the single redirect, the same h1 as the old site. The profiles, talents and
 *   articles of the host are the ones its sitemap lists.
 * - Reads only, one request at a time, two per second at most (500 ms between two starts). Every
 *   request goes through scripts/cutover/host-guard.ts. No cookie, no write, no event sent to the
 *   audience measurement: the file of its script is read, nothing else under `/u`.
 * - The report never writes the address of a real profile: a profile is « profil #xxxxxxxx », the
 *   first 8 digits of the SHA-256 of its path. Everything else is counts and fingerprints.
 * - Exit code: 0 all conform, 1 at least one address is not (or a 5xx), 2 the target is refused.
 *
 * No dependency, `fetch` only (and the Node modules of the repository's own tools): the CI runs it
 * without `bun install`, next to the secrets, and Playwright runs `controlerLHote` as it is.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { type Clock, createReader, REAL_CLOCK, type Reader, shortestGap } from '../../tests/probes/reader'
import {
	benchCase,
	check,
	type DatasetData,
	type OldSiteTitles,
	type ParityCase,
	type Result,
	summary,
} from '../../tests/support/url-parity'
import {
	checkTarget,
	ForbiddenQuery,
	type GuardedRead,
	keep,
	TargetRefused,
	TEMPORARY_HOST,
	type Transport,
} from './host-guard'

export { ForbiddenQuery as RequeteInterdite, TargetRefused as CibleRefusee }

/** The variables the command reads. */
export type Variables = Partial<
	Record<'HOST_CHECK_ACCESS_PASSWORD' | 'HOST_CHECK_ACCESS_USER' | 'HOST_CHECK_TARGET' | 'HOST_CHECK_OUTPUT', string>
>

export interface Settings {
	cible: URL
	/** The `Authorization` header of the protected access: the temporary host only. */
	autorisation?: string
	/** Where to write the report as JSON, or nothing. */
	sortie?: string
}

/** The check cannot run as it is set: the message names the variable, never its value. */
export class CheckRefused extends Error {
	override readonly name = 'ControleRefuse'
}

export const SITEMAP_PATH = '/sitemap.xml'
export const ROBOTS_PATH = '/robots.txt'
export const HEALTH_PATH = '/api/health'
export const SCRIPT_PATH = '/u/script.js'

/** The old authentication routes, which the v3 does not serve: each answers 404 to a GET. */
export const OLD_ROUTES: readonly string[] = [
	'/api/auth/signin',
	'/api/auth/signout',
	'/api/auth/session',
	'/api/auth/csrf',
	'/api/auth/providers',
	'/api/auth/callback/credentials',
	'/api/auth/callback/google',
	'/api/sendMail',
]

/** Reads the variables, or `CibleRefusee` / `ControleRefuse` with what to fix. */
export function readSettings(variables: Variables): Settings {
	const brute = variables.HOST_CHECK_TARGET?.trim()
	if (!brute) throw new TargetRefused('HOST_CHECK_TARGET manque : l’hôte à contrôler, comme https://my-makeup.fr.')
	const target = checkTarget(brute)
	const user = variables.HOST_CHECK_ACCESS_USER ?? ''
	const password = variables.HOST_CHECK_ACCESS_PASSWORD ?? ''
	// The protected access of the temporary host is optional (it may be off), but never half given, and
	// never sent anywhere else: an access given for another host is a mistake, not something to drop.
	if ((user === '') !== (password === ''))
		throw new CheckRefused(
			'HOST_CHECK_ACCESS_USER et HOST_CHECK_ACCESS_PASSWORD vont ensemble : donne les deux, ou aucun.'
		)
	if (user !== '' && target.hostname !== TEMPORARY_HOST)
		throw new CheckRefused(
			`HOST_CHECK_ACCESS_USER et HOST_CHECK_ACCESS_PASSWORD ne servent que pour https://${TEMPORARY_HOST} : ils ne partent jamais vers un autre hôte.`
		)
	const authorization = user !== '' ? `Basic ${btoa(`${user}:${password}`)}` : undefined
	const output = variables.HOST_CHECK_OUTPUT?.trim()
	return {
		cible: target,
		...(authorization ? { autorisation: authorization } : {}),
		...(output ? { sortie: output } : {}),
	}
}

/* ------------------------------------------------------------------------------------------
 * Small readers
 * ---------------------------------------------------------------------------------------- */

const sha256 = (texte: string): string => createHash('sha256').update(texte).digest('hex')

/** The 8 first digits of a fingerprint: how a profile, a body or a report is named. */
const short = (texte: string): string => sha256(texte).slice(0, 8)

const path = (loc: string): string | undefined => {
	if (!URL.canParse(loc)) return undefined
	const url = new URL(loc)
	return url.pathname + url.search
}

/** The paths of the `<loc>` of a sitemap. */
export function sitemapAddresses(xml: string): string[] {
	const names: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
	return [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].flatMap(([, loc]) => {
		const readValue = path((loc ?? '').replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, e => names[e] ?? e))
		return readValue ? [readValue] : []
	})
}

const decoder = (segment: string): string => {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

/** The profiles, talents and articles that a sitemap lists: the made-up set of the host. */
export function sitemapSet(chemins: readonly string[]): DatasetData {
	const after = (prefixe: string): string[] =>
		chemins.flatMap(c => {
			const [, first, slug, rest] = c.split('?', 1)[0]?.split('/') ?? []
			return `/${first}/` === prefixe && slug && rest === undefined ? [decoder(slug)] : []
		})
	return {
		profilsVisibles: after('/profil/'),
		profilsMasques: [],
		ancienNom: null,
		talents: after('/talent/'),
		articlesPublies: after('/blog/'),
		articlesBrouillons: [],
	}
}

/* ------------------------------------------------------------------------------------------
 * The report
 * ---------------------------------------------------------------------------------------- */

export type Verdict = 'conforme' | 'non-conforme'

export interface Section {
	titre: string
	conforme: boolean
	/** One line each, in French. Numbers and fingerprints, never the address of a real profile. */
	constats: string[]
}

export interface Report {
	date: string
	hote: string
	/** The `version` of /api/health, or null. */
	version: string | null
	verdict: Verdict
	adresses: {
		controlees: number
		conformes: number
		ecartsConnus: number
		enEchec: number
		aVenir: number
		nonLues: number
	}
	/** Answers 5xx met on any request of the run. */
	reponses5xx: number
	requetes: number
	/** The shortest gap between two starts, in milliseconds. */
	ecartMinimalMs: number | null
	/** Fingerprint of the list « address, state » of the inventory part. */
	empreinte: string
	sections: Section[]
	/** What is not conform, one line each. */
	defauts: string[]
}

export interface Tools {
	/** What reaches the host: `fetch` for a run. */
	transport?: Transport
	horloge?: Clock
	/** Milliseconds between two request starts. */
	intervalleMs?: number
	/** The date of the report. */
	maintenant?: () => Date
	/** The old site's h1, as hashes (tests/fixtures/url-parity-h1.json). */
	anciens?: OldSiteTitles
	/**
	 * Families of the inventory that are not delivered yet in the code under test: their failures are
	 * counted « à venir » and do not make the report non conform. A run on the day of the switch gives
	 * none: every family must conform.
	 */
	aVenir?: ReadonlySet<string>
}

const defaultOldOnes = (): OldSiteTitles =>
	JSON.parse(readFileSync(new URL('../../tests/fixtures/url-parity-h1.json', import.meta.url), 'utf8'))

/** What went wrong with a request: its code, never its text. */
function reason(erreur: unknown): string {
	const cause = (erreur as { cause?: { code?: unknown } } | null)?.cause
	const code = typeof cause?.code === 'string' ? cause.code : (erreur as { name?: unknown } | null)?.name
	return typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? code : 'erreur'
}

/** The profile cases are named by a fingerprint. */
function hideProfiles(cas: ParityCase[], profils: readonly string[]): ParityCase[] {
	const addresses = new Set(profils.map(slug => `/profil/${slug}`))
	return cas.map(c =>
		addresses.has(c.adresse) ? { ...c, etiquette: `profil #${short(c.adresse)}`, masque: true as const } : c
	)
}

/** A sitemap address the inventory does not name: it answers 200 with one h1. */
const sitemapOnlyCase = (adresse: string): ParityCase => ({
	adresse,
	etiquette: adresse,
	famille: 'adresse-du-sitemap',
	statuts: [200],
	statutFinal: 200,
	titre: { mode: 'un' },
})

/**
 * The whole check of a host. Never throws for a host that answers badly (that is a finding of the
 * report); throws `RequeteInterdite` when the guard stops a request, which is a bug of the check.
 */
export async function checkHost(reglages: Settings, outils: Tools = {}): Promise<Report> {
	const { cible: target, autorisation: authorization } = reglages
	const reading: GuardedRead = keep(target, outils.transport, authorization)
	const reader: Reader = createReader({
		lecture: (adresse, init) => reading(String(adresse), init),
		horloge: outils.horloge ?? REAL_CLOCK,
		...(outils.intervalleMs === undefined ? {} : { intervalleMs: outils.intervalleMs }),
	})
	const statuses: number[] = []
	const read = async (adresse: string) => {
		const page = await reader.lire(adresse)
		statuses.push(page.statut)
		return page
	}
	const defaults: string[] = []
	const sections: Section[] = []

	// 1. The version served.
	let version: string | null = null
	try {
		const health = await read(HEALTH_PATH)
		if (health.statut === 200) {
			const corps = JSON.parse(health.corps) as { version?: unknown }
			version = typeof corps.version === 'string' ? corps.version : null
		}
	} catch {
		// Said by the 5xx count and by the case of /api/health below.
	}

	// 2. The sitemap.
	let sitemapUrls: string[] = []
	{
		const problems: string[] = []
		const info: string[] = []
		try {
			const page = await read(SITEMAP_PATH)
			const xml = page.corps
			sitemapUrls = sitemapAddresses(xml)
			const wellFormed = /<urlset[\s>]/.test(xml) && /<\/urlset>/.test(xml)
			const type = (page.type ?? '').includes('xml')
			if (page.statut !== 200) problems.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!type) problems.push('le type de contenu n’est pas du XML')
				if (!wellFormed) problems.push('le document n’est pas un « urlset » complet')
				if (sitemapUrls.length === 0) problems.push('aucune adresse')
			}
			const profiles = sitemapSet(sitemapUrls).profilsVisibles.length
			info.push(`${sitemapUrls.length} adresses dont ${profiles} profils, empreinte ${short(xml)}.`)
		} catch (error) {
			if (error instanceof ForbiddenQuery) throw error
			problems.push(`aucune réponse (${reason(error)})`)
		}
		sections.push({ titre: 'Sitemap', conforme: problems.length === 0, constats: [...problems, ...info] })
		if (problems.length > 0) defaults.push(`Sitemap : ${problems.join(' ; ')}`)
	}

	// 3. The addresses of the inventory, and the ones of the sitemap.
	const sample = sitemapSet(sitemapUrls)
	let scenario = hideProfiles(benchCase(outils.anciens ?? defaultOldOnes(), sample), sample.profilsVisibles)
	// The key file of IndexNow is named by the key of the host: unknown, the address cannot be read.
	// The operator gives it in INDEXNOW_KEY; without it, the address of the table (a key of zeros) is not read.
	const notRead = scenario.filter(c => c.famille === 'verification-indexnow' && /^\/0{32}\.txt$/.test(c.adresse))
	scenario = scenario.filter(c => !notRead.includes(c))
	const known = new Set(scenario.map(c => c.adresse))
	for (const address of new Set(sitemapUrls)) if (!known.has(address)) scenario.push(sitemapOnlyCase(address))
	scenario = [...scenario]
	const results: { cas: ParityCase; resultat: Result }[] = []
	for (const oneScenario of scenario) {
		try {
			const result = await check(oneScenario, async adresse => {
				const page = await read(adresse)
				return {
					status: page.statut,
					location: page.entetes.get('location'),
					contentType: page.type,
					corps: async () => page.corps,
				}
			})
			results.push({ cas: oneScenario, resultat: result })
		} catch (error) {
			if (error instanceof ForbiddenQuery) throw error
			const defaultValue = `aucune réponse (${reason(error)})`
			results.push({ cas: oneScenario, resultat: { etat: 'rouge', defauts: [defaultValue], destination: [] } })
		}
	}
	// Every family counts, but the ones the caller says are not delivered yet.
	const upcoming = outils.aVenir ?? new Set<string>()
	const lines = summary(results, new Set(scenario.map(c => c.famille).filter(famille => !upcoming.has(famille))))
	const failed = lines.flatMap(({ regressions }) => regressions)
	const pending = lines.reduce((total, { aVenir: n }) => total + n, 0)
	const compliant = results.filter(({ resultat: result }) => result.etat === 'vert').length
	const gaps = results.filter(({ resultat: result }) => result.etat === 'ecart').length
	sections.push({
		titre: 'Adresses de l’inventaire',
		conforme: failed.length === 0,
		constats: [
			`${scenario.length} adresses contrôlées : ${compliant} conformes, ${gaps} écarts connus, ${pending} à venir, ${failed.length} en échec.`,
			...(notRead.length > 0
				? [`${notRead.length} adresse non lue : la clé IndexNow de l’hôte n’est pas donnée (INDEXNOW_KEY).`]
				: []),
			...lines.map(
				l =>
					`${l.famille} : ${l.vertes} conformes${l.ecarts ? `, ${l.ecarts} écarts connus` : ''}${l.aVenir ? `, ${l.aVenir} à venir` : ''}${l.regressions.length ? `, ${l.regressions.length} en échec` : ''}`
			),
		],
	})
	defaults.push(...failed)
	const fingerprint = short(
		results
			.map(({ cas: c, resultat: result }) => `${c.etiquette} ${result.etat}`)
			.sort()
			.join('\n')
	)

	// 4. The robots file.
	{
		const problems: string[] = []
		const info: string[] = []
		try {
			const page = await read(ROBOTS_PATH)
			const text = page.corps
			if (page.statut !== 200) problems.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!(page.type ?? '').includes('text/plain')) problems.push('le type de contenu n’est pas du texte brut')
				if (!/^User-agent:/im.test(text)) problems.push('aucune ligne « User-agent »')
				if (!/^Sitemap:\s*\S+\/sitemap\.xml\s*$/im.test(text))
					problems.push('aucune ligne « Sitemap » vers sitemap.xml')
				if (!/^Disallow:\s*\/api\/\s*$/im.test(text)) problems.push('l’API n’est pas interdite')
			}
			info.push(`${text.split('\n').filter(Boolean).length} lignes, empreinte ${short(text)}.`)
		} catch (error) {
			if (error instanceof ForbiddenQuery) throw error
			problems.push(`aucune réponse (${reason(error)})`)
		}
		sections.push({ titre: 'Fichier robots', conforme: problems.length === 0, constats: [...problems, ...info] })
		if (problems.length > 0) defaults.push(`Fichier robots : ${problems.join(' ; ')}`)
	}

	// 5. The old authentication routes.
	{
		const findings: string[] = []
		let is404 = 0
		for (const route of OLD_ROUTES) {
			try {
				const page = await read(route)
				if (page.statut === 404) is404++
				else findings.push(`${route} répond ${page.statut} au lieu de 404`)
			} catch (error) {
				if (error instanceof ForbiddenQuery) throw error
				findings.push(`${route} : aucune réponse (${reason(error)})`)
			}
		}
		const isCompliant = is404 === OLD_ROUTES.length
		sections.push({
			titre: 'Anciennes routes d’authentification',
			conforme: isCompliant,
			constats: [`${is404} sur ${OLD_ROUTES.length} répondent 404.`, ...findings],
		})
		if (!isCompliant) defaults.push(`Anciennes routes : ${findings.join(' ; ')}`)
	}

	// 6. The script of the audience measurement, served by the site (the file is read, no event is sent).
	{
		const problems: string[] = []
		const info: string[] = []
		try {
			const page = await read(SCRIPT_PATH)
			if (page.statut !== 200) problems.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!/javascript/i.test(page.type ?? '')) problems.push('le type de contenu n’est pas du JavaScript')
				if (page.corps.length === 0) problems.push('le fichier est vide')
				info.push(`${new TextEncoder().encode(page.corps).length} octets, empreinte ${short(page.corps)}.`)
			}
		} catch (error) {
			if (error instanceof ForbiddenQuery) throw error
			problems.push(`aucune réponse (${reason(error)})`)
		}
		sections.push({ titre: 'Script de mesure', conforme: problems.length === 0, constats: [...problems, ...info] })
		if (problems.length > 0) defaults.push(`Script de mesure : ${problems.join(' ; ')}`)
	}

	// 7. No 5xx anywhere.
	const fiveHundred = statuses.filter(s => s >= 500).length
	sections.push({
		titre: 'Erreurs serveur',
		conforme: fiveHundred === 0,
		constats: [`${fiveHundred} réponse${fiveHundred > 1 ? 's' : ''} 5xx sur ${statuses.length} requêtes.`],
	})
	if (fiveHundred > 0) defaults.push(`${fiveHundred} réponse(s) 5xx`)

	return {
		date: (outils.maintenant?.() ?? new Date()).toISOString(),
		hote: target.host,
		version,
		verdict: defaults.length === 0 ? 'conforme' : 'non-conforme',
		adresses: {
			controlees: scenario.length,
			conformes: compliant,
			ecartsConnus: gaps,
			enEchec: failed.length,
			aVenir: pending,
			nonLues: notRead.length,
		},
		reponses5xx: fiveHundred,
		requetes: statuses.length,
		ecartMinimalMs: shortestGap(reader.departs),
		empreinte: fingerprint,
		sections,
		defauts: defaults,
	}
}

/** The report as the terminal shows it. */
export function writeReport(rapport: Report): string {
	const lines = [
		`Contrôle de l’hôte ${rapport.hote} le ${rapport.date}`,
		`Version servie : ${rapport.version ?? 'inconnue'}`,
		'',
	]
	for (const { titre: title, conforme: isCompliant, constats: findings } of rapport.sections) {
		lines.push(`${isCompliant ? 'CONFORME    ' : 'NON CONFORME'} ${title}`)
		for (const finding of findings) lines.push(`    ${finding}`)
	}
	lines.push(
		'',
		`Requêtes : ${rapport.requetes}, écart le plus court entre deux départs : ${rapport.ecartMinimalMs ?? 'sans objet'} ms.`,
		`Empreinte des adresses : ${rapport.empreinte}`,
		`Verdict : ${rapport.verdict === 'conforme' ? 'CONFORME' : `NON CONFORME (${rapport.defauts.length} défaut${rapport.defauts.length > 1 ? 's' : ''})`}`
	)
	return lines.join('\n')
}

/** The command: exit code 0, 1 or 2. */
export async function run(variables: Variables, ecrire: (ligne: string) => void = console.log): Promise<number> {
	let settings: Settings
	try {
		settings = readSettings(variables)
	} catch (error) {
		if (error instanceof TargetRefused || error instanceof CheckRefused) {
			ecrire(`Contrôle refusé : ${error.message}`)
			return 2
		}
		throw error
	}
	try {
		const report = await checkHost(settings)
		ecrire(writeReport(report))
		if (settings.sortie) writeFileSync(settings.sortie, `${JSON.stringify(report, null, 2)}\n`)
		return report.verdict === 'conforme' ? 0 : 1
	} catch (error) {
		ecrire(
			`Contrôle arrêté : ${error instanceof ForbiddenQuery ? error.message : `une requête a échoué (${reason(error)})`}`
		)
		return 1
	}
}
