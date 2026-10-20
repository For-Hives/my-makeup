import { describe, expect, test } from 'bun:test'
import { SPAM_PROFILES } from '../../scripts/migration/import/profiles'
import type { CollectionParity, CollectionSummary, Report } from '../../scripts/migration/import/report'
import { READ_TABLES, type TablesFingerprint } from '../../scripts/migration/import/source'
import {
	BUDGET_MINUTES,
	findPersonalData,
	formatDuration,
	judgeRun,
	parityProblems,
	pgRestoreArguments,
	readRehearsalArguments,
	remainingMs,
	secondPassProblems,
	snapshotRows,
	totalMs,
} from '../../scripts/migration/rehearsal/logic'

/**
 * Ticket 180: the pure parts of the full rehearsal. No database, no process: the run itself is in
 * tests/integration/rehearsal.test.ts. Every number here is fictional.
 */

const REQUIRED = ['--dump', 'nuit.dump', '--decisions', 'd.json', '--cities', 'c.json', '--consent-date', '2026-11-02']

describe('la ligne de commande de la répétition', () => {
	test('les quatre options obligatoires suffisent, le reste a un défaut', () => {
		expect(readRehearsalArguments(REQUIRED, '2026-10-21T10-00-00-000Z')).toEqual({
			dump: 'nuit.dump',
			decisions: 'd.json',
			cities: 'c.json',
			citiesOnline: false,
			consentDate: '2026-11-02',
			out: '.migration/repetition-2026-10-21T10-00-00-000Z',
			keepBench: false,
			maxMinutes: BUDGET_MINUTES,
		})
	})

	test('les options facultatives se lisent', () => {
		const options = readRehearsalArguments(
			[...REQUIRED, '--cities-online', '--keep-bench', '--out', 'privé', '--max-minutes', '90'],
			'x'
		)
		expect(options).toMatchObject({ citiesOnline: true, keepBench: true, out: 'privé', maxMinutes: 90 })
	})

	test('une option manquante, inconnue, sans valeur ou hors borne n’est pas comprise', () => {
		expect(readRehearsalArguments(REQUIRED.slice(2), 'x')).toBeNull()
		expect(readRehearsalArguments([...REQUIRED, '--real'], 'x')).toBeNull()
		expect(readRehearsalArguments([...REQUIRED, '--out'], 'x')).toBeNull()
		expect(readRehearsalArguments([...REQUIRED, '--out', '--keep-bench'], 'x')).toBeNull()
		expect(readRehearsalArguments([...REQUIRED, '--max-minutes', '0'], 'x')).toBeNull()
		expect(readRehearsalArguments([...REQUIRED, '--max-minutes', '2h'], 'x')).toBeNull()
	})

	test('le temps permis par défaut est de deux heures', () => {
		expect(BUDGET_MINUTES).toBe(120)
	})
})

describe('pg_restore ne restaure que les seize tables de l’import', () => {
	const args = pgRestoreArguments({ user: 'banc', database: 'strapi_source_test' })

	test('une option --table par table lue par l’import, et aucune autre', () => {
		const tables = args.flatMap((arg, rank) => (arg === '--table' ? [args[rank + 1]] : []))
		expect(tables).toEqual([...READ_TABLES])
		expect(tables).toHaveLength(16)
	})

	test('sans propriétaire ni droit, sur la base donnée, et sans mot de passe en argument', () => {
		expect(args[0]).toBe('pg_restore')
		expect(args).toContain('--no-owner')
		expect(args).toContain('--no-privileges')
		expect(args.join(' ')).toContain('--dbname strapi_source_test')
		expect(args.join(' ')).not.toMatch(/password|PGPASSWORD|postgres:\/\//i)
		// The backup is read on the standard input: no file name ends the list.
		expect(args.at(-1)).toBe(READ_TABLES.at(-1))
	})
})

describe('le temps de la répétition', () => {
	const steps = [
		{ name: 'a', ms: 60_000 },
		{ name: 'b', ms: 30_500 },
	]

	test('le total et le temps restant se tirent des étapes', () => {
		expect(totalMs(steps)).toBe(90_500)
		expect(remainingMs(120, steps)).toBe(7_200_000 - 90_500)
	})

	test('le temps restant est un entier d’au moins une seconde, même budget dépassé', () => {
		expect(Number.isInteger(remainingMs(1, [{ name: 'x', ms: 1234.5678 }]))).toBe(true)
		expect(remainingMs(1, [{ name: 'x', ms: 90_000 }])).toBe(1000)
	})

	test('les durées s’écrivent en français', () => {
		expect(formatDuration(7300)).toBe('7,3 s')
		expect(formatDuration(245_000)).toBe('4 min 05 s')
		expect(formatDuration(3_723_000)).toBe('1 h 02 min 03 s')
		expect(formatDuration(7_200_000)).toBe('2 h 00 min 00 s')
	})
})

describe('le rapport ne porte aucune donnée personnelle', () => {
	test('un « @ » ou un hash bcrypt est vu, un texte de nombres ne l’est pas', () => {
		expect(findPersonalData('contact: alice@example.test')).toEqual(['email'])
		expect(findPersonalData('{"h":"$2a$10$abcdefghijklmnopqrstuv"}')).toEqual(['hash'])
		expect(findPersonalData('a@b $2b$12$x')).toEqual(['email', 'hash'])
		expect(findPersonalData('Comptes : 88 à la source ; sha 081b3f4f ; 0 création')).toEqual([])
	})
})

// ---------------------------------------------------------------------------------------------
// The judgement of the two passes, on reports built by hand.

const rows = (n: number) => ({ rows: n, fingerprint: `f${n}` })
const SNAPSHOT: TablesFingerprint = {
	up_users: rows(114),
	makeup_artistes: rows(100),
	articles: rows(6),
	talents: rows(14),
	pg_largeobject_metadata: { rows: 0, fingerprint: '' },
}
const DISTRIBUTION = { providers: { local: 65, google: 37, facebook: 9 }, legacyHashes: 65 }

const parity = (expected: number, extra: Partial<CollectionParity> = {}): CollectionParity => ({
	expected,
	present: expected,
	equal: expected,
	refused: [],
	different: [],
	missing: [],
	extra: [],
	expectedFingerprint: 'same',
	targetFingerprint: 'same',
	...extra,
})

const summary = (source: number, extra: Partial<CollectionSummary> = {}): CollectionSummary => ({
	source,
	created: source,
	updated: 0,
	unchanged: 0,
	refused: [],
	extra: [],
	...extra,
})

function firstPass(): Report {
	return {
		mode: 'real',
		target: 'local',
		halt: null,
		source: { before: SNAPSHOT, after: SNAPSHOT, unchanged: true },
		collections: {
			pros: summary(114, { distribution: DISTRIBUTION }),
			profiles: summary(100, { spam: [...SPAM_PROFILES] }),
			articles: summary(6),
			talents: summary(14),
			media: summary(0),
		},
		gaps: {},
		pointlessDecisions: 0,
		parity: {
			pros: { ...parity(111), distribution: DISTRIBUTION },
			profiles: parity(87),
			articles: parity(6),
			talents: parity(14),
			media: parity(0),
		},
	} as unknown as Report
}

function secondPass(): Report {
	const unchanged = (source: number) => summary(source, { created: 0, unchanged: source })
	return {
		...firstPass(),
		collections: {
			pros: unchanged(114),
			profiles: unchanged(100),
			articles: unchanged(6),
			talents: unchanged(14),
			media: unchanged(0),
		},
		parity: null,
	} as unknown as Report
}

const evidence = (changes: Partial<Parameters<typeof judgeRun>[0]> = {}) => ({
	snapshot: SNAPSHOT,
	snapshotAfter: SNAPSHOT,
	first: firstPass(),
	second: secondPass(),
	spamInTarget: 0,
	...changes,
})

const verdict = (changes: Partial<Parameters<typeof judgeRun>[0]> = {}) =>
	Object.fromEntries(judgeRun(evidence(changes)).map(c => [c.id, c.met]))

describe('les critères que jugent les deux passages', () => {
	test('une répétition sans écart remplit les quatre critères', () => {
		expect(verdict()).toEqual({ parity: true, spam: true, 'second-pass': true, source: true })
		expect(snapshotRows(SNAPSHOT)).toMatchObject({ up_users: 114, pg_largeobject_metadata: 0 })
	})

	test('un compte qui manque à la cible fait échouer la parité, et seulement elle', () => {
		const first = firstPass()
		first.parity = {
			...first.parity,
			pros: { ...parity(111, { present: 110, missing: [27] }), distribution: DISTRIBUTION },
		}
		expect(verdict({ first })).toEqual({ parity: false, spam: true, 'second-pass': true, source: true })
		expect(parityProblems(first, SNAPSHOT)).toEqual(['pros : parité incomplète'])
	})

	test('un document refusé ou une empreinte différente fait échouer la parité', () => {
		const refused = firstPass()
		refused.parity = { ...refused.parity, talents: parity(14, { refused: [3] }) }
		const fingerprint = firstPass()
		fingerprint.parity = { ...fingerprint.parity, articles: parity(6, { targetFingerprint: 'other' }) }
		expect(verdict({ first: refused }).parity).toBe(false)
		expect(verdict({ first: fingerprint }).parity).toBe(false)
	})

	test('une source du rapport qui n’est pas l’instantané fait échouer la parité', () => {
		const first = firstPass()
		first.collections.profiles = summary(99, { spam: [...SPAM_PROFILES] })
		expect(parityProblems(first, SNAPSHOT)).toEqual(['profiles : 99 à la source du rapport, 100 dans l’instantané'])
	})

	test('des hash hérités ou des fournisseurs qui diffèrent font échouer la parité (I44)', () => {
		const first = firstPass()
		first.parity = { ...first.parity, pros: { ...parity(111), distribution: { ...DISTRIBUTION, legacyHashes: 64 } } }
		expect(parityProblems(first, SNAPSHOT)).toEqual([
			'pros : fournisseurs ou hash hérités différents de la source (I44)',
		])
		// The order of the providers is not a difference.
		const reordered = firstPass()
		reordered.parity = {
			...reordered.parity,
			pros: { ...parity(111), distribution: { legacyHashes: 65, providers: { facebook: 9, local: 65, google: 37 } } },
		}
		expect(parityProblems(reordered, SNAPSHOT)).toEqual([])
	})

	test('un arrêt sur des cas à décider, ou un passage à blanc, n’est pas une parité', () => {
		const halted = firstPass()
		halted.halt = { sharedEmails: [[1, 2]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] }
		const dry = { ...firstPass(), mode: 'dry-run', parity: null } as Report
		expect(verdict({ first: halted }).parity).toBe(false)
		expect(verdict({ first: dry }).parity).toBe(false)
	})

	test('un profil du spam dans la cible fait échouer le critère, comme un profil hors de la liste', () => {
		expect(verdict({ spamInTarget: 1 }).spam).toBe(false)
		const first = firstPass()
		first.collections.profiles = summary(100, { spam: [...SPAM_PROFILES, 500] })
		expect(verdict({ first }).spam).toBe(false)
		expect(SPAM_PROFILES).toHaveLength(13)
	})

	test('la requête du compte du spam qui échoue (-1) n’est pas une absence', () => {
		expect(verdict({ spamInTarget: -1 }).spam).toBe(false)
	})

	test('une création ou une mise à jour au second passage le fait échouer', () => {
		const created = secondPass()
		created.collections.pros = summary(114, { created: 1, unchanged: 113 })
		const updated = secondPass()
		updated.collections.articles = summary(6, { created: 0, updated: 2, unchanged: 4 })
		expect(verdict({ second: created })['second-pass']).toBe(false)
		expect(verdict({ second: updated })['second-pass']).toBe(false)
		expect(secondPassProblems(created)).toEqual(['pros : 1 création(s), 0 mise(s) à jour, 0 refusé(s)'])
		expect(secondPassProblems(secondPass())).toEqual([])
	})

	test('une table de la copie qui change pendant les passages fait échouer la source', () => {
		const after = { ...SNAPSHOT, articles: rows(7) }
		expect(verdict({ snapshotAfter: after }).source).toBe(false)
		const moved = firstPass()
		moved.source = { ...moved.source, unchanged: false }
		expect(verdict({ first: moved }).source).toBe(false)
	})

	test('un grand objet dans la copie fait échouer la source', () => {
		const withObject = { ...SNAPSHOT, pg_largeobject_metadata: { rows: 1, fingerprint: 'x' } }
		const first = firstPass()
		first.source = { ...first.source, before: withObject }
		expect(verdict({ snapshot: withObject, snapshotAfter: withObject, first }).source).toBe(false)
	})
})
