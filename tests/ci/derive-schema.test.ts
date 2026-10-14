import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	ambiguites,
	type Derive,
	derniereMigration,
	type Instantane,
	lireArguments,
	verdict,
} from '../../scripts/ci/derive-schema'
import { readWorkflow, SCHEMA_DRIFT, schemaDriftProblems } from '../outils/garde-fous-ci'

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
const COLONNE = 'email'

let dossier = ''

/** Runs the command as `bun run schema:derive` does, with an environment that holds nothing else. */
async function deriver(...args: string[]): Promise<{ code: number; sortie: string }> {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/ci/derive-schema.ts', ...args], {
		cwd: ROOT,
		env: { PATH: process.env.PATH ?? '' },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, out, err] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	])
	return { code, sortie: out + err }
}

const lire = (fichier: string): Instantane => JSON.parse(readFileSync(fichier, 'utf8')) as Instantane
const ecrire = (nom: string, instantane: Instantane): string => {
	const fichier = path.join(dossier, nom)
	writeFileSync(fichier, JSON.stringify(instantane))
	return fichier
}
/** The columns of a table of a snapshot, to take apart. */
const colonnes = (instantane: Instantane, table = TABLE): Record<string, Record<string, unknown>> => {
	const trouvees = instantane.tables?.[table]?.columns
	if (!trouvees) throw new Error(`no table ${table} in the snapshot`)
	return trouvees as Record<string, Record<string, unknown>>
}

let duCode: Instantane
let surLeDepot: { code: number; sortie: string }

beforeAll(async () => {
	dossier = mkdtempSync(path.join(os.tmpdir(), 'derive-'))
	const instantane = path.join(dossier, 'code.json')
	const [ecrit, depot] = await Promise.all([deriver('--instantane', instantane), deriver()])
	expect(ecrit.code).toBe(0)
	duCode = lire(instantane)
	surLeDepot = depot
})

afterAll(() => {
	rmSync(dossier, { recursive: true, force: true })
})

describe('the command, against snapshots made from the schema of the collections', () => {
	test('no drift against the schema of the collections themselves: no false alarm', async () => {
		const { code, sortie } = await deriver('--avant', path.join(dossier, 'code.json'))

		expect(sortie).toContain('Aucune dérive de schéma : les collections du code décrivent le schéma de l’instantané')
		expect(code).toBe(0)
	})

	test('red on a column the collections have and the migration does not: it prints what a migration would hold', async () => {
		const sansLaColonne = structuredClone(duCode)
		delete colonnes(sansLaColonne)[COLONNE]

		const { code, sortie } = await deriver('--avant', ecrire('sans-colonne.json', sansLaColonne))

		expect(sortie).toContain('Dérive de schéma : les collections du code ne décrivent plus le schéma')
		expect(sortie).toContain('Une migration contiendrait cette instruction :')
		expect(sortie).toContain(`ALTER TABLE "admins" ADD COLUMN "${COLONNE}"`)
		expect(sortie).toContain('bun run payload:migrate:create')
		expect(code).toBe(1)
	})

	test('red on a table the collections have and the migration does not', async () => {
		const sansLaTable = structuredClone(duCode)
		delete sansLaTable.tables?.['public.payload_kv']

		const { code, sortie } = await deriver('--avant', ecrire('sans-table.json', sansLaTable))

		expect(sortie).toContain('CREATE TABLE "payload_kv"')
		expect(code).toBe(1)
	})

	// drizzle-kit itself would ask on the terminal whether the column was renamed, and wait for
	// ever in a run nobody watches (tried once without the check of `ambiguites`: killed after 15 s).
	test('red on a renamed column, at once: the check never waits for an answer', async () => {
		const renomme = structuredClone(duCode)
		const definition = colonnes(renomme)[COLONNE] ?? {}
		delete colonnes(renomme)[COLONNE]
		colonnes(renomme).courriel = { ...definition, name: 'courriel' }

		const debut = performance.now()
		const { code, sortie } = await deriver('--avant', ecrire('renomme.json', renomme))

		expect(sortie).toContain(
			`- colonnes de « ${TABLE} » : « ${COLONNE} » dans le code seulement ; « courriel » dans la migration seulement`
		)
		expect(code).toBe(1)
		expect(performance.now() - debut).toBeLessThan(10_000)
	}, 20_000)

	test('on the repository: no drift against the last migration, every collection has its migration', () => {
		const derniere = derniereMigration()

		expect(derniere?.nom).toMatch(/^\d{8}_\d{6}_\w+$/)
		expect(surLeDepot.sortie).toContain(
			`Aucune dérive de schéma : les collections du code décrivent le schéma de la dernière migration (${derniere?.nom}).`
		)
		expect(surLeDepot.code).toBe(0)
	})

	test('a wrong use is refused before anything is loaded', async () => {
		const { code, sortie } = await deriver('--avant')

		expect(sortie).toContain('Usage : bun run schema:derive')
		expect(code).toBe(2)
	})
})

describe('the CI runs the check, and is red when it is', () => {
	const CI = '.github/workflows/ci.yml'
	const texte = readFileSync(path.join(ROOT, CI), 'utf8')
	const ci = (de = texte) => readWorkflow(CI, de)
	const ETAPE = `      - name: Schema drift\n        if: \${{ !cancelled() }}\n        run: ${SCHEMA_DRIFT.command}\n`
	const change = (avant: string, apres: string): string => {
		if (!texte.includes(avant)) throw new Error(`${CI} no longer holds: ${avant}`)
		return texte.replace(avant, apres)
	}

	test('the job qualite runs « bun run schema:derive », alone in its step, after the installation', () => {
		expect(texte).toContain(ETAPE)
		expect(schemaDriftProblems(ci())).toEqual([])
	})

	test.each([
		[
			'the step removed',
			() => change(ETAPE, ''),
			'job qualite : il doit lancer « bun run schema:derive », seule dans son étape',
		],
		[
			'the command with an option that compares with something else',
			() => change(`run: ${SCHEMA_DRIFT.command}\n`, `run: ${SCHEMA_DRIFT.command} --avant ancien.json\n`),
			'job qualite : il doit lancer « bun run schema:derive », seule dans son étape',
		],
		[
			'the step skipped on a condition',
			() => change(ETAPE, ETAPE.replace('!cancelled()', "github.event_name == 'push'")),
			"« bun run schema:derive » ne tourne que sous « github.event_name == 'push' »",
		],
		[
			'the step before the installation',
			() =>
				change(ETAPE, '').replace(
					'      - name: Install\n        run: bun install --frozen-lockfile\n',
					`${ETAPE}      - name: Install\n        run: bun install --frozen-lockfile\n`
				),
			'« bun run schema:derive » doit venir après « bun install --frozen-lockfile »',
		],
	])('red on %s', (_faute, fautif, attendu) => {
		expect(schemaDriftProblems(ci(fautif())).join('\n')).toContain(attendu)
	})
})

describe('the names drizzle-kit would ask about are found from the two snapshots', () => {
	const instantane = (tables: Record<string, string[]>, enums: string[] = []): Instantane => ({
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
		const avant = instantane({ 'public.a': ['id', 'nom'] })

		expect(ambiguites(avant, avant)).toEqual([])
		expect(ambiguites(avant, instantane({ 'public.a': ['id', 'nom', 'ville'], 'public.b': ['id'] }))).toEqual([])
		expect(ambiguites(avant, instantane({ 'public.a': ['id'] }))).toEqual([])
	})

	test.each([
		[
			'a column renamed',
			instantane({ 'public.a': ['id', 'nom'] }),
			instantane({ 'public.a': ['id', 'prenom'] }),
			'colonnes de « public.a » : « prenom » dans le code seulement ; « nom » dans la migration seulement',
		],
		[
			'a table renamed',
			instantane({ 'public.a': ['id'] }),
			instantane({ 'public.b': ['id'] }),
			'tables : « public.b » dans le code seulement ; « public.a » dans la migration seulement',
		],
		[
			'a type renamed',
			instantane({}, ['public.enum_role']),
			instantane({}, ['public.enum_roles']),
			'types énumérés : « public.enum_roles » dans le code seulement ; « public.enum_role » dans la migration seulement',
		],
	])('found: %s', (_cas, avant, apres, attendue) => {
		expect(ambiguites(avant, apres)).toEqual([attendue])
	})
})

describe('the verdict, in French', () => {
	const sans: Derive = { instructions: [], ambiguites: [] }

	test('no drift: exit code 0', () => {
		expect(verdict(sans, 'la dernière migration (x)')).toEqual({
			code: 0,
			message: 'Aucune dérive de schéma : les collections du code décrivent le schéma de la dernière migration (x).',
		})
	})

	test('statements: exit code 1, each statement on its line', () => {
		const { code, message } = verdict(
			{ ...sans, instructions: ['CREATE TABLE "a" ();\n', 'ALTER TABLE "b" ADD COLUMN "c" varchar;'] },
			'la dernière migration (x)'
		)

		expect(code).toBe(1)
		expect(message.split('\n')).toEqual([
			'Dérive de schéma : les collections du code ne décrivent plus le schéma de la dernière migration (x).',
			'Une migration contiendrait ces 2 instructions :',
			'  CREATE TABLE "a" ();',
			'  ALTER TABLE "b" ADD COLUMN "c" varchar;',
			'Écris la migration par « bun run payload:migrate:create », relis son SQL, puis relance « bun run schema:derive ».',
		])
	})

	test('names on one side only: exit code 1, each one on its line', () => {
		const { code, message } = verdict({ ...sans, ambiguites: ['tables : « b » … ; « a » …'] }, 'x')

		expect(code).toBe(1)
		expect(message).toContain('\n- tables : « b » … ; « a » …\n')
	})
})

describe('the options of the command', () => {
	test.each([
		[[], {}],
		[['--avant', 'a.json'], { avant: 'a.json' }],
		[['--instantane', 'b.json'], { instantane: 'b.json' }],
	])('read: %p', (args, attendu) => {
		expect(lireArguments(args)).toEqual(attendu)
	})

	test.each([
		[['--avant']],
		[['--avant', '--instantane']],
		[['--avant', 'a.json', 'b.json']],
		[['--tout']],
	])('refused: %p', args => {
		expect(lireArguments(args)).toBeUndefined()
	})
})
