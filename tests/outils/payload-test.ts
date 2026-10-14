/**
 * The Payload instance of the tests, attached to the database of the bench, and the tool that
 * empties that database between two tests.
 *
 * Both work on one database only: the one of the bench instance this process was started for.
 * Everywhere else they stop before the first write.
 *
 * The Payload of the tests never changes the schema (`sansChangementDeSchema`): the tables of the
 * bench are built by the versioned migrations only. `bun run test:integration` and
 * `bun run banc:prepare` erase the bench database and play the migrations before the tests; the
 * application of the end-to-end tests plays them itself when it starts (ticket 049,
 * tests/outils/schema-du-banc.ts).
 */

import type { CollectionSlug, Payload, SanitizedConfig } from 'payload'
import { BancRefuse, environnementDuBanc, lireInstance, prefixeDeCommande, type Variables } from './banc'

/** The bookkeeping of the schema, not data: a reset keeps it, or Payload would no longer know its own schema. */
const TABLE_DES_MIGRATIONS = 'payload_migrations'
const COLLECTION_DES_MIGRATIONS = 'payload-migrations'

/** The part of Payload the checks below read: the connection it was really built with. */
export interface ConnexionDePayload {
	db: { poolOptions?: { connectionString?: string } }
}

/**
 * The connection string of the bench this process works on. Throws `BancRefuse` when the
 * environment does not point at it: no bench at all (a test started by hand), or another
 * database (a working `.env`, the bench of another instance).
 */
export function exigerBanc(variables: Variables = process.env): string {
	const instance = lireInstance(variables)
	const attendue = environnementDuBanc(instance).DATABASE_URI
	if (attendue && variables.DATABASE_URI === attendue) return attendue
	const prefixe = prefixeDeCommande(instance)
	throw new BancRefuse(
		[
			variables.DATABASE_URI
				? 'DATABASE_URI ne désigne pas la base du banc de test : rien n’est écrit.'
				: 'Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.',
			`Démarre le banc par « ${prefixe}bun run banc:up », puis lance les tests par « ${prefixe}bun run test:integration ».`,
		].join(' ')
	)
}

/** Checks that Payload itself is connected to the bench, whatever the environment says now. */
export function exigerConnexionDuBanc(payload: ConnexionDePayload, variables: Variables = process.env): void {
	if (payload.db.poolOptions?.connectionString !== exigerBanc(variables))
		throw new BancRefuse('Payload n’est pas branché sur la base du banc de test : rien n’est écrit.')
}

/**
 * The configuration of the application, with a database adapter that never changes the schema
 * when it connects. Payload would otherwise push the schema of the code into a database of this
 * machine out of production (`pushDevSchema`, which leaves a row `dev` of batch -1 in
 * `payload_migrations`), or play its migrations in production. The adapter's own switch, `push`,
 * turns the first off; the second has nothing to play.
 */
export function sansChangementDeSchema(config: SanitizedConfig): SanitizedConfig {
	const { init } = config.db
	return {
		...config,
		db: { ...config.db, init: options => Object.assign(init(options), { push: false, prodMigrations: undefined }) },
	}
}

let instance: Promise<Payload> | undefined

async function demarrerPayload(): Promise<Payload> {
	// Before the configuration is even loaded: it connects to whatever the environment names.
	exigerBanc()
	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	const payload = await getPayload({ config: sansChangementDeSchema(await config) })
	exigerConnexionDuBanc(payload)
	return payload
}

/**
 * The Payload of the tests, connected to the bench database, without ever changing its schema.
 * The first call starts it; the next calls give the same instance back.
 */
export function payloadDeTest(): Promise<Payload> {
	instance ??= demarrerPayload()
	return instance
}

/** Reset: empties every table of the bench database, counters included. The schema stays. */
export async function viderLaBase(): Promise<void> {
	const payload = await payloadDeTest()
	exigerConnexionDuBanc(payload)
	const { rows } = await payload.db.pool.query<{ nom: string }>(
		`SELECT format('%I.%I', table_schema, table_name) AS nom FROM information_schema.tables
		 WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> $1`,
		[TABLE_DES_MIGRATIONS]
	)
	if (rows.length === 0) return
	await payload.db.pool.query(`TRUNCATE TABLE ${rows.map(({ nom }) => nom).join(', ')} RESTART IDENTITY CASCADE`)
}

/** How many documents each collection holds, Payload's own ones included (preferences, locks…). */
export async function compterLesDocuments(): Promise<Record<string, number>> {
	const payload = await payloadDeTest()
	const collections = payload.config.collections
		.map(({ slug }) => slug as CollectionSlug)
		.filter(slug => slug !== COLLECTION_DES_MIGRATIONS)
	const comptes = await Promise.all(
		collections.map(async collection => [collection, (await payload.count({ collection })).totalDocs] as const)
	)
	return Object.fromEntries(comptes)
}

/** How many rows each table of the bench database holds, the tables Payload hides behind a collection included. */
export async function compterLesLignes(): Promise<Record<string, number>> {
	const payload = await payloadDeTest()
	const { rows: tables } = await payload.db.pool.query<{ nom: string; cible: string }>(
		`SELECT table_name AS nom, format('%I.%I', table_schema, table_name) AS cible FROM information_schema.tables
		 WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> $1 ORDER BY 1`,
		[TABLE_DES_MIGRATIONS]
	)
	const comptes = await Promise.all(
		tables.map(async ({ nom, cible }) => {
			const { rows } = await payload.db.pool.query<{ lignes: number }>(`SELECT count(*)::int AS lignes FROM ${cible}`)
			return [nom, rows[0]?.lignes ?? -1] as const
		})
	)
	return Object.fromEntries(comptes)
}
