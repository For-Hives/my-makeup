/**
 * How the fake Strapi source is created, statement by statement, whatever the client that runs
 * them: bun on the bench (tests/support/source-strapi.ts), `pg` where the application poses it.
 *
 * Three steps, each one given the function that runs a statement:
 *
 *   await preparerLaBase(maintenance, { base, role, motDePasse })   the database and its read-only role
 *   await remplirLaBase(administration, definition, role)           tables, rows, hashes, grants
 *   await effacerLaBase(maintenance, { base, role })                drops both
 *
 * `maintenance` runs in another database of the same server, as its owner; `administration` in
 * the source database, as the same owner, inside one transaction the caller opens. A hash or an
 * email never leaves PostgreSQL: they travel as parameters, and nothing here prints.
 *
 * Only Node's own modules: no API of bun.
 */

import { createHash } from 'node:crypto'
import type { Line, SourceDefinition, Value } from './data'
import { CONVERSIONS, identifier, TABLE_NAMES, TABLES, type TableName, tableCreation } from './schema'

/** A value of a parameter, as both clients send it. */
export type Parameter = string | number | boolean | null

/** Runs one SQL statement, one command, and gives its rows. */
export type Run = (texte: string, parametres?: readonly Parameter[]) => Promise<readonly unknown[]>

/** Where the source lives on its server: its database, and the role that can only read it. */
export interface SourceBase {
	base: string
	role: string
}

/** The cost of the bcrypt hashes, the one of every real hash (`$2a$10$`, plans/01 §2.4). */
const COST_BCRYPT = 10

/** The alphabet of bcrypt, for its salt. */
const ALPHABET_BCRYPT = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** A database, a role, a password: written into SQL statements, so only plain characters. */
const NAME_SQL = /^[a-z][a-z0-9_]{0,62}$/
const PASSWORD_SQL = /^[A-Za-z0-9-]{8,100}$/

const literal = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

function requireNames({ base, role }: SourceBase): void {
	if (!NAME_SQL.test(base) || !NAME_SQL.test(role))
		throw new Error('Fausse base Strapi : une base et un rôle s’écrivent en minuscules, chiffres et « _ ».')
}

/** The functions of PostgreSQL that create a large object, server side (`lo_create`) or by the client library (`lo_creat`, `lo_import`). */
const LARGE_OBJECT_FUNCTIONS = [
	'pg_catalog.lo_create(oid)',
	'pg_catalog.lo_creat(integer)',
	'pg_catalog.lo_from_bytea(oid, bytea)',
	'pg_catalog.lo_import(text)',
	'pg_catalog.lo_import(text, oid)',
] as const

/**
 * Checks that the role cannot run the functions that create a large object. PostgreSQL only warns
 * (« no privileges could be revoked ») when the one who revokes is neither a superuser nor the owner
 * of `pg_catalog`, and the role then keeps the privilege: the check reads the privilege itself.
 */
export async function requireRevocation(executer: Run, role: string): Promise<void> {
	const still: string[] = []
	for (const fn of LARGE_OBJECT_FUNCTIONS) {
		const [line] = (await executer("SELECT has_function_privilege($1::name, $2::text, 'EXECUTE') AS permis", [
			role,
			fn,
		])) as { permis?: boolean }[]
		if (line?.permis !== false) still.push(fn)
	}
	if (still.length > 0)
		throw new Error(
			`Fausse base Strapi : le rôle « ${role} » peut encore créer des grands objets (${still.join(', ')}). Le retrait de ce droit demande un super-utilisateur : crée la base avec un compte qui l’est.`
		)
}

/** A salt of bcrypt drawn from the id of the account: the same account always gets the same hash. */
export function saltBcrypt(id: number): string {
	const bytes = createHash('sha256').update(`sel-factice-${id}`).digest()
	// 16 bytes of salt in 22 characters of 6 bits: the last character carries the last 2 bits only,
	// its 4 low bits stay at 0, as bcrypt writes them.
	const characters = Array.from({ length: 22 }, (_vide, rang) => {
		const value = bytes[rang] ?? 0
		return ALPHABET_BCRYPT[rang === 21 ? value & 0x30 : value & 0x3f] ?? '.'
	})
	return `$2a$${COST_BCRYPT}$${characters.join('')}`
}

/** One INSERT per table, every value a parameter cast to the type of its column. */
async function fill(executer: Run, table: TableName, lignes: readonly Line[]): Promise<void> {
	if (lignes.length === 0) return
	const columns = TABLES[table]
	const unknown = lignes.flatMap(ligne => Object.keys(ligne)).find(nom => !columns.some(c => c.nom === nom))
	if (unknown) throw new Error(`Fausse base Strapi : la table ${table} n’a pas de colonne ${unknown}.`)
	const parameters: Parameter[] = []
	const values = lignes.map(ligne => {
		const cells = columns.map(colonne => {
			const value: Value | undefined = ligne[colonne.nom]
			parameters.push(
				value === undefined || value === null ? null : typeof value === 'object' ? JSON.stringify(value) : value
			)
			return `$${parameters.length}::${CONVERSIONS[colonne.type]}`
		})
		return `(${cells.join(', ')})`
	})
	const names = columns.map(colonne => identifier(colonne.nom)).join(', ')
	await executer(`INSERT INTO ${identifier(table)} (${names}) VALUES ${values.join(', ')}`, parameters)
	// As if the rows had been created one by one: the next id follows the highest one.
	await executer(
		`SELECT setval(pg_get_serial_sequence(${literal(identifier(table))}, 'id'), (SELECT max(id) FROM ${identifier(table)}))`
	)
}

/**
 * Creates the source database from nothing, and its read-only role with this password: dropped
 * first when they exist (a role that exists is reset: no parameter of its own, its password rewritten). Each statement on its own: CREATE DATABASE cannot run inside a transaction.
 */
export async function prepareBase(
	executer: Run,
	{ base, role, motDePasse }: SourceBase & { motDePasse: string }
): Promise<void> {
	requireNames({ base, role })
	if (!PASSWORD_SQL.test(motDePasse))
		throw new Error('Fausse base Strapi : le mot de passe du rôle s’écrit en lettres, chiffres et « - ».')
	await executer(`DROP DATABASE IF EXISTS ${identifier(base)} WITH (FORCE)`)
	await executer(`CREATE DATABASE ${identifier(base)}`)
	const roles = await executer('SELECT 1 AS present FROM pg_roles WHERE rolname = $1', [role])
	await executer(
		`${roles.length > 0 ? 'ALTER' : 'CREATE'} ROLE ${identifier(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${literal(motDePasse)}`
	)
	// What the role set for itself in an earlier life (its parameters, outside any database) is wiped:
	// a role that already existed is made again from nothing, as the database is.
	await executer(`ALTER ROLE ${identifier(role)} RESET ALL`)
	await executer(`REVOKE ALL ON DATABASE ${identifier(base)} FROM PUBLIC`)
	await executer(`GRANT CONNECT ON DATABASE ${identifier(base)} TO ${identifier(role)}`)
	// A second lock: every transaction of the role starts read-only.
	await executer(
		`ALTER ROLE ${identifier(role)} IN DATABASE ${identifier(base)} SET default_transaction_read_only = on`
	)
}

/**
 * Fills the source database: tables, rows, bcrypt hashes, and the grants of the read-only role.
 * Runs in the source database, inside one transaction the caller opens and commits.
 */
export async function fillBase(executer: Run, definition: SourceDefinition, role: string): Promise<void> {
	if (!NAME_SQL.test(role)) throw new Error('Fausse base Strapi : un rôle s’écrit en minuscules, chiffres et « _ ».')
	for (const table of TABLE_NAMES) await executer(tableCreation(table))
	for (const table of TABLE_NAMES) await fill(executer, table, definition.lignes[table])
	// bcrypt by pgcrypto, with a fixed salt per account: the hash is written by PostgreSQL and read
	// by nobody here. pgcrypto lives in a schema of its own, dropped once the hashes are written:
	// the source keeps the tables of Strapi and nothing else.
	await executer('CREATE SCHEMA fabrique')
	await executer('CREATE EXTENSION pgcrypto SCHEMA fabrique')
	for (const [id, accountPassword] of definition.motsDePasse)
		await executer('UPDATE up_users SET password = fabrique.crypt($1, $2) WHERE id = $3', [
			accountPassword,
			saltBcrypt(id),
			id,
		])
	await executer('DROP SCHEMA fabrique CASCADE')
	await grantReadOnly(executer, role)
}

/**
 * Locks the source to its read-only role: the role may use the schema and select from its tables,
 * and cannot create a large object. Also what the rehearsal on a restored backup does (ticket 180),
 * run in the source database by its owner.
 */
export async function grantReadOnly(executer: Run, role: string): Promise<void> {
	if (!NAME_SQL.test(role)) throw new Error('Fausse base Strapi : un rôle s’écrit en minuscules, chiffres et « _ ».')
	await executer('REVOKE ALL ON SCHEMA public FROM PUBLIC')
	await executer(`GRANT USAGE ON SCHEMA public TO ${identifier(role)}`)
	await executer(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${identifier(role)}`)
	// Large objects live outside the tables: PostgreSQL lets anybody create one, and a role that lifted its
	// own read-only default could fill the source with objects the fingerprint of the tables never sees.
	// The functions that create one are taken from everybody but the owner (ticket 227).
	await executer(`REVOKE EXECUTE ON FUNCTION ${LARGE_OBJECT_FUNCTIONS.join(', ')} FROM PUBLIC`)
	await requireRevocation(executer, role)
}

/** Drops the source database and its role, when they exist. Nothing else of the server is touched. */
export async function eraseBase(executer: Run, source: SourceBase): Promise<void> {
	requireNames(source)
	await executer(`DROP DATABASE IF EXISTS ${identifier(source.base)} WITH (FORCE)`)
	await executer(`DROP ROLE IF EXISTS ${identifier(source.role)}`)
}

/** How many rows the definition puts into the tables: what a run says it posed. */
export const definitionLines = (definition: SourceDefinition): number =>
	TABLE_NAMES.reduce((total, table) => total + definition.lignes[table].length, 0)
