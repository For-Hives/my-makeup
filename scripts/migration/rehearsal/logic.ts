/**
 * The pure parts of the full rehearsal of the migration (docs/migration/IMPORT.md, « La répétition
 * complète », ticket 180): the command line, the arguments of `pg_restore`, the time budget, the
 * judgement of the criteria and the scan of the files for personal data. Nothing here touches a
 * database, a file or a process, so each part is tested alone.
 */

import type { ImportedCollection } from '../import/engine'
import { SPAM_PROFILES } from '../import/profiles'
import type { Report } from '../import/report'
import { READ_TABLES, type TablesFingerprint } from '../import/source'

/** The longest a rehearsal may take, from the backup to the report (plan 01 §5 P9.1). */
export const BUDGET_MINUTES = 120

/** The bench instance a rehearsal works on when the environment names none, so it never shares the default bench. */
export const REHEARSAL_INSTANCE = 'mm-rehearsal'
export const REHEARSAL_OFFSET = '180'

export interface RehearsalOptions {
	/** The backup, a `pg_dump` custom-format file. Read, never written. */
	dump: string
	/** The table of decisions of the accounts that share an email (ticket 066). */
	decisions: string
	/** The kept answers of the referential of the communes. */
	cities: string
	/** Ask the referential for the answers not kept yet (the only step that reaches the Internet). */
	citiesOnline: boolean
	/** The date of the switch, passed to the import as the consent date. */
	consentDate: string
	/** The private folder the reports and logs are written to. */
	out: string
	/** Leave the bench running when the rehearsal is done (the copy is destroyed all the same). */
	keepBench: boolean
	maxMinutes: number
}

export const USAGE = [
	'Usage : bun run rehearsal --dump <sauvegarde.dump> --decisions <fichier.json> --cities <fichier.json> --consent-date <date>',
	'                         [--cities-online] [--out <dossier>] [--keep-bench] [--max-minutes <n>]',
	'  --dump           la sauvegarde de la nuit, au format personnalisé de pg_dump : lue, jamais écrite',
	'  --decisions      la table de décision des comptes au même email (hors du dépôt)',
	'  --cities         les réponses gardées du référentiel des communes ; le fichier doit exister, sauf avec --cities-online',
	'  --cities-online  demande au référentiel les réponses qui manquent (seul passage qui sort sur Internet)',
	'  --consent-date   la date de bascule de la répétition (2026-11-02, ou avec heure et fuseau)',
	'  --out            le dossier privé des rapports et des journaux (défaut : .migration/repetition-<horodatage>)',
	'  --keep-bench     laisse le banc allumé à la fin ; la copie est détruite quand même',
	`  --max-minutes    le temps permis, de la sauvegarde au rapport (défaut : ${BUDGET_MINUTES})`,
].join('\n')

const WITH_VALUE = {
	'--dump': 'dump',
	'--decisions': 'decisions',
	'--cities': 'cities',
	'--consent-date': 'consentDate',
	'--out': 'out',
	'--max-minutes': 'maxMinutes',
} as const

/** The options of the command line, or `null` when it is not understood. */
export function readRehearsalArguments(args: readonly string[], timestamp: string): RehearsalOptions | null {
	const values: Record<string, string> = {}
	let keepBench = false
	let citiesOnline = false
	for (let rank = 0; rank < args.length; rank++) {
		const option = args[rank] ?? ''
		if (option === '--keep-bench') keepBench = true
		else if (option === '--cities-online') citiesOnline = true
		else if (option in WITH_VALUE) {
			const value = args[++rank]
			if (value === undefined || value.startsWith('--')) return null
			values[WITH_VALUE[option as keyof typeof WITH_VALUE]] = value
		} else return null
	}
	const { dump, decisions, cities, consentDate } = values
	if (!dump || !decisions || !cities || !consentDate) return null
	const minutes = values.maxMinutes === undefined ? BUDGET_MINUTES : Number(values.maxMinutes)
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null
	return {
		dump,
		decisions,
		cities,
		citiesOnline,
		consentDate,
		out: values.out ?? `.migration/repetition-${timestamp}`,
		keepBench,
		maxMinutes: minutes,
	}
}

/**
 * The arguments of `pg_restore` that restore the tables the import reads and nothing else: no
 * owner, no privilege, no token table, no administration account. It runs inside the PostgreSQL
 * container of the bench and reads the backup on its standard input.
 */
export function pgRestoreArguments(connection: { user: string; database: string }): string[] {
	return [
		'pg_restore',
		'--no-owner',
		'--no-privileges',
		'--username',
		connection.user,
		'--dbname',
		connection.database,
		...READ_TABLES.flatMap(table => ['--table', table]),
	]
}

/** One timed step of the rehearsal. */
export interface Step {
	name: string
	ms: number
}

export const totalMs = (steps: readonly Step[]): number => steps.reduce((sum, step) => sum + step.ms, 0)

/** The time left of the budget, in milliseconds, never below 1 s so a child process gets a deadline. */
export const remainingMs = (maxMinutes: number, steps: readonly Step[]): number =>
	Math.max(1000, Math.floor(maxMinutes * 60_000 - totalMs(steps)))

/** « 1 h 02 min 03 s », « 4 min 05 s » or « 7,3 s ». */
export function formatDuration(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
	const totalSeconds = Math.round(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	const two = (n: number) => String(n).padStart(2, '0')
	return hours > 0 ? `${hours} h ${two(minutes)} min ${two(seconds)} s` : `${minutes} min ${two(seconds)} s`
}

/** The kinds of personal data a text must not hold: any `@` (an email) and a bcrypt hash. */
export function findPersonalData(text: string): ('email' | 'hash')[] {
	const kinds: ('email' | 'hash')[] = []
	if (text.includes('@')) kinds.push('email')
	if (/\$2[abxy]\$/.test(text)) kinds.push('hash')
	return kinds
}

/** One criterion of the ticket, judged, with what shows it. */
export interface Criterion {
	id: 'time' | 'parity' | 'spam' | 'second-pass' | 'source' | 'personal-data' | 'destroyed'
	met: boolean
	evidence: string
}

/** The collections whose rows the snapshot of the copy counts, and the table each one comes from. */
const SNAPSHOT_TABLES: Readonly<Partial<Record<ImportedCollection, string>>> = {
	pros: 'up_users',
	profiles: 'makeup_artistes',
	articles: 'articles',
	talents: 'talents',
}

export interface RunEvidence {
	/** The snapshot of the copy, taken right after the restore. */
	snapshot: TablesFingerprint
	/** The same fingerprint, taken again once both passes are done. */
	snapshotAfter: TablesFingerprint
	first: Report
	second: Report
	/** How many of the profiles of the spam list the target holds. */
	spamInTarget: number
}

const sameFingerprints = (a: TablesFingerprint, b: TablesFingerprint): boolean =>
	JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

/** The collections of the first real pass whose parity is not complete, or whose count is not the snapshot's. */
export function parityProblems(first: Report, snapshot: TablesFingerprint): string[] {
	const problems: string[] = []
	if (first.halt) problems.push('le passage s’est arrêté sur des cas à décider')
	if (first.mode !== 'real' || first.parity === null) problems.push('le passage n’est pas un passage réel')
	for (const [name, parity] of Object.entries(first.parity ?? {})) {
		const complete =
			parity.expected === parity.present &&
			parity.present === parity.equal &&
			parity.refused.length === 0 &&
			parity.different.length === 0 &&
			parity.missing.length === 0 &&
			parity.extra.length === 0 &&
			parity.expectedFingerprint === parity.targetFingerprint
		if (!complete) problems.push(`${name} : parité incomplète`)
	}
	// I44: the target splits the accounts per provider, and holds the legacy hashes, as the source gave them.
	const expected = first.collections.pros?.distribution
	const found = first.parity?.pros?.distribution
	const sorted = (d: typeof expected) =>
		JSON.stringify({ legacyHashes: d?.legacyHashes, providers: Object.entries(d?.providers ?? {}).sort() })
	if (expected === undefined || found === undefined || sorted(expected) !== sorted(found))
		problems.push('pros : fournisseurs ou hash hérités différents de la source (I44)')
	for (const [collection, table] of Object.entries(SNAPSHOT_TABLES)) {
		const summary = first.collections[collection as ImportedCollection]
		const rows = snapshot[table]?.rows
		if (summary === undefined || rows === undefined)
			problems.push(`${collection} : absent du rapport ou de l’instantané`)
		else if (summary.source !== rows)
			problems.push(`${collection} : ${summary.source} à la source du rapport, ${rows} dans l’instantané`)
	}
	return problems
}

/** The collections of the second pass that created or updated something, or refused it. */
export function secondPassProblems(second: Report): string[] {
	const problems: string[] = []
	if (second.halt) problems.push('le second passage s’est arrêté sur des cas à décider')
	for (const [name, summary] of Object.entries(second.collections))
		if (summary.created + summary.updated + summary.refused.length > 0)
			problems.push(
				`${name} : ${summary.created} création(s), ${summary.updated} mise(s) à jour, ${summary.refused.length} refusé(s)`
			)
	return problems
}

/**
 * Judges the criteria that the two passes decide: parity, spam absent, second pass, source
 * unchanged. The time, the personal data and the destruction are judged by the command, which
 * alone knows them.
 */
export function judgeRun({ snapshot, snapshotAfter, first, second, spamInTarget }: RunEvidence): Criterion[] {
	const parity = parityProblems(first, snapshot)
	const secondProblems = secondPassProblems(second)
	const spamSeen = first.collections.profiles?.spam ?? []
	const unlisted = spamSeen.filter(id => !SPAM_PROFILES.includes(id))
	const sourceUnchanged =
		first.source.unchanged &&
		second.source.unchanged &&
		sameFingerprints(snapshot, snapshotAfter) &&
		sameFingerprints(snapshot, first.source.before)
	const largeObjects = snapshot.pg_largeobject_metadata?.rows ?? 0
	const profiles = first.collections.profiles
	return [
		{
			id: 'parity',
			met: parity.length === 0,
			evidence:
				parity.length === 0
					? `parité complète sur ${Object.keys(first.parity ?? {}).length} collections, comptes et lignes égaux à l’instantané du jour`
					: parity.join(' ; '),
		},
		{
			id: 'spam',
			met: spamInTarget === 0 && unlisted.length === 0,
			evidence: `${spamInTarget} des ${SPAM_PROFILES.length} profils exclus dans la cible ; ${spamSeen.length} présents dans la copie et écartés par l’import${profiles ? '' : ' (aucun profil dans le rapport)'}`,
		},
		{
			id: 'second-pass',
			met: secondProblems.length === 0,
			evidence:
				secondProblems.length === 0
					? `0 création, 0 mise à jour, 0 refusé sur ${Object.keys(second.collections).length} collections`
					: secondProblems.join(' ; '),
		},
		{
			id: 'source',
			met: sourceUnchanged && largeObjects === 0,
			evidence: `copie inchangée par les deux passages (${Object.keys(snapshot).length - 1} tables et les grands objets, mêmes empreintes) ; ${largeObjects} grand objet`,
		},
	]
}

/** The tables whose rows the rehearsal reports: the snapshot, as numbers only. */
export function snapshotRows(snapshot: TablesFingerprint): Record<string, number> {
	return Object.fromEntries(Object.entries(snapshot).map(([table, line]) => [table, line.rows]))
}
