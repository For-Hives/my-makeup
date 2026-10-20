import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { MIGRATIONS_FOLDER } from '../../scripts/ci/schema-drift'
import { migrations } from '../../src/migrations'
import { BancRefuse, RACINE } from '../support/bench'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import {
	constaterLeSchema,
	exigerLeSchemaDesMigrations,
	jouerLesMigrations,
	LOT_DU_MODE_DEVELOPPEMENT,
	lignesDeDeveloppement,
	type Migration,
	migrationsJouees,
	sansSortie,
} from '../support/bench-schema'

/**
 * I22 (plan 02 §7.3), ticket 049: the schema of P3 lives in one migration, `init`. On an erased
 * database it builds the schema of the collections of the code; played again it does nothing;
 * generating a migration then finds nothing to write.
 *
 * Then the check that every run of the bench makes before its first test
 * (tests/outils/schema-du-banc.ts): the mark of a schema push, a migration whose SQL no longer
 * creates what its snapshot declares, a renamed column, each one is refused with what to do.
 *
 * The migrations run by Payload's own command, in a process of its own, as a person runs them.
 * Every test leaves the bench as the command of the integration tests prepares it: the schema
 * of the migrations, every table empty.
 */

const [init] = migrations
const INIT = init?.name ?? ''
/** Every versioned migration, in order: init, then the ones written after it. */
const NOMS = migrations.map(({ name }) => name)
/** What the table of the migrations holds once they have all played together. */
const LOT_UN = NOMS.map(name => ({ name, batch: 1 }))

let payload: Payload
/** Where the commands of Payload write their log. */
let dossierDesJournaux = ''

/** Drops every table and type of the bench database, as `bun run test:integration` does before the tests. */
async function effacerLeSchema(): Promise<void> {
	await payload.db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
}

/** The bench as the files that follow expect it: the schema of the migrations, every table empty. */
async function remettreLeBanc(): Promise<void> {
	await effacerLeSchema()
	await jouerLesMigrations(payload, migrations, 'test')
	await viderLaBase()
}

/**
 * Payload's command, as `bun run payload:…` runs it, under the environment of the bench. `reponse`
 * is what a person would type if it asks a question; without it, nobody answers.
 */
async function commandeDePayload(commande: string, reponse?: string): Promise<{ code: number; sortie: string }> {
	// Into a file, not a pipe: Payload's command writes its log synchronously and ends at once, and
	// a line written into a pipe nobody has read yet was seen lost, the last one (« Done. »).
	const journal = path.join(dossierDesJournaux, `${commande.replace(':', '-')}-${crypto.randomUUID()}.log`)
	const enfant = Bun.spawn(
		[process.execPath, '--no-env-file', 'node_modules/payload/bin.js', commande, '--disable-transpile'],
		{ cwd: RACINE, env: process.env, stdin: 'pipe', stdout: Bun.file(journal), stderr: 'inherit' }
	)
	if (reponse !== undefined) enfant.stdin.write(reponse)
	await enfant.stdin.end()
	// A command that waits for an answer is stopped, and the test reads its code, 143.
	const limite = setTimeout(() => enfant.kill(), 60_000)
	const code = await enfant.exited.finally(() => clearTimeout(limite))
	return { code, sortie: readFileSync(journal, 'utf8') }
}

/** The types, tables, columns, indexes and constraints of the bench database: what the migrations build. */
async function schemaDeLaBase(): Promise<string[]> {
	const lire = async (requete: string): Promise<string[]> =>
		(await payload.db.pool.query<{ ligne: string }>(requete)).rows.map(({ ligne }) => ligne)
	const lignes = await Promise.all([
		lire(
			`SELECT format('%s.%s %s %s %s', table_name, column_name, udt_name, is_nullable, coalesce(column_default, '')) AS ligne
			 FROM information_schema.columns WHERE table_schema = 'public'`
		),
		lire(`SELECT format('index %s.%s', tablename, indexname) AS ligne FROM pg_indexes WHERE schemaname = 'public'`),
		lire(
			`SELECT format('contrainte %s.%s %s', conrelid::regclass, conname, contype) AS ligne
			 FROM pg_constraint WHERE connamespace = 'public'::regnamespace`
		),
		lire(
			`SELECT format('type %s', t.typname) AS ligne FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
			 WHERE n.nspname = 'public' AND t.typtype = 'e'`
		),
	])
	return lignes.flat().sort()
}

/** The SQL of `up` in the file of `init`, as it is versioned. */
function sqlDeInit(): string {
	const texte = readFileSync(path.join(MIGRATIONS_FOLDER, `${INIT}.ts`), 'utf8')
	const trouve = /export async function up[\s\S]*?sql`([\s\S]*?)`\)/.exec(texte)?.[1]
	if (!trouve) throw new Error(`no SQL found in the up of ${INIT}`)
	return trouve
}

/** `init` with its SQL changed by `retoucher`, under the same name: what an edited migration plays. */
function initRetouchee(retoucher: (sqlDOrigine: string) => string): Migration {
	const retouche = retoucher(sqlDeInit())
	if (retouche === sqlDeInit()) throw new Error('the change of the SQL changes nothing')
	return {
		name: INIT,
		up: async ({ db }: MigrateUpArgs) => {
			await db.execute(sql.raw(retouche))
		},
		down: async () => undefined,
	}
}

beforeAll(async () => {
	payload = await payloadDeTest()
	dossierDesJournaux = mkdtempSync(path.join(os.tmpdir(), 'migrations-journaux-'))
})

afterAll(async () => {
	await remettreLeBanc()
	rmSync(dossierDesJournaux, { recursive: true, force: true })
})

describe('I22 : la migration init, sur une base effacée, puis rejouée', () => {
	test('la première migration versionnée est init', () => {
		expect(INIT).toMatch(/^\d{8}_\d{6}_init$/)
	})

	test('init passe sur une base effacée, sans ligne « dev » ; rejouée, elle ne fait rien', async () => {
		await effacerLeSchema()
		// Nothing was pushed: there is not even a table of the migrations.
		expect(await migrationsJouees(payload)).toEqual([])
		expect(await lignesDeDeveloppement(payload)).toBe(0)

		const premiere = await commandeDePayload('migrate')

		expect(premiere.sortie).toContain(`Migrating: ${INIT}`)
		expect(premiere.sortie).toContain('Done.')
		expect(premiere.code).toBe(0)
		// The row the migration writes when it has run: answered « no », Payload's « dev mode »
		// question ends the command with code 0 too, but before anything is played or written.
		expect(await migrationsJouees(payload)).toEqual(LOT_UN)
		expect(await lignesDeDeveloppement(payload)).toBe(0)
		const schema = await schemaDeLaBase()
		expect(schema.length).toBeGreaterThan(100)

		const seconde = await commandeDePayload('migrate')

		expect(seconde.sortie).toContain('Done.')
		expect(seconde.sortie).not.toContain('Migrating:')
		expect(seconde.code).toBe(0)
		expect(await migrationsJouees(payload)).toEqual(LOT_UN)
		expect(await schemaDeLaBase()).toEqual(schema)
	}, 120_000)

	test('la base que construit init est celle des collections du code : rien à pousser, aucune trace de poussée', async () => {
		expect(await constaterLeSchema(payload)).toEqual({
			lignesDeDeveloppement: 0,
			ecart: { instructions: [], ambiguites: [] },
		})
		await exigerLeSchemaDesMigrations(payload, 'test')
	})

	test('générer une migration ne crée rien : « migrate:create --skip-empty » sort sans écrire de fichier', async () => {
		// Payload's own function, the one its command calls, on a copy of the snapshots: nothing is
		// written next to the versioned migrations, even if the check were to fail.
		const dossier = mkdtempSync(path.join(os.tmpdir(), 'migrations-i22-'))
		for (const fichier of readdirSync(MIGRATIONS_FOLDER).filter(nom => nom.endsWith('.json')))
			copyFileSync(path.join(MIGRATIONS_FOLDER, fichier), path.join(dossier, fichier))
		const avant = readdirSync(dossier).sort()
		const dossierDOrigine = payload.db.migrationDir
		payload.db.migrationDir = dossier
		try {
			const issue = await sansSortie(async () => {
				await payload.db.createMigration({ migrationName: 'controle_i22', payload, skipEmpty: true })
			})

			// Payload ends the process when it has nothing to write: here, the code of that end.
			expect(issue).toEqual({ sortie: 0 })
			expect(readdirSync(dossier).sort()).toEqual(avant)
			expect(avant).toEqual(NOMS.map(nom => `${nom}.json`).sort())
		} finally {
			payload.db.migrationDir = dossierDOrigine
			rmSync(dossier, { recursive: true, force: true })
		}
	})

	test('le down de init retire tout ce que son up a créé, puis init se rejoue', async () => {
		const schema = await schemaDeLaBase()

		const descente = await commandeDePayload('migrate:down')

		for (const nom of NOMS) expect(descente.sortie).toContain(`Migrated down:  ${nom}`)
		expect(descente.code).toBe(0)
		expect(await schemaDeLaBase()).toEqual([])

		expect(await jouerLesMigrations(payload, migrations, 'test')).toEqual(NOMS)
		expect(await schemaDeLaBase()).toEqual(schema)
	}, 120_000)
})

describe('Avant le premier test ou essai, une base que les migrations n’ont pas construite comme le code est refusée', () => {
	test('la trace d’une poussée : la commande de Payload sort en 0 sans rien jouer, le contrôle la refuse', async () => {
		// The row Payload writes when it pushes the schema of the code (pushDevSchema).
		await payload.db.pool.query("INSERT INTO payload_migrations (name, batch) VALUES ('dev', $1)", [
			LOT_DU_MODE_DEVELOPPEMENT,
		])
		try {
			// What the check guards against: Payload asks whether to go on (and waits for ever when
			// nobody answers); « no », its default, ends the command with the code of a success, and
			// nothing was played.
			const commande = await commandeDePayload('migrate', 'n')

			expect(commande.sortie).toContain('dev mode')
			expect(commande.sortie).not.toContain('Done.')
			expect(commande.code).toBe(0)

			const refus = 'La base du banc porte la trace d’une poussée du schéma : une ligne de lot -1 (« dev »)'
			await expect(exigerLeSchemaDesMigrations(payload, 'essai')).rejects.toThrow(refus)
			await expect(jouerLesMigrations(payload, migrations, 'test')).rejects.toThrow(refus)
			await expect(exigerLeSchemaDesMigrations(payload, 'essai')).rejects.toBeInstanceOf(BancRefuse)
		} finally {
			await payload.db.pool.query('DELETE FROM payload_migrations WHERE batch = $1', [LOT_DU_MODE_DEVELOPPEMENT])
		}
	}, 120_000)

	test('une migration dont le SQL ne crée plus une colonne que son instantané déclare : la migration qui manque est demandée, avec son SQL', async () => {
		const retouchee = initRetouchee(sqlDOrigine =>
			sqlDOrigine.replace(/(CREATE TABLE "talents" \([\s\S]*?)\n\s*"seo_title" varchar,/, '$1')
		)
		try {
			await effacerLeSchema()
			// Played as the application plays it: the migration passes, the column is missing.
			expect(await jouerLesMigrations(payload, [retouchee, ...migrations.slice(1)], 'test')).toEqual(NOMS)

			const constat = await constaterLeSchema(payload)

			expect(constat).toEqual({
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
			await expect(exigerLeSchemaDesMigrations(payload, 'essai')).rejects.toThrow(message)
		} finally {
			await remettreLeBanc()
		}
	})

	test('une colonne renommée : refusée aussitôt, d’après les noms, sans attendre une réponse', async () => {
		const retouchee = initRetouchee(sqlDOrigine =>
			sqlDOrigine.replace(/(CREATE TABLE "talents" \([\s\S]*?)"seo_title" varchar,/, '$1"titre_seo" varchar,')
		)
		try {
			await effacerLeSchema()
			await jouerLesMigrations(payload, [retouchee, ...migrations.slice(1)], 'test')
			const debut = performance.now()

			const constat = await constaterLeSchema(payload)

			expect(constat.ecart).toEqual({
				instructions: [],
				ambiguites: [
					'colonnes de « public.talents » : « seo_title » dans le code seulement ; « titre_seo » dans la migration seulement',
				],
			})
			await expect(exigerLeSchemaDesMigrations(payload, 'test')).rejects.toThrow(
				'Il manque une migration : des noms n’existent que d’un côté'
			)
			expect(performance.now() - debut).toBeLessThan(10_000)
		} finally {
			await remettreLeBanc()
		}
	})
})
