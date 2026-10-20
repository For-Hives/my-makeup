import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SanitizedConfig } from 'payload'
import { readArguments, renamedOptionHint } from '../../scripts/migration/import/arguments'
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
		for (const hote of ['127.0.0.1:5443', 'localhost:5442', '[::1]:5432'])
			expect(verifyTarget(`postgres://u:p@${hote}/base`, { remoteTarget: false })).toBe('local')
		expect(verifyTarget('postgres://u:p@127.0.0.1/base', { remoteTarget: true, expectedDatabase: 'base' })).toBe(
			'local'
		)
	})

	test('une base distante est refusée sans le drapeau, acceptée avec', () => {
		const distantes = [
			'postgres://u:p@base.example.test:5432/prod',
			'postgres://u:p@10.0.0.5/prod',
			// A host parameter replaces the host of the address: it counts.
			'postgres://u:p@127.0.0.1/prod?host=base.example.test',
			'pas une adresse',
		]
		for (const adresse of distantes) {
			expect(() => verifyTarget(adresse, { remoteTarget: false }), adresse).toThrow(ImportRefuse)
			expect(verifyTarget(adresse, { remoteTarget: true, expectedDatabase: 'prod' }), adresse).toBe('remote')
		}
	})

	test('Payload se branche sur la cible sans en changer le schéma : ni poussée, ni migration', () => {
		const avant = process.env.PAYLOAD_MIGRATING
		const interrupteur = (): string | undefined => process.env.PAYLOAD_MIGRATING
		const adaptateur = { name: 'postgres', prodMigrations: [{ name: 'socle' }] }
		const config = { db: { name: 'postgres', init: () => adaptateur } } as unknown as SanitizedConfig
		try {
			delete process.env.PAYLOAD_MIGRATING
			const pourLImport = configurationWithoutSchemaChange(config)

			// Payload's own switch: no push of the schema when it connects.
			expect(interrupteur()).toBe('true')
			// No migration played when it connects in production; the adapter is the same otherwise.
			const cree = pourLImport.db.init({ payload: {} as never }) as unknown as typeof adaptateur
			expect(cree).toBe(adaptateur)
			expect(cree.prodMigrations).toBeUndefined()
			expect(cree.name).toBe('postgres')
			expect(pourLImport.db.name).toBe('postgres')
		} finally {
			if (avant === undefined) delete process.env.PAYLOAD_MIGRATING
			else process.env.PAYLOAD_MIGRATING = avant
		}
	})

	test('le refus nomme la variable et le drapeau, jamais l’adresse', () => {
		const adresse = 'postgres://utilisateur:secret-de-test@base.example.test:5432/prod'
		let message = ''
		try {
			verifyTarget(adresse, { remoteTarget: false })
		} catch (erreur) {
			message = (erreur as Error).message
		}
		expect(message).toContain('DATABASE_URI')
		expect(message).toContain('--remote-target')
		for (const morceau of ['base.example.test', 'secret-de-test', 'utilisateur']) expect(message).not.toContain(morceau)
		expect(() => verifyTarget(undefined, { remoteTarget: true, expectedDatabase: 'prod' })).toThrow(
			'DATABASE_URI manque'
		)
	})
})

describe('L9 (ticket 233) : --remote-target exige --expected-database, et la base doit porter ce nom', () => {
	test('--remote-target sans --expected-database est refusé (code 1), avant la lecture de l’adresse', () => {
		for (const adresse of ['postgres://u:p@base.example.test:5432/prod', 'postgres://u:p@127.0.0.1/base', undefined]) {
			let message = ''
			try {
				verifyTarget(adresse, { remoteTarget: true })
			} catch (erreur) {
				expect(erreur).toBeInstanceOf(ImportRefuse)
				message = (erreur as Error).message
			}
			expect(message, String(adresse)).toContain('--remote-target exige --expected-database')
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

	const payloadDont = (base: string | undefined) =>
		({
			db: { pool: { query: async () => ({ rows: base === undefined ? [] : [{ base }] }) } },
		}) as unknown as Parameters<typeof verifyExpectedDatabase>[0]

	test('la base qui donne le nom attendu passe ; une autre est refusée sans dire laquelle', async () => {
		await expect(verifyExpectedDatabase(payloadDont('mymakeup_v3'), 'mymakeup_v3')).resolves.toBeUndefined()
		let message = ''
		try {
			await verifyExpectedDatabase(payloadDont('mymakeup_preprod_ancienne'), 'mymakeup_v3')
		} catch (erreur) {
			expect(erreur).toBeInstanceOf(ImportRefuse)
			message = (erreur as Error).message
		}
		expect(message).toContain('« mymakeup_v3 »')
		expect(message).toContain('--expected-database')
		expect(message).not.toContain('mymakeup_preprod_ancienne')
		await expect(verifyExpectedDatabase(payloadDont(undefined), 'mymakeup_v3')).rejects.toBeInstanceOf(ImportRefuse)
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
		for (const ligne of [['--prod'], ['--real', '--real'], ['--report'], ['--report', '--real'], ['real']])
			expect(readArguments(ligne), ligne.join(' ')).toBeNull()
	})
})

describe('le contexte d’import', () => {
	test('il se reconnaît, et rien d’autre ne passe pour lui', () => {
		expect(isImport(IMPORT_CONTEXT)).toBe(true)
		expect(isImport({ ...IMPORT_CONTEXT, profilAutomatique: false })).toBe(true)
		for (const autre of [undefined, {}, { import: 'true' }, { import: 1 }]) expect(isImport(autre)).toBe(false)
	})
})

const ADAPTATEUR: Adapter = {
	collection: 'talents',
	fields: { title: 'texte', publishedAt: 'date', strapiId: 'nombre' },
}

const attendu = (strapiId: number, title: string | null, publishedAt: string | null = null): Expected => ({
	strapiId,
	values: { strapiId, title, publishedAt },
	gaps: [],
})

const existant = (id: number, strapiId: number, title?: string | null, publishedAt?: string | null): Existing => ({
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
			ADAPTATEUR,
			[attendu(1, 'Un'), attendu(2, 'Deux', '2023-04-01T09:00:00.000Z'), attendu(3, null)],
			[existant(10, 2, 'Deux', '2023-04-01T09:00:00Z'), existant(11, 3, 'Trois'), existant(12, 9, 'Neuf')]
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
		const attendus = [attendu(1, 'Un'), attendu(2, 'Deux')]
		const complete = parity(ADAPTATEUR, attendus, [existant(5, 2, 'Deux'), existant(4, 1, 'Un')])
		expect(complete).toMatchObject({ expected: 2, present: 2, equal: 2, different: [], missing: [], extra: [] })
		expect(complete.targetFingerprint).toBe(complete.expectedFingerprint)
		expect(parityComplete(complete)).toBe(true)

		const incomplete = parity(ADAPTATEUR, attendus, [existant(4, 1, 'Un modifié'), existant(6, 7, 'Sept')])
		expect(incomplete).toMatchObject({ present: 1, equal: 0, different: [1], missing: [2], extra: [7] })
		expect(parityComplete(incomplete)).toBe(false)
	})

	test('un document refusé compte : la parité le dit incomplète, sans le prendre pour un manquant ni un écart', () => {
		const attendus = [attendu(1, 'Un'), attendu(2, 'Deux')]
		// Document 2 was refused by Payload, its earlier values stay; document 5 was refused before the write.
		const cible = [existant(4, 1, 'Un'), existant(6, 2, 'Deux d’avant')]
		const refus = [
			{ strapiId: 2, reason: 'refuse-par-payload', fields: ['title'] },
			{ strapiId: 5, reason: 'slug-en-double', fields: ['slug'] },
		]

		const avecRefus = parity(ADAPTATEUR, attendus, cible, refus)

		expect(avecRefus).toMatchObject({
			expected: 3,
			present: 1,
			equal: 1,
			refused: [2, 5],
			different: [],
			missing: [],
			extra: [],
		})
		expect(avecRefus.targetFingerprint).toBe(avecRefus.expectedFingerprint)
		expect(withoutUnexplainedGap(avecRefus)).toBe(true)
		expect(parityComplete(avecRefus)).toBe(false)
		// Without refusal, the same target is simply not equal.
		expect(parityComplete(parity(ADAPTATEUR, attendus, cible))).toBe(false)
		expect(parity(ADAPTATEUR, attendus, cible)).toMatchObject({ refused: [], different: [2] })
	})

	test('l’empreinte ne dépend pas de l’ordre, et change avec la moindre valeur', () => {
		const a = documentsFingerprint(ADAPTATEUR, [attendu(1, 'Un'), attendu(2, 'Deux')])
		expect(documentsFingerprint(ADAPTATEUR, [attendu(2, 'Deux'), attendu(1, 'Un')])).toBe(a)
		expect(documentsFingerprint(ADAPTATEUR, [attendu(1, 'Un'), attendu(2, 'deux')])).not.toBe(a)
		expect(a).toMatch(/^[0-9a-f]{64}$/)
	})
})

const ligneTalent = (id: number, slug: string | null, publie = true): TalentRow => ({
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
		expect(expectedTalent(ligneTalent(3, 'effets-speciaux'))).toEqual({
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
		expect(expectedTalent(ligneTalent(4, 'brouillon', false)).values).toMatchObject({
			_status: 'draft',
			publishedAt: null,
		})
	})

	test('un slug qui n’est pas une adresse, ou déjà pris par un talent plus ancien, est refusé', () => {
		const { expected: attendus, refused: refuses } = expectedTalents([
			ligneTalent(3, 'mariage'),
			ligneTalent(1, 'mariage'),
			ligneTalent(2, 'Maquillage Mode'),
			ligneTalent(4, null),
		])
		expect(attendus.map(({ strapiId }) => strapiId)).toEqual([1])
		expect(refuses).toEqual([
			{ strapiId: 2, reason: 'slug-pas-une-adresse', fields: ['slug'] },
			{ strapiId: 3, reason: 'slug-en-double', fields: ['slug'] },
			{ strapiId: 4, reason: 'slug-pas-une-adresse', fields: ['slug'] },
		])
	})
})

describe('le rapport', () => {
	const rapport = (modif: Partial<Report> = {}): Report => ({
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
	const sansRefus = (modif: Partial<Report> = {}): Report => {
		const base = rapport()
		const talents = base.collections.talents ?? ({} as never)
		const parite = base.parity?.talents ?? ({} as never)
		return rapport({
			collections: { talents: { ...talents, refused: [] } },
			parity: { talents: { ...parite, expected: 3, refused: [] } },
			...modif,
		})
	}

	test('il se lit en français, en nombres et en identifiants', () => {
		expect(reportAsText(rapport()).split('\n')).toEqual([
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
		expect(reportAsText(sansRefus())).toContain('Talents : 3 sur 3 égaux, parité complète, empreinte bbbbbbbbbbbb…')
		expect(reportAsText(rapport({ mode: 'dry-run', parity: null }))).toContain(
			'Talents : 4 à la source ; 2 créations annoncées, 1 mise à jour annoncée'
		)
	})

	test('le code de sortie : 0 fini, 3 arrêté, 4 un écart inexpliqué ou la source changée, 5 des refusés', () => {
		expect(exitCode(sansRefus())).toBe(0)
		expect(exitCode(sansRefus({ mode: 'dry-run', parity: null }))).toBe(0)
		// A refused document is never read as a complete run, dry or real.
		expect(exitCode(rapport())).toBe(5)
		expect(exitCode(rapport({ mode: 'dry-run', parity: null }))).toBe(5)
		expect(exitCode(sansRefus({ source: { ...rapport().source, unchanged: false } }))).toBe(4)
		const talents = rapport().parity?.talents ?? ({} as never)
		expect(exitCode(rapport({ parity: { talents: { ...talents, missing: [2] } } }))).toBe(4)
		expect(exitCode(rapport({ parity: { talents: { ...talents, targetFingerprint: 'c'.repeat(64) } } }))).toBe(4)
		expect(
			exitCode(
				rapport({ halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] } })
			)
		).toBe(3)
	})

	test('le contrôle : 0 si la cible est la source, 4 dès qu’un passage réel écrirait ou qu’un document est en trop', () => {
		const talentsPropres = (bilan: object): Report => {
			const base = sansRefus({ mode: 'dry-run', parity: null })
			const talents = { ...(base.collections.talents ?? ({} as never)), created: 0, updated: 0, extra: [], ...bilan }
			return { ...base, collections: { talents } } as Report
		}
		const propre = talentsPropres({})
		expect(checkExitCode(propre)).toBe(0)
		expect(checkAsText(propre)).toBe(
			'Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).'
		)
		// A document removed by hand is a creation to make, a value changed by hand an update, an extra one a document too many.
		for (const bilan of [{ created: 1 }, { updated: 1 }, { extra: [9] }]) {
			expect(checkExitCode(talentsPropres(bilan)), JSON.stringify(bilan)).toBe(4)
			expect(checkAsText(talentsPropres(bilan))).toContain('Contrôle : la cible n’est PAS la source.')
		}
		expect(checkAsText(talentsPropres({ created: 2, updated: 1 }))).toContain(
			'Talents : 2 créations à faire, 1 mise à jour à faire, 0 document en trop'
		)
		// The codes of a dry run are kept: stopped, a source that moved, a document refused.
		expect(checkExitCode(rapport({ mode: 'dry-run', parity: null }))).toBe(5)
		expect(checkExitCode(talentsPropres({ created: 1, refused: [{ strapiId: 4, reason: 'slug-en-double' }] }))).toBe(5)
		expect(
			checkExitCode(
				rapport({ halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] } })
			)
		).toBe(3)
	})

	test('le contrôle ne dit « la cible est la source » que s’il a pu comparer (codes 3, 4 et 5)', () => {
		const arrete = rapport({
			mode: 'dry-run',
			parity: null,
			halt: { sharedEmails: [[9, 10]], profilesOfExcludedAccounts: [], profilesWithoutAccount: [] },
		})
		expect(checkAsText(arrete)).toContain('sans conclusion')
		expect(checkAsText(arrete)).toContain('code 3')
		expect(checkAsText(arrete)).not.toContain('la cible est la source')

		const base = sansRefus({ mode: 'dry-run', parity: null })
		const talents = { ...(base.collections.talents ?? ({} as never)), created: 0, updated: 0, extra: [] }
		const refuse = {
			...base,
			collections: { talents: { ...talents, refused: [{ strapiId: 4, reason: 'slug-en-double' }] } },
		} as Report
		expect(checkExitCode(refuse)).toBe(5)
		expect(checkAsText(refuse)).toContain('code 5')
		expect(checkAsText(refuse)).not.toContain('la cible est la source')

		const bouge = { ...base, collections: { talents }, source: { ...base.source, unchanged: false } } as Report
		expect(checkExitCode(bouge)).toBe(4)
		expect(checkAsText(bouge)).toContain('code 4')
		expect(checkAsText(bouge)).not.toContain('la cible est la source')
	})

	test('l’arrêt nomme chaque cas par identifiants : les comptes au même email, les profils d’un compte écarté ou sans compte', () => {
		const texte = reportAsText(
			rapport({
				halt: { sharedEmails: [[9, 10, 11, 12]], profilesOfExcludedAccounts: [28, 29], profilesWithoutAccount: [] },
				parity: null,
			})
		)
		expect(texte).toContain('Import arrêté avant toute écriture : rien n’est écrit.')
		expect(texte).toContain('Groupes, par identifiant : [9, 10, 11, 12].')
		expect(texte).toContain('Profils, par identifiant : 28, 29.')
		expect(texte).not.toContain('aucun compte dans la source')
		const sansCompte = reportAsText(
			rapport({
				halt: { sharedEmails: [], profilesOfExcludedAccounts: [29], profilesWithoutAccount: [40] },
				parity: null,
			})
		)
		expect(sansCompte).not.toContain('Groupes')
		expect(sansCompte).toContain(
			'Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : 40.'
		)
	})

	test('deux empreintes de la source se comparent table par table', () => {
		const une = { talents: { rows: 3, fingerprint: 'a' }, up_users: { rows: 1, fingerprint: 'b' } }
		expect(sameTables(une, { up_users: { rows: 1, fingerprint: 'b' }, talents: { rows: 3, fingerprint: 'a' } })).toBe(
			true
		)
		expect(sameTables(une, { ...une, talents: { rows: 3, fingerprint: 'c' } })).toBe(false)
	})
})

describe('une erreur de la base : nommée par son code, jamais par son texte', () => {
	/** An error of a query as the driver gives it: the query and its values in the message, the SQLSTATE in its cause. */
	const erreurDeRequete = () => {
		const erreur = new Error(
			`Failed query: insert into "pros" ("email", "legacy_bcrypt") values ($1, $2) params: zoe@example.test,$2a$10$${'a'.repeat(53)}`,
			{ cause: Object.assign(new Error('refus du banc'), { code: 'P0001', detail: 'Key (email)=(zoe@example.test)' }) }
		)
		erreur.name = 'DrizzleQueryError'
		return erreur
	}

	test('le code se lit sur l’erreur ou sur l’une de ses causes, et seulement s’il a la forme d’un code', () => {
		expect(errorCode(erreurDeRequete())).toBe('P0001')
		expect(errorCode(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('ECONNRESET')
		expect(errorCode(Object.assign(new Error('x'), { code: 'zoe@example.test' }))).toBeUndefined()
		for (const autre of [undefined, null, 'texte', 42, new Error('sans code')]) expect(errorCode(autre)).toBeUndefined()
	})

	test('une écriture interrompue dit la collection, le document et le code, et ne garde pas l’erreur', () => {
		const interrompu = new InterruptedImport('pros', 2, 'P0001')

		expect(interrompu.message).toContain('la base n’a pas écrit le document 2 de « pros » (code P0001)')
		expect(interrompu.cause).toBeUndefined()
		expect(new InterruptedImport('talents', 3, undefined).message).not.toContain('code')
	})

	test('une erreur inattendue se dit par son type et son code : ni requête, ni valeur', () => {
		const message = unexpectedErrorMessage(erreurDeRequete())

		expect(message).toContain('(DrizzleQueryError, code P0001)')
		for (const morceau of ['$2a$', '@example.test', 'insert into', 'refus du banc', 'Key (email)'])
			expect(message).not.toContain(morceau)
		// A type that is not a plain name is not printed either.
		const etrange = Object.assign(new Error('x'), { name: 'zoe@example.test' })
		expect(unexpectedErrorMessage(etrange)).not.toContain('example.test')
		expect(unexpectedErrorMessage('texte jeté')).not.toContain('texte jeté')
	})
})
