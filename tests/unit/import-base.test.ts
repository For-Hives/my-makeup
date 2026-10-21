import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SanitizedConfig } from 'payload'
import { readArguments, renamedOptionHint } from '../../scripts/migration/import/arguments'
import { readDecisions } from '../../scripts/migration/import/decisions'
import {
	type Adapter,
	documentsFingerprint,
	type Existing,
	type Expected,
	errorCode,
	InterruptedImport,
	normalize,
	parity,
	parityComplete,
	planActions,
	unexpectedErrorMessage,
	withoutUnexplainedGap,
} from '../../scripts/migration/import/engine'
import { checkAsText, checkExitCode, exitCode, type Report, reportAsText } from '../../scripts/migration/import/report'
import { sameTables } from '../../scripts/migration/import/source'
import { expectedTalent, expectedTalents, type TalentRow } from '../../scripts/migration/import/talents'
import {
	configurationWithoutSchemaChange,
	ImportRefuse,
	verifyExpectedDatabase,
	verifyTarget,
} from '../../scripts/migration/import/target'
import { IMPORT_CONTEXT, isImport } from '../../src/lib/import-context'

/**
 * Ticket 024: the parts of the import that need no database. The runs themselves are in
 * tests/integration/import-talents.test.ts, on the bench.
 */

describe('la cible : une base de ce poste, ou une base distante que la commande nomme', () => {
	test('une base locale est acceptée, avec ou sans drapeau', () => {
		for (const host of ['127.0.0.1:5443', 'localhost:5442', '[::1]:5432'])
			expect(verifyTarget(`postgres://u:p@${host}/base`, { remoteTarget: false })).toBe('local')
		expect(verifyTarget('postgres://u:p@127.0.0.1/base', { remoteTarget: true, expectedDatabase: 'base' })).toBe(
			'local'
		)
	})

	test('une base distante est refusée sans le drapeau, acceptée avec', () => {
		const remote = [
			'postgres://u:p@base.example.test:5432/prod',
			'postgres://u:p@10.0.0.5/prod',
			// A host parameter replaces the host of the address: it counts.
			'postgres://u:p@127.0.0.1/prod?host=base.example.test',
			'pas une adresse',
		]
		for (const url of remote) {
			expect(() => verifyTarget(url, { remoteTarget: false }), url).toThrow(ImportRefuse)
			expect(verifyTarget(url, { remoteTarget: true, expectedDatabase: 'prod' }), url).toBe('remote')
		}
	})

	test('Payload se branche sur la cible sans en changer le schéma : ni poussée, ni migration', () => {
		const before = process.env.PAYLOAD_MIGRATING
		const toggle = (): string | undefined => process.env.PAYLOAD_MIGRATING
		const adapter = { name: 'postgres', prodMigrations: [{ name: 'socle' }] }
		const config = { db: { name: 'postgres', init: () => adapter } } as unknown as SanitizedConfig
		try {
			delete process.env.PAYLOAD_MIGRATING
			const forImport = configurationWithoutSchemaChange(config)

			// Payload's own switch: no push of the schema when it connects.
			expect(toggle()).toBe('true')
			// No migration played when it connects in production; the adapter is the same otherwise.
			const created = forImport.db.init({ payload: {} as never }) as unknown as typeof adapter
			expect(created).toBe(adapter)
			expect(created.prodMigrations).toBeUndefined()
			expect(created.name).toBe('postgres')
			expect(forImport.db.name).toBe('postgres')
		} finally {
			if (before === undefined) delete process.env.PAYLOAD_MIGRATING
			else process.env.PAYLOAD_MIGRATING = before
		}
	})

	test('le refus nomme la variable et le drapeau, jamais l’adresse', () => {
		const url = 'postgres://utilisateur:secret-de-test@base.example.test:5432/prod'
		let message = ''
		try {
			verifyTarget(url, { remoteTarget: false })
		} catch (error) {
			message = (error as Error).message
		}
		expect(message).toContain('DATABASE_URI')
		expect(message).toContain('--remote-target')
		for (const chunk of ['base.example.test', 'secret-de-test', 'utilisateur']) expect(message).not.toContain(chunk)
		expect(() => verifyTarget(undefined, { remoteTarget: true, expectedDatabase: 'prod' })).toThrow(
			'DATABASE_URI manque'
		)
	})
})

describe('L9 (ticket 233) : --remote-target exige --expected-database, et la base doit porter ce nom', () => {
	test('--remote-target sans --expected-database est refusé (code 1), avant la lecture de l’adresse', () => {
		for (const url of ['postgres://u:p@base.example.test:5432/prod', 'postgres://u:p@127.0.0.1/base', undefined]) {
			let message = ''
			try {
				verifyTarget(url, { remoteTarget: true })
			} catch (error) {
				expect(error).toBeInstanceOf(ImportRefuse)
				message = (error as Error).message
			}
			expect(message, String(url)).toContain('--remote-target exige --expected-database')
			expect(message).not.toContain('example.test')
		}
		expect(() =>
			verifyTarget('postgres://u:p@base.example.test/prod', { remoteTarget: true, expectedDatabase: '' })
		).toThrow(ImportRefuse)
	})

	test('une base locale sans le drapeau n’a pas besoin du nom', () => {
		expect(verifyTarget('postgres://u:p@127.0.0.1/base', { remoteTarget: false })).toBe('local')
	})

	test('an old name of an option is refused with the new name', () => {
		expect(readArguments(['--reel'])).toBeNull()
		expect(readArguments(['--review', 'revue.md'])).toBeNull()
		expect(readArguments(['--review', 'revue.json'])).toMatchObject({ review: 'revue.json' })
		expect(renamedOptionHint(['--reel', '--controle'])).toBe(
			'--reel s’appelle maintenant --real.\n--controle s’appelle maintenant --check.'
		)
		expect(renamedOptionHint(['--real', '--check'])).toBeNull()
	})

	test('--expected-database prend un nom, et ne se répète pas', () => {
		expect(readArguments(['--expected-database'])).toBeNull()
		expect(readArguments(['--expected-database', '--real'])).toBeNull()
		expect(readArguments(['--expected-database', 'a', '--expected-database', 'b'])).toBeNull()
	})

	const payload = (base: string | undefined) =>
		({
			db: { pool: { query: async () => ({ rows: base === undefined ? [] : [{ base }] }) } },
		}) as unknown as Parameters<typeof verifyExpectedDatabase>[0]

	test('la base qui donne le nom attendu passe ; une autre est refusée sans dire laquelle', async () => {
		await expect(verifyExpectedDatabase(payload('mymakeup_v3'), 'mymakeup_v3')).resolves.toBeUndefined()
		let message = ''
		try {
			await verifyExpectedDatabase(payload('mymakeup_preprod_ancienne'), 'mymakeup_v3')
		} catch (error) {
			expect(error).toBeInstanceOf(ImportRefuse)
			message = (error as Error).message
		}
		expect(message).toContain('« mymakeup_v3 »')
		expect(message).toContain('--expected-database')
		expect(message).not.toContain('mymakeup_preprod_ancienne')
		await expect(verifyExpectedDatabase(payload(undefined), 'mymakeup_v3')).rejects.toBeInstanceOf(ImportRefuse)
	})
})

describe('L1 (ticket 233) : les deux scripts qui écrivent dans une base ne lisent jamais le .env de travail', () => {
	test('migration:import et admin:create portent --no-env-file', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(scripts['migration:import']).toBe('bun --no-env-file scripts/migration/import.ts')
		expect(scripts['admin:create']).toBe('bun --no-env-file scripts/admin/create-admin.ts')
	})

	test('bench:import (qui n’est pas migration:import) le porte aussi, et charge import.ts en direct', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(scripts['bench:import']).toBe('bun --no-env-file scripts/migration/bench-import.ts')
	})
})

describe('la ligne de commande : à blanc par défaut', () => {
	test('sans option, rien n’est écrit ; --real écrit', () => {
		expect(readArguments([])).toEqual({ mode: 'dry-run', remoteTarget: false })
		expect(readArguments(['--real', '--remote-target', '--report', 'r.json'])).toEqual({
			mode: 'real',
			remoteTarget: true,
			report: 'r.json',
		})
		expect(readArguments(['--remote-target', '--expected-database', 'mymakeup_v3'])).toEqual({
			mode: 'dry-run',
			remoteTarget: true,
			expectedDatabase: 'mymakeup_v3',
		})
	})

	test('--without-photos ne prend pas de valeur et ne se répète pas', () => {
		expect(readArguments(['--without-photos'])).toEqual({ mode: 'dry-run', remoteTarget: false, withoutPhotos: true })
		expect(readArguments(['--without-photos', '--without-photos'])).toBeNull()
	})

	test('--check est un passage à blanc : il ne va pas avec --real', () => {
		expect(readArguments(['--check'])).toEqual({ mode: 'dry-run', remoteTarget: false, check: true })
		expect(readArguments(['--check', '--real'])).toBeNull()
		expect(readArguments(['--real', '--check'])).toBeNull()
	})

	test('une option inconnue, répétée ou sans sa valeur n’est pas comprise', () => {
		for (const line of [['--prod'], ['--real', '--real'], ['--report'], ['--report', '--real'], ['real']])
			expect(readArguments(line), line.join(' ')).toBeNull()
	})
})

describe('le contexte d’import', () => {
	test('il se reconnaît, et rien d’autre ne passe pour lui', () => {
		expect(isImport(IMPORT_CONTEXT)).toBe(true)
		expect(isImport({ ...IMPORT_CONTEXT, profilAutomatique: false })).toBe(true)
		for (const other of [undefined, {}, { import: 'true' }, { import: 1 }]) expect(isImport(other)).toBe(false)
	})
})

const ADAPTER: Adapter = {
	collection: 'talents',
	fields: { title: 'texte', publishedAt: 'date', strapiId: 'nombre' },
}

const expected = (strapiId: number, title: string | null, publishedAt: string | null = null): Expected => ({
	strapiId,
	values: { strapiId, title, publishedAt },
	gaps: [],
})

const existing = (id: number, strapiId: number, title?: string | null, publishedAt?: string | null): Existing => ({
	id,
	values: { strapiId, title, publishedAt },
})

describe('le moteur : chaque document retrouvé par son strapiId', () => {
	test('une valeur se compare normalisée : vide et nul se valent, une date est un instant', () => {
		expect(normalize('texte', undefined)).toBeNull()
		expect(normalize('date', '2023-04-01T09:00:00Z')).toBe('2023-04-01T09:00:00.000Z')
		expect(normalize('date', new Date('2023-04-01T09:00:00.000Z'))).toBe('2023-04-01T09:00:00.000Z')
		expect(normalize('relation', { id: 4, email: 'x' })).toBe(4)
		expect(normalize('relation', '4')).toBe(4)
		expect(normalize('nombre', '12.50')).toBe(12.5)
	})

	test('absent : création ; autre valeur : mise à jour des seuls champs différents ; même valeur : rien', () => {
		const plan = planActions(
			ADAPTER,
			[expected(1, 'Un'), expected(2, 'Deux', '2023-04-01T09:00:00.000Z'), expected(3, null)],
			[existing(10, 2, 'Deux', '2023-04-01T09:00:00Z'), existing(11, 3, 'Trois'), existing(12, 9, 'Neuf')]
		)

		expect(plan.actions.map(action => [action.expected.strapiId, action.kind])).toEqual([
			[1, 'creation'],
			[2, 'inchange'],
			[3, 'modification'],
		])
		expect(plan.actions[2]).toMatchObject({ id: 11, fields: ['title'] })
		// Never deleted: listed.
		expect(plan.extra).toEqual([9])
	})

	test('la parité est complète quand la cible tient exactement les documents attendus', () => {
		const expectedList = [expected(1, 'Un'), expected(2, 'Deux')]
		const complete = parity(ADAPTER, expectedList, [existing(5, 2, 'Deux'), existing(4, 1, 'Un')])
		expect(complete).toMatchObject({ expected: 2, present: 2, equal: 2, different: [], missing: [], extra: [] })
		expect(complete.targetFingerprint).toBe(complete.expectedFingerprint)
		expect(parityComplete(complete)).toBe(true)

		const incomplete = parity(ADAPTER, expectedList, [existing(4, 1, 'Un modifié'), existing(6, 7, 'Sept')])
		expect(incomplete).toMatchObject({ present: 1, equal: 0, different: [1], missing: [2], extra: [7] })
		expect(parityComplete(incomplete)).toBe(false)
	})

	test('un document refusé compte : la parité le dit incomplète, sans le prendre pour un manquant ni un écart', () => {
		const expectedList = [expected(1, 'Un'), expected(2, 'Deux')]
		// Document 2 was refused by Payload, its earlier values stay; document 5 was refused before the write.
		const target = [existing(4, 1, 'Un'), existing(6, 2, 'Deux d’avant')]
		const refusal = [
			{ strapiId: 2, reason: 'refuse-par-payload', fields: ['title'] },
			{ strapiId: 5, reason: 'slug-en-double', fields: ['slug'] },
		]

		const withRefusal = parity(ADAPTER, expectedList, target, refusal)

		expect(withRefusal).toMatchObject({
			expected: 3,
			present: 1,
			equal: 1,
			refused: [2, 5],
			different: [],
			missing: [],
			extra: [],
		})
		expect(withRefusal.targetFingerprint).toBe(withRefusal.expectedFingerprint)
		expect(withoutUnexplainedGap(withRefusal)).toBe(true)
		expect(parityComplete(withRefusal)).toBe(false)
		// Without refusal, the same target is simply not equal.
		expect(parityComplete(parity(ADAPTER, expectedList, target))).toBe(false)
		expect(parity(ADAPTER, expectedList, target)).toMatchObject({ refused: [], different: [2] })
	})

	test('l’empreinte ne dépend pas de l’ordre, et change avec la moindre valeur', () => {
		const a = documentsFingerprint(ADAPTER, [expected(1, 'Un'), expected(2, 'Deux')])
		expect(documentsFingerprint(ADAPTER, [expected(2, 'Deux'), expected(1, 'Un')])).toBe(a)
		expect(documentsFingerprint(ADAPTER, [expected(1, 'Un'), expected(2, 'deux')])).not.toBe(a)
		expect(a).toMatch(/^[0-9a-f]{64}$/)
	})
})

const lineTalent = (id: number, slug: string | null, publie = true): TalentRow => ({
	id,
	title: `Talent ${id}`,
	seo_title: null,
	description: null,
	seo_description: null,
	content: '## Contenu',
	slug,
	created_at: '2023-04-01T09:00:00.000Z',
	updated_at: '2024-05-02T10:00:00.000Z',
	published_at: publie ? '2023-04-01T09:00:00.000Z' : null,
})

describe('les talents : repris tels quels', () => {
	test('un talent garde chaque valeur, ses dates, et nul reste nul', () => {
		expect(expectedTalent(lineTalent(3, 'effets-speciaux'))).toEqual({
			strapiId: 3,
			values: {
				strapiId: 3,
				title: 'Talent 3',
				slug: 'effets-speciaux',
				seo_title: null,
				description: null,
				seo_description: null,
				content: '## Contenu',
				_status: 'published',
				publishedAt: '2023-04-01T09:00:00.000Z',
				createdAt: '2023-04-01T09:00:00.000Z',
				updatedAt: '2024-05-02T10:00:00.000Z',
			},
			gaps: [],
		})
		expect(expectedTalent(lineTalent(4, 'brouillon', false)).values).toMatchObject({
			_status: 'draft',
			publishedAt: null,
		})
	})

	test('un slug qui n’est pas une adresse, ou déjà pris par un talent plus ancien, est refusé', () => {
		const { expected: expectedList, refused: refuses } = expectedTalents([
			lineTalent(3, 'mariage'),
			lineTalent(1, 'mariage'),
			lineTalent(2, 'Maquillage Mode'),
			lineTalent(4, null),
		])
		expect(expectedList.map(({ strapiId }) => strapiId)).toEqual([1])
		expect(refuses).toEqual([
			{ strapiId: 2, reason: 'slug-pas-une-adresse', fields: ['slug'] },
			{ strapiId: 3, reason: 'slug-en-double', fields: ['slug'] },
			{ strapiId: 4, reason: 'slug-pas-une-adresse', fields: ['slug'] },
		])
	})
})

describe('le rapport', () => {
	const report = (modif: Partial<Report> = {}): Report => ({
		mode: 'real',
		target: 'local',
		halt: null,
		pointlessDecisions: 0,
		source: {
			before: { talents: { rows: 3, fingerprint: 'a'.repeat(64) } },
			after: { talents: { rows: 3, fingerprint: 'a'.repeat(64) } },
			unchanged: true,
		},
		collections: {
			talents: {
				source: 4,
				created: 2,
				updated: 1,
				unchanged: 0,
				refused: [{ strapiId: 4, reason: 'slug-en-double', fields: ['slug'] }],
				extra: [9],
			},
		},
		gaps: {},
		parity: {
			talents: {
				expected: 4,
				present: 3,
				equal: 3,
				refused: [4],
				different: [],
				missing: [],
				extra: [],
				expectedFingerprint: 'b'.repeat(64),
				targetFingerprint: 'b'.repeat(64),
			},
		},
		...modif,
	})

	/** The same run, where nothing was refused. */
	const withoutRefusal = (modif: Partial<Report> = {}): Report => {
		const base = report()
		const talents = base.collections.talents ?? ({} as never)
		const parityValue = base.parity?.talents ?? ({} as never)
		return report({
			collections: { talents: { ...talents, refused: [] } },
			parity: { talents: { ...parityValue, expected: 3, refused: [] } },
			...modif,
		})
	}

	test('il se lit en français, en nombres et en identifiants', () => {
		expect(reportAsText(report()).split('\n')).toEqual([
			'Import réel.',
			'Cible : une base de ce poste.',
			'',
			'Talents : 4 à la source ; 2 créations, 1 mise à jour, 0 inchangé, 1 refusé',
			'  - refusé : 4 (slug-en-double : slug)',
			'  - dans la cible, absents de la source, gardés : 9',
			'',
			'Écarts voulus : aucun.',
			'',
			'Parité, la cible relue :',
			'Talents : 3 sur 4 égaux, parité incomplète : 1 refusé (4), empreinte bbbbbbbbbbbb…',
			'',
			'Source : 1 table lue, 3 lignes, inchangée par l’import.',
		])
		expect(reportAsText(withoutRefusal())).toContain(
			'Talents : 3 sur 3 égaux, parité complète, empreinte bbbbbbbbbbbb…'
		)
		expect(reportAsText(report({ mode: 'dry-run', parity: null }))).toContain(
			'Talents : 4 à la source ; 2 créations annoncées, 1 mise à jour annoncée'
		)
	})

	test('le code de sortie : 0 fini, 3 arrêté, 4 un écart inexpliqué ou la source changée, 5 des refusés', () => {
		expect(exitCode(withoutRefusal())).toBe(0)
		expect(exitCode(withoutRefusal({ mode: 'dry-run', parity: null }))).toBe(0)
		// A refused document is never read as a complete run, dry or real.
		expect(exitCode(report())).toBe(5)
		expect(exitCode(report({ mode: 'dry-run', parity: null }))).toBe(5)
		expect(exitCode(withoutRefusal({ source: { ...report().source, unchanged: false } }))).toBe(4)
		const talents = report().parity?.talents ?? ({} as never)
		expect(exitCode(report({ parity: { talents: { ...talents, missing: [2] } } }))).toBe(4)
		expect(exitCode(report({ parity: { talents: { ...talents, targetFingerprint: 'c'.repeat(64) } } }))).toBe(4)
		expect(
			exitCode(
				report({ halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] } })
			)
		).toBe(3)
	})

	test('le contrôle : 0 si la cible est la source, 4 dès qu’un passage réel écrirait ou qu’un document est en trop', () => {
		const talentOwn = (bilan: object): Report => {
			const base = withoutRefusal({ mode: 'dry-run', parity: null })
			const talents = { ...(base.collections.talents ?? ({} as never)), created: 0, updated: 0, extra: [], ...bilan }
			return { ...base, collections: { talents } } as Report
		}
		const own = talentOwn({})
		expect(checkExitCode(own)).toBe(0)
		expect(checkAsText(own)).toBe('Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).')
		// A document removed by hand is a creation to make, a value changed by hand an update, an extra one a document too many.
		for (const summary of [{ created: 1 }, { updated: 1 }, { extra: [9] }]) {
			expect(checkExitCode(talentOwn(summary)), JSON.stringify(summary)).toBe(4)
			expect(checkAsText(talentOwn(summary))).toContain('Contrôle : la cible n’est PAS la source.')
		}
		expect(checkAsText(talentOwn({ created: 2, updated: 1 }))).toContain(
			'Talents : 2 créations à faire, 1 mise à jour à faire, 0 document en trop'
		)
		// The codes of a dry run are kept: stopped, a source that moved, a document refused.
		expect(checkExitCode(report({ mode: 'dry-run', parity: null }))).toBe(5)
		expect(checkExitCode(talentOwn({ created: 1, refused: [{ strapiId: 4, reason: 'slug-en-double' }] }))).toBe(5)
		expect(
			checkExitCode(
				report({ halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] } })
			)
		).toBe(3)
	})

	test('le contrôle ne dit « la cible est la source » que s’il a pu comparer (codes 3, 4 et 5)', () => {
		const stopped = report({
			mode: 'dry-run',
			parity: null,
			halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] },
		})
		expect(checkAsText(stopped)).toContain('sans conclusion')
		expect(checkAsText(stopped)).toContain('code 3')
		expect(checkAsText(stopped)).not.toContain('la cible est la source')

		const base = withoutRefusal({ mode: 'dry-run', parity: null })
		const talents = { ...(base.collections.talents ?? ({} as never)), created: 0, updated: 0, extra: [] }
		const refuse = {
			...base,
			collections: { talents: { ...talents, refused: [{ strapiId: 4, reason: 'slug-en-double' }] } },
		} as Report
		expect(checkExitCode(refuse)).toBe(5)
		expect(checkAsText(refuse)).toContain('code 5')
		expect(checkAsText(refuse)).not.toContain('la cible est la source')

		const moved = { ...base, collections: { talents }, source: { ...base.source, unchanged: false } } as Report
		expect(checkExitCode(moved)).toBe(4)
		expect(checkAsText(moved)).toContain('code 4')
		expect(checkAsText(moved)).not.toContain('la cible est la source')
	})

	test('l’arrêt nomme chaque cas par identifiants : les comptes au même email, les profils d’un compte écarté ou sans compte', () => {
		const text = reportAsText(
			report({
				halt: { sharedEmails: [[9, 10, 11, 12]], profilesOfExcludedAccounts: [28, 29], profilesWithoutAccount: [] },
				parity: null,
			})
		)
		expect(text).toContain('Import arrêté avant toute écriture : rien n’est écrit.')
		expect(text).toContain('Groupes, par identifiant : [9, 10, 11, 12].')
		expect(text).toContain('Profils, par identifiant : 28, 29.')
		expect(text).not.toContain('aucun compte dans la source')
		const withoutAccount = reportAsText(
			report({
				halt: { sharedEmails: [], profilesOfExcludedAccounts: [29], profilesWithoutAccount: [40] },
				parity: null,
			})
		)
		expect(withoutAccount).not.toContain('Groupes')
		expect(withoutAccount).toContain(
			'Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : 40.'
		)
	})

	test('deux empreintes de la source se comparent table par table', () => {
		const one = { talents: { rows: 3, fingerprint: 'a' }, up_users: { rows: 1, fingerprint: 'b' } }
		expect(sameTables(one, { up_users: { rows: 1, fingerprint: 'b' }, talents: { rows: 3, fingerprint: 'a' } })).toBe(
			true
		)
		expect(sameTables(one, { ...one, talents: { rows: 3, fingerprint: 'c' } })).toBe(false)
	})
})

describe('une erreur de la base : nommée par son code, jamais par son texte', () => {
	/** An error of a query as the driver gives it: the query and its values in the message, the SQLSTATE in its cause. */
	const requestError = () => {
		const error = new Error(
			`Failed query: insert into "pros" ("email", "legacy_bcrypt") values ($1, $2) params: zoe@example.test,$2a$10$${'a'.repeat(53)}`,
			{ cause: Object.assign(new Error('refus du banc'), { code: 'P0001', detail: 'Key (email)=(zoe@example.test)' }) }
		)
		error.name = 'DrizzleQueryError'
		return error
	}

	test('le code se lit sur l’erreur ou sur l’une de ses causes, et seulement s’il a la forme d’un code', () => {
		expect(errorCode(requestError())).toBe('P0001')
		expect(errorCode(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('ECONNRESET')
		expect(errorCode(Object.assign(new Error('x'), { code: 'zoe@example.test' }))).toBeUndefined()
		for (const other of [undefined, null, 'texte', 42, new Error('sans code')]) expect(errorCode(other)).toBeUndefined()
	})

	test('une écriture interrompue dit la collection, le document et le code, et ne garde pas l’erreur', () => {
		const interrupted = new InterruptedImport('pros', 2, 'P0001')

		expect(interrupted.message).toContain('la base n’a pas écrit le document 2 de « pros » (code P0001)')
		expect(interrupted.cause).toBeUndefined()
		expect(new InterruptedImport('talents', 3, undefined).message).not.toContain('code')
	})

	test('une erreur inattendue se dit par son type et son code : ni requête, ni valeur', () => {
		const message = unexpectedErrorMessage(requestError())

		expect(message).toContain('(DrizzleQueryError, code P0001)')
		for (const chunk of ['$2a$', '@example.test', 'insert into', 'refus du banc', 'Key (email)'])
			expect(message).not.toContain(chunk)
		// A type that is not a plain name is not printed either.
		const strange = Object.assign(new Error('x'), { name: 'zoe@example.test' })
		expect(unexpectedErrorMessage(strange)).not.toContain('example.test')
		expect(unexpectedErrorMessage('texte jeté')).not.toContain('texte jeté')
	})
})

describe('ticket 262 : la table de décision accepte une ligne de pays, en plus de la commune', () => {
	const refusal = (text: string): string => {
		try {
			readDecisions(text)
		} catch (error) {
			if (error instanceof ImportRefuse) return error.message
			throw error
		}
		return ''
	}

	test('une ligne { profile, countries, town } est lue, les codes en capitales, la ville facultative', () => {
		const read = readDecisions(
			`{ "cities": [
				{ "profile": 82, "countries": ["FR", "IT"], "town": null },
				{ "profile": 48, "countries": ["be"], "town": "Bruxelles" },
				{ "profile": 50, "countries": ["CH"] },
				{ "profile": 36, "inseeCode": "62200" }
			] }`
		)

		expect(read.cities).toEqual([
			{ profile: 82, countries: ['FR', 'IT'], town: null },
			{ profile: 48, countries: ['BE'], town: 'Bruxelles' },
			{ profile: 50, countries: ['CH'], town: null },
			{ profile: 36, inseeCode: '62200' },
		])
	})

	test('une table d’aujourd’hui, sans ces clés, est lue comme avant', () => {
		const text =
			'{ "sharedEmails": [], "excludedProfiles": [29], "cities": [{ "profile": 28, "inseeCode": "74243" }, { "profile": 26, "inseeCode": null }] }'

		expect(readDecisions(text)).toEqual({
			sharedEmails: [],
			excludedProfiles: [29],
			cities: [
				{ profile: 28, inseeCode: '74243' },
				{ profile: 26, inseeCode: null },
			],
		})
	})

	test('les deux formes s’excluent : refusé en français, rien n’est écrit', () => {
		const message = refusal('{ "cities": [{ "profile": 82, "inseeCode": "74010", "countries": ["FR", "IT"] }] }')

		expect(message).toContain('une commune ou des pays')
		expect(message).toContain('Rien n’est écrit.')
	})

	test('un code inconnu, la France seule, six pays, une ville avec deux pays ou sans pays étranger : refusés avant toute écriture', () => {
		const lines = [
			'{ "profile": 82, "countries": ["XX"], "town": null }',
			'{ "profile": 82, "countries": ["FR"], "town": null }',
			'{ "profile": 82, "countries": [], "town": null }',
			'{ "profile": 82, "countries": ["BE", "BE"], "town": null }',
			'{ "profile": 82, "countries": ["BE", "IT", "CH", "DE", "ES", "PT"], "town": null }',
			'{ "profile": 82, "countries": ["BE", "IT"], "town": "Bruxelles" }',
			'{ "profile": 82, "countries": ["FR"], "town": "Lyon" }',
			'{ "profile": 82, "countries": ["BE"], "town": "12 rue des Lilas" }',
			'{ "profile": 82, "town": "Bruxelles" }',
			'{ "profile": 82 }',
			'{ "profile": 82, "countries": ["BE"], "ville": "x" }',
		]
		for (const line of lines) {
			const message = refusal(`{ "cities": [${line}] }`)
			expect(message, line).toContain('Rien n’est écrit.')
			expect(message, line).toContain('La table de décision est refusée')
		}
		expect(refusal('{ "cities": [{ "profile": 82, "countries": ["FR"], "town": null }] }')).toContain(
			'Choisis au moins un pays étranger'
		)
	})

	test('un profil nommé deux fois reste refusé, quelle que soit la forme', () => {
		expect(
			refusal('{ "cities": [{ "profile": 82, "countries": ["BE"] }, { "profile": 82, "inseeCode": null }] }')
		).toContain('un profil est nommé deux fois')
	})
})

describe('ticket 261 : la comparaison d’une zone, valeur par défaut et revue stockée', () => {
	const adapter: Adapter = {
		collection: 'profiles',
		fields: { strapiId: 'nombre', zoneKind: 'texte', countries: 'liste', zoneReview: 'objet' },
		defaults: { zoneKind: 'city', countries: [], zoneReview: { reason: null, candidates: null } },
	}
	const expected = (values: Record<string, unknown>): Expected => ({
		strapiId: 1,
		values: { strapiId: 1, ...values },
		gaps: [],
	})
	const existing = (values: Record<string, unknown>): Existing => ({ id: 9, values: { strapiId: 1, ...values } })

	test('une valeur que la source ne donne pas vaut la valeur par défaut : la cible par défaut est inchangée', () => {
		const target = existing({ zoneKind: 'city', countries: [], zoneReview: { reason: null, candidates: null } })

		expect(planActions(adapter, [expected({})], [target]).actions[0]?.kind).toBe('inchange')
		// Payload reads an empty list or group as absent: the same.
		expect(planActions(adapter, [expected({})], [existing({ zoneKind: 'city' })]).actions[0]?.kind).toBe('inchange')
	})

	test('une zone ou une revue restée dans la cible alors que la source n’en donne plus est un écart, et se remet à zéro', () => {
		const stale = existing({
			zoneKind: 'countries',
			countries: ['BE'],
			zoneReview: { reason: 'notACity', candidates: [] },
		})

		const [action] = planActions(adapter, [expected({})], [stale]).actions

		expect(action).toMatchObject({ kind: 'modification' })
		expect(action?.kind === 'modification' && action.fields.sort()).toEqual(['countries', 'zoneKind', 'zoneReview'])
	})

	test('les clés d’une liste dans une revue ne comptent pas : jsonb les range à sa façon', () => {
		const written = {
			reason: 'sharedPostalCode',
			candidates: [{ inseeCode: '62901', name: 'Hameau-Un', department: '62' }],
		}
		const readBack = {
			reason: 'sharedPostalCode',
			candidates: [{ name: 'Hameau-Un', inseeCode: '62901', department: '62' }],
		}

		expect(normalize('objet', written)).toBe(normalize('objet', readBack))
		expect(
			planActions(
				adapter,
				[expected({ zoneKind: 'city', zoneReview: written })],
				[existing({ zoneKind: 'city', zoneReview: readBack })]
			).actions[0]?.kind
		).toBe('inchange')
	})
})

describe('ticket 261 : le rapport dit les zones en nombres et en identifiants', () => {
	const profilesReport = (): Report => ({
		mode: 'dry-run',
		target: 'local',
		halt: null,
		pointlessDecisions: 0,
		source: { before: {}, after: {}, unchanged: true },
		collections: {
			profiles: {
				source: 8,
				created: 8,
				updated: 0,
				unchanged: 0,
				refused: [],
				extra: [],
				cities: {
					filledCities: 56,
					attached: 45,
					part: 80.4,
					nonEmptyProfiles: 62,
					nonEmptyProfilesWithCity: 45,
					toReview: [36, 18, 45],
					addresses: [],
					decided: [],
				},
				zones: {
					recognized: 47,
					part: 83.9,
					communesOnly: 45,
					countries: [48, 82],
					toReviewByReason: {
						'code-postal-partage': [36],
						homonymes: [],
						introuvable: [45],
						'pas-une-commune': [18],
					},
				},
			},
		},
		gaps: {},
		parity: null,
	})

	test('les zones reconnues et leur part, les communes seules, les pays, puis les à revoir par raison', () => {
		const text = reportAsText(profilesReport())

		expect(text).toContain(
			'  - zones reconnues, communes et pays : 47 sur 56 villes renseignées (83,9 %, cible 90 %) ; communes seules : 45 ; zones de pays : 2 (48, 82)'
		)
		expect(text).toContain(
			'  - villes à revoir, par raison : code postal partagé 1 (36) ; plusieurs communes de même nom 0 ; commune introuvable 1 (45) ; pas une commune 1 (18)'
		)
		// The line of the communes alone stays as it was.
		expect(text).toContain('  - communes : 45 sur 56 villes renseignées (80,4 %, cible 90 %)')
		expect(text).toContain('  - villes à revoir, zone vide (liste de revue privée, --review) : 36, 18, 45')
	})

	test('rien n’y est dit d’un texte saisi, d’un nom ni d’un email', () => {
		const text = reportAsText(profilesReport())

		expect(text).not.toMatch(/@|Belgique|Bruxelles|Italie/)
	})
})
