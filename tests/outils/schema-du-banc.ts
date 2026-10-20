/**
 * The schema of the bench database: built by the versioned migrations of `src/migrations/`, and
 * never pushed from the code (ticket 049).
 *
 * Out of production, on a database of this machine, Payload pushes the schema of the code when it
 * connects, and leaves its mark in `payload_migrations`: a row `dev` of batch -1. A bench built
 * that way would hide a missing migration until production, which only plays the
 * migrations. So:
 *
 * - the Payload of the tests never changes the schema (`sansChangementDeSchema`,
 *   tests/outils/payload-test.ts);
 * - the commands of the bench play the migrations on an erased database
 *   (`jouerLesMigrations`, scripts/banc.ts), and the application of the end-to-end tests plays
 *   them itself when it starts;
 * - before the first test, `exigerLeSchemaDesMigrations` refuses a database that carries the
 *   mark of a push, or whose schema, as the migrations built it, is not the one of the
 *   collections of the code: a column a migration does not create although its snapshot
 *   declares it, for instance.
 *
 * Only Node's own modules and Payload: the global setup of Playwright loads this file under Node.
 */

import type { Payload } from 'payload'
import { ambiguities, type Drift, type Snapshot } from '../../scripts/ci/schema-drift'
import { BancRefuse } from './banc'

/** The batch Payload gives to the row it writes when it pushes the schema of the code. */
export const LOT_DU_MODE_DEVELOPPEMENT = -1

/** The schema of Payload's tables on the bench. */
const SCHEMA = 'public'

/** The migrations as `src/migrations/index.ts` exports them. */
export interface Migration {
	name: string
	up: (...args: never[]) => Promise<void>
	down: (...args: never[]) => Promise<void>
}

/** What the database says when its schema was checked against the code. */
export interface ConstatDuSchema {
	/** Rows of `payload_migrations` written by a push of the schema (batch -1). */
	lignesDeDeveloppement: number
	/** What separates the database from the collections of the code. */
	ecart: Drift
}

/** Who stops: the command of the integration tests, or the global setup of the end-to-end tests. */
export type Suite = 'test' | 'essai'

const aucunLance = (suite: Suite): string => (suite === 'test' ? 'Aucun test n’a tourné.' : 'Aucun essai n’a tourné.')

/** The functions of drizzle-kit that Payload hands over, and the part of its adapter this file reads. */
interface AdaptateurDeDrizzle {
	schema: Record<string, unknown>
	drizzle: unknown
	schemaName?: string
	tablesFilter?: string[]
	extensions?: { postgis?: boolean }
	pool: { query: <Ligne>(texte: string, valeurs?: unknown[]) => Promise<{ rows: Ligne[] }> }
	migrate: (options: { migrations: Migration[] }) => Promise<void>
	requireDrizzleKit: () => {
		generateDrizzleJson: (schema: unknown) => Snapshot | Promise<Snapshot>
		pushSchema: (
			schema: unknown,
			drizzle: unknown,
			schemas?: string[],
			tables?: string[],
			extensions?: string[]
		) => Promise<{ statementsToExecute: string[] }>
	}
}

const adaptateur = (payload: Payload): AdaptateurDeDrizzle => payload.db as unknown as AdaptateurDeDrizzle

/** Whether the table of the migrations exists: not on an erased database. */
async function tableDesMigrations(payload: Payload): Promise<boolean> {
	const { rows } = await adaptateur(payload).pool.query<{ existe: boolean }>(
		`SELECT to_regclass('${SCHEMA}.payload_migrations') IS NOT NULL AS existe`
	)
	return rows[0]?.existe === true
}

/** How many rows of `payload_migrations` a push of the schema wrote: 0 on a database built by the migrations only. */
export async function lignesDeDeveloppement(payload: Payload): Promise<number> {
	if (!(await tableDesMigrations(payload))) return 0
	const { rows } = await adaptateur(payload).pool.query<{ lignes: number }>(
		'SELECT count(*)::int AS lignes FROM payload_migrations WHERE batch = $1',
		[LOT_DU_MODE_DEVELOPPEMENT]
	)
	return rows[0]?.lignes ?? 0
}

/** The migrations the database says it has played, by name, with their batch. */
export async function migrationsJouees(payload: Payload): Promise<{ name: string; batch: number }[]> {
	if (!(await tableDesMigrations(payload))) return []
	const { rows } = await adaptateur(payload).pool.query<{ name: string; batch: number }>(
		'SELECT name, batch::int AS batch FROM payload_migrations ORDER BY id'
	)
	return rows
}

/** Payload asked to end the process, from the code it was running. */
class SortieDemandee extends Error {
	override readonly name = 'SortieDemandee'
	constructor(readonly code: number | undefined) {
		super(`process.exit(${code ?? ''})`)
	}
}

/**
 * Runs `action` with `process.exit` turned into an error. Payload ends the process when a
 * migration fails (code 1), and when it finds the mark of a push and its question is answered
 * « no » (code 0: a run that would pass without having played anything). Here neither ends the
 * process.
 */
export async function sansSortie<Resultat>(
	action: () => Promise<Resultat>
): Promise<{ resultat: Resultat } | { sortie: number | undefined }> {
	const sortir = process.exit
	process.exit = ((code?: number) => {
		throw new SortieDemandee(code)
	}) as typeof process.exit
	try {
		return { resultat: await action() }
	} catch (erreur) {
		if (erreur instanceof SortieDemandee) return { sortie: erreur.code }
		throw erreur
	} finally {
		process.exit = sortir
	}
}

/**
 * Plays the migrations the database does not have yet, as the application does when it starts in
 * production, and gives the names of those it played. Refuses a database that carries the mark of
 * a push: Payload would ask whether to go on, wait for ever when nobody answers, and end the
 * process with code 0 on « no ».
 */
export async function jouerLesMigrations(payload: Payload, migrations: Migration[], suite: Suite): Promise<string[]> {
	const lignes = await lignesDeDeveloppement(payload)
	if (lignes > 0) throw new BancRefuse(messageDuSchema(constatSansEcart(lignes), suite))
	const avant = new Set((await migrationsJouees(payload)).map(({ name }) => name))
	const issue = await sansSortie(() => adaptateur(payload).migrate({ migrations }))
	if ('sortie' in issue)
		throw new BancRefuse(
			[
				`Une migration de src/migrations/ n’a pas pu être jouée sur la base du banc (Payload a demandé l’arrêt, code ${issue.sortie ?? 'aucun'}) : son message est ci-dessus.`,
				`Corrige la migration, puis relance. ${aucunLance(suite)}`,
			].join('\n')
		)
	const apres = await migrationsJouees(payload)
	const manquantes = migrations.map(({ name }) => name).filter(name => !apres.some(ligne => ligne.name === name))
	if (manquantes.length > 0)
		throw new BancRefuse(
			`Les migrations ${manquantes.join(', ')} ne sont pas inscrites dans payload_migrations après leur passage. ${aucunLance(suite)}`
		)
	return apres.map(({ name }) => name).filter(name => !avant.has(name))
}

const constatSansEcart = (lignes: number): ConstatDuSchema => ({
	lignesDeDeveloppement: lignes,
	ecart: { instructions: [], ambiguites: [] },
})

/** The tables, their columns and the enum types of the database, as a snapshot of drizzle-kit names them. */
async function nomsDeLaBase(payload: Payload): Promise<Snapshot> {
	const { pool } = adaptateur(payload)
	const { rows: colonnes } = await pool.query<{ table: string; colonne: string }>(
		`SELECT c.table_name AS table, c.column_name AS colonne
		 FROM information_schema.columns c
		 JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		 WHERE c.table_schema = $1 AND t.table_type = 'BASE TABLE'`,
		[SCHEMA]
	)
	const { rows: types } = await pool.query<{ nom: string }>(
		`SELECT t.typname AS nom FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
		 WHERE n.nspname = $1 AND t.typtype = 'e'`,
		[SCHEMA]
	)
	const tables: Record<string, { columns: Record<string, unknown> }> = {}
	for (const { table, colonne } of colonnes) {
		const nom = `${SCHEMA}.${table}`
		tables[nom] = { columns: { ...tables[nom]?.columns, [colonne]: {} } }
	}
	return { tables, enums: Object.fromEntries(types.map(({ nom }) => [`${SCHEMA}.${nom}`, {}])) }
}

/** A change of the default value of a column, as drizzle-kit writes it. */
const CHANGEMENT_DE_DEFAUT = /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" SET DEFAULT (.+?);?$/s

/**
 * Whether the default this statement would set is the one the column already has. drizzle-kit
 * reads a default back from the database as text (`'0'::numeric`) and compares it with the one of
 * the code (`0`): the two differ as text, and a push would set them again on every run, as it does
 * for `login_attempts`. PostgreSQL compares the two values; an expression it cannot read keeps
 * the statement.
 */
async function memeDefaut(payload: Payload, table: string, colonne: string, nouveau: string): Promise<boolean> {
	const { pool } = adaptateur(payload)
	const { rows } = await pool.query<{ defaut: string | null; type: string }>(
		`SELECT pg_get_expr(d.adbin, d.adrelid) AS defaut, format_type(a.atttypid, a.atttypmod) AS type
		 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		 WHERE a.attrelid = to_regclass(format('%I.%I', $1::text, $2::text)) AND a.attname = $3`,
		[SCHEMA, table, colonne]
	)
	const actuel = rows[0]
	if (!actuel?.defaut) return false
	try {
		const { rows: comparaison } = await pool.query<{ egal: boolean }>(
			`SELECT (${actuel.defaut})::${actuel.type} IS NOT DISTINCT FROM (${nouveau})::${actuel.type} AS egal`
		)
		return comparaison[0]?.egal === true
	} catch {
		return false
	}
}

/** The statements that would change something: a default set again to the same value is left out. */
async function instructionsUtiles(payload: Payload, instructions: string[]): Promise<string[]> {
	const utiles: string[] = []
	for (const instruction of instructions) {
		const [, table, colonne, nouveau] = CHANGEMENT_DE_DEFAUT.exec(instruction.trim()) ?? []
		if (table && colonne && nouveau && (await memeDefaut(payload, table, colonne, nouveau))) continue
		utiles.push(instruction)
	}
	return utiles
}

/**
 * What separates the database, as the migrations built it, from the collections of the code: the
 * SQL a push would run, never run here. A name on one side only next to other names on the other
 * side (a column renamed) is given at once, from the names alone: drizzle-kit would ask whether
 * one was renamed into the other, and wait for an answer.
 */
export async function ecartAvecLeCode(payload: Payload): Promise<Drift> {
	const db = adaptateur(payload)
	const outils = db.requireDrizzleKit()
	const duCode = await outils.generateDrizzleJson(db.schema)
	const trouvees = ambiguities(await nomsDeLaBase(payload), duCode)
	if (trouvees.length > 0) return { instructions: [], ambiguites: trouvees }
	const { statementsToExecute } = await outils.pushSchema(
		db.schema,
		db.drizzle,
		db.schemaName ? [db.schemaName] : undefined,
		db.tablesFilter,
		db.extensions?.postgis ? ['postgis'] : undefined
	)
	return { instructions: await instructionsUtiles(payload, statementsToExecute), ambiguites: [] }
}

/** What the database says, read without changing anything. */
export async function constaterLeSchema(payload: Payload): Promise<ConstatDuSchema> {
	return { lignesDeDeveloppement: await lignesDeDeveloppement(payload), ecart: await ecartAvecLeCode(payload) }
}

/** Why the tests must not run on this database, in French; or nothing when its schema is the one of the migrations and of the code. */
export function messageDuSchema({ lignesDeDeveloppement, ecart }: ConstatDuSchema, suite: Suite): string | undefined {
	if (lignesDeDeveloppement > 0)
		return [
			`La base du banc porte la trace d’une poussée du schéma : ${lignesDeDeveloppement === 1 ? 'une ligne' : `${lignesDeDeveloppement} lignes`} de lot ${LOT_DU_MODE_DEVELOPPEMENT} (« dev ») dans payload_migrations.`,
			'Son schéma ne vient donc pas des seules migrations versionnées, et une migration manquante y passerait inaperçue.',
			'Un Payload s’est branché sur le banc sans sansChangementDeSchema (tests/outils/payload-test.ts) : cherche-le, puis relance.',
			aucunLance(suite),
		].join('\n')
	if (ecart.ambiguites.length > 0)
		return [
			'Il manque une migration : des noms n’existent que d’un côté entre la base construite par les migrations et les collections du code (un nom changé, ou retiré pendant qu’un autre était ajouté).',
			...ecart.ambiguites.map(ambiguite => `- ${ambiguite}`),
			'Écris la migration qui manque (bun run payload:migrate:create) et relis son SQL, puis relance.',
			aucunLance(suite),
		].join('\n')
	if (ecart.instructions.length > 0)
		return [
			'Il manque une migration : la base construite par les migrations versionnées ne décrit pas les collections du code.',
			`Pour la rattraper, une migration contiendrait ${ecart.instructions.length === 1 ? 'cette instruction' : `ces ${ecart.instructions.length} instructions`} :`,
			...ecart.instructions.map(instruction => `  ${instruction.trim()}`),
			'Écris la migration qui manque (bun run payload:migrate:create), ou corrige le SQL de la migration qui ne crée pas ce que son instantané déclare, puis relance.',
			aucunLance(suite),
		].join('\n')
	return undefined
}

/** Refuses, with the message that says what to do, a database the tests must not run on. */
export async function exigerLeSchemaDesMigrations(payload: Payload, suite: Suite): Promise<void> {
	const message = messageDuSchema(await constaterLeSchema(payload), suite)
	if (message) throw new BancRefuse(message)
}
