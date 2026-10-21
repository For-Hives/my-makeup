import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { MIGRATIONS_FOLDER } from '../../scripts/ci/schema-drift'
import { placeDemoProfiles } from '../../src/demo-data/loading'
import { profileState } from '../../src/lib/profile/state'
import { migrations } from '../../src/migrations'
import { RefusedBench, ROOT } from '../support/bench'
import {
	developmentLines,
	findSchema,
	type Migration,
	MODE_DEVELOPMENT_BATCH,
	migrationRun,
	requireMigrationsSchema,
	runMigrations,
	withoutOutput,
} from '../support/bench-schema'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'

/**
 * I22 (plan 02 §7.3), ticket 049: the schema of P3 lives in one migration, `init`. On an erased
 * database it builds the schema of the collections of the code; played again it does nothing;
 * generating a migration then finds nothing to write.
 *
 * Then the check that every run of the bench makes before its first test
 * (tests/support/bench-schema.ts): the mark of a schema push, a migration whose SQL no longer
 * creates what its snapshot declares, a renamed column, each one is refused with what to do.
 *
 * The migrations run by Payload's own command, in a process of its own, as a person runs them.
 * Every test leaves the bench as the command of the integration tests prepares it: the schema
 * of the migrations, every table empty.
 */

const [init] = migrations
const INIT = init?.name ?? ''
/** Every versioned migration, in order: init, then the ones written after it. */
const NAMES = migrations.map(({ name }) => name)
/** What the table of the migrations holds once they have all played together. */
const BATCH_ONE = NAMES.map(name => ({ name, batch: 1 }))

let payload: Payload
/** Where the commands of Payload write their log. */
let logsFolder = ''

/** Drops every table and type of the bench database, as `bun run test:integration` does before the tests. */
async function eraseSchema(): Promise<void> {
	await payload.db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
}

/** The bench as the files that follow expect it: the schema of the migrations, every table empty. */
async function resetBench(): Promise<void> {
	await eraseSchema()
	await runMigrations(payload, migrations, 'test')
	await emptyBase()
}

/**
 * Payload's command, as `bun run payload:…` runs it, under the environment of the bench. `reponse`
 * is what a person would type if it asks a question; without it, nobody answers.
 */
async function payloadCommand(commande: string, reponse?: string): Promise<{ code: number; sortie: string }> {
	// Into a file, not a pipe: Payload's command writes its log synchronously and ends at once, and
	// a line written into a pipe nobody has read yet was seen lost, the last one (« Done. »).
	const log = path.join(logsFolder, `${commande.replace(':', '-')}-${crypto.randomUUID()}.log`)
	const child = Bun.spawn(
		[process.execPath, '--no-env-file', 'node_modules/payload/bin.js', commande, '--disable-transpile'],
		{ cwd: ROOT, env: process.env, stdin: 'pipe', stdout: Bun.file(log), stderr: 'inherit' }
	)
	if (reponse !== undefined) child.stdin.write(reponse)
	await child.stdin.end()
	// A command that waits for an answer is stopped, and the test reads its code, 143.
	const limit = setTimeout(() => child.kill(), 60_000)
	const code = await child.exited.finally(() => clearTimeout(limit))
	return { code, sortie: readFileSync(log, 'utf8') }
}

/** The types, tables, columns, indexes and constraints of the bench database: what the migrations build. */
async function baseSchema(): Promise<string[]> {
	const read = async (requete: string): Promise<string[]> =>
		(await payload.db.pool.query<{ ligne: string }>(requete)).rows.map(({ ligne }) => ligne)
	const lines = await Promise.all([
		read(
			`SELECT format('%s.%s %s %s %s', table_name, column_name, udt_name, is_nullable, coalesce(column_default, '')) AS ligne
			 FROM information_schema.columns WHERE table_schema = 'public'`
		),
		read(`SELECT format('index %s.%s', tablename, indexname) AS ligne FROM pg_indexes WHERE schemaname = 'public'`),
		read(
			`SELECT format('contrainte %s.%s %s', conrelid::regclass, conname, contype) AS ligne
			 FROM pg_constraint WHERE connamespace = 'public'::regnamespace`
		),
		read(
			`SELECT format('type %s', t.typname) AS ligne FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
			 WHERE n.nspname = 'public' AND t.typtype = 'e'`
		),
	])
	return lines.flat().sort()
}

/** The SQL of `up` in the file of `init`, as it is versioned. */
function initSql(): string {
	const text = readFileSync(path.join(MIGRATIONS_FOLDER, `${INIT}.ts`), 'utf8')
	const found = /export async function up[\s\S]*?sql`([\s\S]*?)`\)/.exec(text)?.[1]
	if (!found) throw new Error(`no SQL found in the up of ${INIT}`)
	return found
}

/** `init` with its SQL changed by `retoucher`, under the same name: what an edited migration plays. */
function touchedUpInit(retoucher: (sqlDOrigine: string) => string): Migration {
	const touchUp = retoucher(initSql())
	if (touchUp === initSql()) throw new Error('the change of the SQL changes nothing')
	return {
		name: INIT,
		up: async ({ db }: MigrateUpArgs) => {
			await db.execute(sql.raw(touchUp))
		},
		down: async () => undefined,
	}
}

beforeAll(async () => {
	payload = await testPayload()
	logsFolder = mkdtempSync(path.join(os.tmpdir(), 'migrations-journaux-'))
})

afterAll(async () => {
	await resetBench()
	rmSync(logsFolder, { recursive: true, force: true })
})

describe('I22 : la migration init, sur une base effacée, puis rejouée', () => {
	test('la première migration versionnée est init', () => {
		expect(INIT).toMatch(/^\d{8}_\d{6}_init$/)
	})

	test('init passe sur une base effacée, sans ligne « dev » ; rejouée, elle ne fait rien', async () => {
		await eraseSchema()
		// Nothing was pushed: there is not even a table of the migrations.
		expect(await migrationRun(payload)).toEqual([])
		expect(await developmentLines(payload)).toBe(0)

		const first = await payloadCommand('migrate')

		expect(first.sortie).toContain(`Migrating: ${INIT}`)
		expect(first.sortie).toContain('Done.')
		expect(first.code).toBe(0)
		// The row the migration writes when it has run: answered « no », Payload's « dev mode »
		// question ends the command with code 0 too, but before anything is played or written.
		expect(await migrationRun(payload)).toEqual(BATCH_ONE)
		expect(await developmentLines(payload)).toBe(0)
		const schema = await baseSchema()
		expect(schema.length).toBeGreaterThan(100)

		const second = await payloadCommand('migrate')

		expect(second.sortie).toContain('Done.')
		expect(second.sortie).not.toContain('Migrating:')
		expect(second.code).toBe(0)
		expect(await migrationRun(payload)).toEqual(BATCH_ONE)
		expect(await baseSchema()).toEqual(schema)
	}, 120_000)

	test('la base que construit init est celle des collections du code : rien à pousser, aucune trace de poussée', async () => {
		expect(await findSchema(payload)).toEqual({
			lignesDeDeveloppement: 0,
			ecart: { instructions: [], ambiguites: [] },
		})
		await requireMigrationsSchema(payload, 'test')
	})

	test('générer une migration ne crée rien : « migrate:create --skip-empty » sort sans écrire de fichier', async () => {
		// Payload's own function, the one its command calls, on a copy of the snapshots: nothing is
		// written next to the versioned migrations, even if the check were to fail.
		const folder = mkdtempSync(path.join(os.tmpdir(), 'migrations-i22-'))
		for (const file of readdirSync(MIGRATIONS_FOLDER).filter(nom => nom.endsWith('.json')))
			copyFileSync(path.join(MIGRATIONS_FOLDER, file), path.join(folder, file))
		const before = readdirSync(folder).sort()
		const originFolder = payload.db.migrationDir
		payload.db.migrationDir = folder
		try {
			const issue = await withoutOutput(async () => {
				await payload.db.createMigration({ migrationName: 'controle_i22', payload, skipEmpty: true })
			})

			// Payload ends the process when it has nothing to write: here, the code of that end.
			expect(issue).toEqual({ sortie: 0 })
			expect(readdirSync(folder).sort()).toEqual(before)
			expect(before).toEqual(NAMES.map(nom => `${nom}.json`).sort())
		} finally {
			payload.db.migrationDir = originFolder
			rmSync(folder, { recursive: true, force: true })
		}
	})

	test('le down de init retire tout ce que son up a créé, puis init se rejoue', async () => {
		const schema = await baseSchema()

		const descent = await payloadCommand('migrate:down')

		for (const migrationName of NAMES) expect(descent.sortie).toContain(`Migrated down:  ${migrationName}`)
		expect(descent.code).toBe(0)
		expect(await baseSchema()).toEqual([])

		expect(await runMigrations(payload, migrations, 'test')).toEqual(NAMES)
		expect(await baseSchema()).toEqual(schema)
	}, 120_000)
})

describe('Avant le premier test ou essai, une base que les migrations n’ont pas construite comme le code est refusée', () => {
	test('la trace d’une poussée : la commande de Payload sort en 0 sans rien jouer, le contrôle la refuse', async () => {
		// The row Payload writes when it pushes the schema of the code (pushDevSchema).
		await payload.db.pool.query("INSERT INTO payload_migrations (name, batch) VALUES ('dev', $1)", [
			MODE_DEVELOPMENT_BATCH,
		])
		try {
			// What the check guards against: Payload asks whether to go on (and waits for ever when
			// nobody answers); « no », its default, ends the command with the code of a success, and
			// nothing was played.
			const command = await payloadCommand('migrate', 'n')

			expect(command.sortie).toContain('dev mode')
			expect(command.sortie).not.toContain('Done.')
			expect(command.code).toBe(0)

			const refusal = 'La base du banc porte la trace d’une poussée du schéma : une ligne de lot -1 (« dev »)'
			await expect(requireMigrationsSchema(payload, 'essai')).rejects.toThrow(refusal)
			await expect(runMigrations(payload, migrations, 'test')).rejects.toThrow(refusal)
			await expect(requireMigrationsSchema(payload, 'essai')).rejects.toBeInstanceOf(RefusedBench)
		} finally {
			await payload.db.pool.query('DELETE FROM payload_migrations WHERE batch = $1', [MODE_DEVELOPMENT_BATCH])
		}
	}, 120_000)

	test('une migration dont le SQL ne crée plus une colonne que son instantané déclare : la migration qui manque est demandée, avec son SQL', async () => {
		const touchedUp = touchedUpInit(sqlDOrigine =>
			sqlDOrigine.replace(/(CREATE TABLE "talents" \([\s\S]*?)\n\s*"seo_title" varchar,/, '$1')
		)
		try {
			await eraseSchema()
			// Played as the application plays it: the migration passes, the column is missing.
			expect(await runMigrations(payload, [touchedUp, ...migrations.slice(1)], 'test')).toEqual(NAMES)

			const finding = await findSchema(payload)

			expect(finding).toEqual({
				lignesDeDeveloppement: 0,
				ecart: { instructions: ['ALTER TABLE "talents" ADD COLUMN "seo_title" varchar;'], ambiguites: [] },
			})
			const message = [
				'Il manque une migration : la base construite par les migrations versionnées ne décrit pas les collections du code.',
				'Pour la rattraper, une migration contiendrait cette instruction :',
				'  ALTER TABLE "talents" ADD COLUMN "seo_title" varchar;',
				'Écris la migration qui manque (bun run payload:migrate:create), ou corrige le SQL de la migration qui ne crée pas ce que son instantané déclare, puis relance.',
				'Aucun essai n’a tourné.',
			].join('\n')
			await expect(requireMigrationsSchema(payload, 'essai')).rejects.toThrow(message)
		} finally {
			await resetBench()
		}
	})

	test('une colonne renommée : refusée aussitôt, d’après les noms, sans attendre une réponse', async () => {
		const touchedUp = touchedUpInit(sqlDOrigine =>
			sqlDOrigine.replace(/(CREATE TABLE "talents" \([\s\S]*?)"seo_title" varchar,/, '$1"titre_seo" varchar,')
		)
		try {
			await eraseSchema()
			await runMigrations(payload, [touchedUp, ...migrations.slice(1)], 'test')
			const start = performance.now()

			const finding = await findSchema(payload)

			expect(finding.ecart).toEqual({
				instructions: [],
				ambiguites: [
					'colonnes de « public.talents » : « seo_title » dans le code seulement ; « titre_seo » dans la migration seulement',
				],
			})
			await expect(requireMigrationsSchema(payload, 'test')).rejects.toThrow(
				'Il manque une migration : des noms n’existent que d’un côté'
			)
			expect(performance.now() - start).toBeLessThan(10_000)
		} finally {
			await resetBench()
		}
	})
})

describe('La migration de la zone (ticket 259) : des ajouts seulement, sur une base déjà remplie', () => {
	const zone = migrations.find(({ name }) => name.endsWith('_zone_countries_postal_codes'))
	// Every migration after it (ticket 275 and the next ones) is taken back first, in reverse order, and played again
	// last, so that the zone's own up and down are checked alone and a later migration needs no edit here.
	const zoneIndex = migrations.findIndex(({ name }) => name.endsWith('_zone_countries_postal_codes'))
	const later = migrations.slice(zoneIndex + 1)

	/** What the rule stores of each profile, read from the table itself: nothing the migration adds. */
	async function profileStates() {
		const { rows } = await payload.db.pool.query(
			'SELECT id, active, publishable, completeness, status, chosen_status FROM profiles ORDER BY id'
		)
		return rows
	}

	test('la migration existe, après init', () => {
		expect(zone).toBeDefined()
		expect(NAMES.indexOf(zone?.name ?? '')).toBeGreaterThan(0)
	})

	test('jouée sur le jeu du banc : rien d’existant ne change, chaque profil est de type city, et son down retire ses seuls objets', async () => {
		if (!zone) throw new Error('la migration de la zone manque')
		const args = { db: payload.db.drizzle, payload, req: {} as never }
		try {
			await eraseSchema()
			// The first migration alone, as the production played it, then the one after it in its own batch.
			expect(await runMigrations(payload, [init as Migration], 'test')).toEqual([INIT])
			const afterInit = await baseSchema()
			expect(await runMigrations(payload, migrations, 'test')).toEqual(NAMES.filter(name => name !== INIT))
			const afterZone = await baseSchema()
			for (const migration of [...later].reverse()) await migration.down(args)
			const zoneOnly = await baseSchema()
			for (const migration of later) await migration.up(args)
			expect(await baseSchema()).toEqual(afterZone)

			// Additions only: every column, index, constraint and type of init is still there, as it was.
			for (const line of afterInit) expect(afterZone, line).toContain(line)
			const added = zoneOnly.filter(line => !afterInit.includes(line))
			expect(added.length).toBeGreaterThan(0)
			for (const line of added) expect(line, line).toMatch(/zone_kind|zone_review|profiles\.town|profiles_texts/)

			// The set of the bench is loaded on the schema of the code, then the migration is played back
			// on a table that holds its profiles: down, then up again.
			const loaded = await placeDemoProfiles(payload)
			expect(loaded.crees.length).toBeGreaterThan(0)
			const before = await profileStates()
			expect(before.length).toBe(loaded.crees.length)
			// The set holds zones of countries: the rule, played again on what the server stored, gives
			// the state it stored for every profile (ticket 260), the zones of countries included.
			const kindsBefore = await payload.db.pool.query('SELECT DISTINCT zone_kind FROM profiles ORDER BY zone_kind')
			expect(kindsBefore.rows).toEqual([{ zone_kind: 'city' }, { zone_kind: 'countries' }])
			const textsBefore = await payload.db.pool.query('SELECT count(*)::int AS total FROM profiles_texts')
			expect(textsBefore.rows[0]?.total).toBeGreaterThan(0)
			const stored = await payload.find({ collection: 'profiles', depth: 0, limit: 100, pagination: false })
			const countriesProfiles = stored.docs.filter(({ zoneKind }) => zoneKind === 'countries')
			expect(countriesProfiles.length).toBeGreaterThan(0)
			for (const doc of stored.docs) {
				const state = profileState(doc)
				expect({ id: doc.id, publishable: state.publishable, active: state.active }).toEqual({
					id: doc.id,
					publishable: doc.publishable === true,
					active: doc.active === true,
				})
			}

			for (const migration of [...later].reverse()) await migration.down(args)
			await zone.down(args)
			expect(await baseSchema()).toEqual(afterInit)
			expect(await profileStates()).toEqual(before)

			await zone.up(args)
			for (const migration of later) await migration.up(args)
			expect(await baseSchema()).toEqual(afterZone)
			expect(await profileStates()).toEqual(before)
			const kinds = await payload.db.pool.query('SELECT DISTINCT zone_kind FROM profiles')
			// Down drops the countries with their table, as its comment says: every zone is a commune again.
			expect(kinds.rows).toEqual([{ zone_kind: 'city' }])
			const texts = await payload.db.pool.query('SELECT count(*)::int AS total FROM profiles_texts')
			expect(texts.rows).toEqual([{ total: 0 }])
		} finally {
			await emptyStorage()
			await resetBench()
		}
	}, 120_000)
})
