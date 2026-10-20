import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	ambiguities,
	type Drift,
	lastMigration,
	readArguments,
	type Snapshot,
	verdict,
} from '../../scripts/ci/schema-drift'
import { readWorkflow, SCHEMA_DRIFT, schemaDriftProblems } from '../support/ci-guardrails'

/**
 * The schema drift check (docs/qualite.md, « La dérive de schéma »), a step of the job `qualite`
 * of the CI since the `init` migration closed the schema (ticket 049).
 *
 * The command is run on the repository, where it finds no drift, and on snapshots made from the
 * schema of the collections, where the right answer is known: a field added to a collection
 * without its migration is a column the collections have and the last migration does not, and
 * the command is red. The guard below keeps the step in the CI, where a red command makes the
 * CI red.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
/** The table and the column the faulty snapshots take apart: the email of an admin account exists for good. */
const TABLE = 'public.admins'
const COLUMN = 'email'

let folder = ''

/** Runs the command as `bun run schema:drift` does, with an environment that holds nothing else. */
async function driftOf(...args: string[]): Promise<{ code: number; sortie: string }> {
	const child = Bun.spawn([process.execPath, '--no-env-file', 'scripts/ci/schema-drift.ts', ...args], {
		cwd: ROOT,
		env: { PATH: process.env.PATH ?? '' },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, sortie: out + err }
}

const read = (fichier: string): Snapshot => JSON.parse(readFileSync(fichier, 'utf8')) as Snapshot
const write = (nom: string, instantane: Snapshot): string => {
	const file = path.join(folder, nom)
	writeFileSync(file, JSON.stringify(instantane))
	return file
}
/** The columns of a table of a snapshot, to take apart. */
const columns = (instantane: Snapshot, table = TABLE): Record<string, Record<string, unknown>> => {
	const found = instantane.tables?.[table]?.columns
	if (!found) throw new Error(`no table ${table} in the snapshot`)
	return found as Record<string, Record<string, unknown>>
}

let codeValue: Snapshot
let onRepository: { code: number; sortie: string }

beforeAll(async () => {
	folder = mkdtempSync(path.join(os.tmpdir(), 'derive-'))
	const instant = path.join(folder, 'code.json')
	const [written, repository] = await Promise.all([driftOf('--snapshot', instant), driftOf()])
	expect(written.code).toBe(0)
	codeValue = read(instant)
	onRepository = repository
})

afterAll(() => {
	rmSync(folder, { recursive: true, force: true })
})

describe('the command, against snapshots made from the schema of the collections', () => {
	test('no drift against the schema of the collections themselves: no false alarm', async () => {
		const { code, sortie: output } = await driftOf('--before', path.join(folder, 'code.json'))

		expect(output).toContain('Aucune dérive de schéma : les collections du code décrivent le schéma de l’instantané')
		expect(code).toBe(0)
	})

	test('red on a column the collections have and the migration does not: it prints what a migration would hold', async () => {
		const withoutColumn = structuredClone(codeValue)
		delete columns(withoutColumn)[COLUMN]

		const { code, sortie: output } = await driftOf('--before', write('sans-colonne.json', withoutColumn))

		expect(output).toContain('Dérive de schéma : les collections du code ne décrivent plus le schéma')
		expect(output).toContain('Une migration contiendrait cette instruction :')
		expect(output).toContain(`ALTER TABLE "admins" ADD COLUMN "${COLUMN}"`)
		expect(output).toContain('bun run payload:migrate:create')
		expect(code).toBe(1)
	})

	test('red on a table the collections have and the migration does not', async () => {
		const withoutTable = structuredClone(codeValue)
		delete withoutTable.tables?.['public.payload_kv']

		const { code, sortie: output } = await driftOf('--before', write('sans-table.json', withoutTable))

		expect(output).toContain('CREATE TABLE "payload_kv"')
		expect(code).toBe(1)
	})

	// drizzle-kit itself would ask on the terminal whether the column was renamed, and wait for
	// ever in a run nobody watches (tried once without the check of `ambiguites`: killed after 15 s).
	test('red on a renamed column, at once: the check never waits for an answer', async () => {
		const renamed = structuredClone(codeValue)
		const definition = columns(renamed)[COLUMN] ?? {}
		delete columns(renamed)[COLUMN]
		columns(renamed).courriel = { ...definition, name: 'courriel' }

		const startedAt = performance.now()
		const { code, sortie: output } = await driftOf('--before', write('renomme.json', renamed))

		expect(output).toContain(
			`- colonnes de « ${TABLE} » : « ${COLUMN} » dans le code seulement ; « courriel » dans la migration seulement`
		)
		expect(code).toBe(1)
		expect(performance.now() - startedAt).toBeLessThan(10_000)
	}, 20_000)

	test('on the repository: no drift against the last migration, every collection has its migration', () => {
		const last = lastMigration()

		expect(last?.nom).toMatch(/^\d{8}_\d{6}_\w+$/)
		expect(onRepository.sortie).toContain(
			`Aucune dérive de schéma : les collections du code décrivent le schéma de la dernière migration (${last?.nom}).`
		)
		expect(onRepository.code).toBe(0)
	})

	test('a wrong use is refused before anything is loaded', async () => {
		const { code, sortie: output } = await driftOf('--before')

		expect(output).toContain('Usage : bun run schema:drift')
		expect(code).toBe(2)
	})
})

describe('the CI runs the check, and is red when it is', () => {
	const CI = '.github/workflows/ci.yml'
	const text = readFileSync(path.join(ROOT, CI), 'utf8')
	const ci = (de = text) => readWorkflow(CI, de)
	const STEP = `      - name: Schema drift\n        if: \${{ !cancelled() }}\n        run: ${SCHEMA_DRIFT.command}\n`
	const change = (avant: string, apres: string): string => {
		if (!text.includes(avant)) throw new Error(`${CI} no longer holds: ${avant}`)
		return text.replace(avant, apres)
	}

	test('the job qualite runs « bun run schema:drift », alone in its step, after the installation', () => {
		expect(text).toContain(STEP)
		expect(schemaDriftProblems(ci())).toEqual([])
	})

	test.each([
		[
			'the step removed',
			() => change(STEP, ''),
			'job qualite : il doit lancer « bun run schema:drift », seule dans son étape',
		],
		[
			'the command with an option that compares with something else',
			() => change(`run: ${SCHEMA_DRIFT.command}\n`, `run: ${SCHEMA_DRIFT.command} --before ancien.json\n`),
			'job qualite : il doit lancer « bun run schema:drift », seule dans son étape',
		],
		[
			'the step skipped on a condition',
			() => change(STEP, STEP.replace('!cancelled()', "github.event_name == 'push'")),
			"« bun run schema:drift » ne tourne que sous « github.event_name == 'push' »",
		],
		[
			'the step before the installation',
			() =>
				change(STEP, '').replace(
					'      - name: Install\n        run: bun install --frozen-lockfile\n',
					`${STEP}      - name: Install\n        run: bun install --frozen-lockfile\n`
				),
			'« bun run schema:drift » doit venir après « bun install --frozen-lockfile »',
		],
	])('red on %s', (_faute, fautif, attendu) => {
		expect(schemaDriftProblems(ci(fautif())).join('\n')).toContain(attendu)
	})
})

describe('the names drizzle-kit would ask about are found from the two snapshots', () => {
	const instant = (tables: Record<string, string[]>, enums: string[] = []): Snapshot => ({
		version: '7',
		tables: Object.fromEntries(
			Object.entries(tables).map(([table, noms]) => [
				table,
				{ columns: Object.fromEntries(noms.map(nom => [nom, {}])) },
			])
		),
		enums: Object.fromEntries(enums.map(nom => [nom, {}])),
	})

	test('nothing to ask when names only appear, or only disappear', () => {
		const before = instant({ 'public.a': ['id', 'nom'] })

		expect(ambiguities(before, before)).toEqual([])
		expect(ambiguities(before, instant({ 'public.a': ['id', 'nom', 'ville'], 'public.b': ['id'] }))).toEqual([])
		expect(ambiguities(before, instant({ 'public.a': ['id'] }))).toEqual([])
	})

	test.each([
		[
			'a column renamed',
			instant({ 'public.a': ['id', 'nom'] }),
			instant({ 'public.a': ['id', 'prenom'] }),
			'colonnes de « public.a » : « prenom » dans le code seulement ; « nom » dans la migration seulement',
		],
		[
			'a table renamed',
			instant({ 'public.a': ['id'] }),
			instant({ 'public.b': ['id'] }),
			'tables : « public.b » dans le code seulement ; « public.a » dans la migration seulement',
		],
		[
			'a type renamed',
			instant({}, ['public.enum_role']),
			instant({}, ['public.enum_roles']),
			'types énumérés : « public.enum_roles » dans le code seulement ; « public.enum_role » dans la migration seulement',
		],
	])('found: %s', (_cas, avant, apres, attendue) => {
		expect(ambiguities(avant, apres)).toEqual([attendue])
	})
})

describe('the verdict, in French', () => {
	const without: Drift = { instructions: [], ambiguites: [] }

	test('no drift: exit code 0', () => {
		expect(verdict(without, 'la dernière migration (x)')).toEqual({
			code: 0,
			message: 'Aucune dérive de schéma : les collections du code décrivent le schéma de la dernière migration (x).',
		})
	})

	test('statements: exit code 1, each statement on its line', () => {
		const { code, message } = verdict(
			{ ...without, instructions: ['CREATE TABLE "a" ();\n', 'ALTER TABLE "b" ADD COLUMN "c" varchar;'] },
			'la dernière migration (x)'
		)

		expect(code).toBe(1)
		expect(message.split('\n')).toEqual([
			'Dérive de schéma : les collections du code ne décrivent plus le schéma de la dernière migration (x).',
			'Une migration contiendrait ces 2 instructions :',
			'  CREATE TABLE "a" ();',
			'  ALTER TABLE "b" ADD COLUMN "c" varchar;',
			'Écris la migration par « bun run payload:migrate:create », relis son SQL, puis relance « bun run schema:drift ».',
		])
	})

	test('names on one side only: exit code 1, each one on its line', () => {
		const { code, message } = verdict({ ...without, ambiguites: ['tables : « b » … ; « a » …'] }, 'x')

		expect(code).toBe(1)
		expect(message).toContain('\n- tables : « b » … ; « a » …\n')
	})
})

describe('the options of the command', () => {
	test.each([
		[[], {}],
		[['--before', 'a.json'], { avant: 'a.json' }],
		[['--snapshot', 'b.json'], { instantane: 'b.json' }],
	])('read: %p', (args, attendu) => {
		expect(readArguments(args)).toEqual(attendu)
	})

	test.each([
		[['--before']],
		[['--before', '--snapshot']],
		[['--before', 'a.json', 'b.json']],
		[['--tout']],
	])('refused: %p', args => {
		expect(readArguments(args)).toBeUndefined()
	})
})
