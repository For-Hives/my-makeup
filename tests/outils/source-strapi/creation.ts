/**
 * How the fake Strapi source is created, statement by statement, whatever the client that runs
 * them: bun on the bench (tests/outils/source-strapi.ts), `pg` in the pre-production, where the
 * application poses the same source next to its database when it starts (src/preprod, ticket 027).
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
import type { DefinitionDeLaSource, Ligne, Valeur } from './donnees'
import { CONVERSIONS, creationDeTable, identifiant, NOMS_DES_TABLES, type NomDeTable, TABLES } from './schema'

/** A value of a parameter, as both clients send it. */
export type Parametre = string | number | boolean | null

/** Runs one SQL statement, one command, and gives its rows. */
export type Executer = (texte: string, parametres?: readonly Parametre[]) => Promise<readonly unknown[]>

/** Where the source lives on its server: its database, and the role that can only read it. */
export interface BaseDeLaSource {
	base: string
	role: string
}

/** The cost of the bcrypt hashes, the one of every real hash (`$2a$10$`, plans/01 §2.4). */
const COUT_BCRYPT = 10

/** The alphabet of bcrypt, for its salt. */
const ALPHABET_BCRYPT = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** A database, a role, a password: written into SQL statements, so only plain characters. */
const NOM_SQL = /^[a-z][a-z0-9_]{0,62}$/
const MOT_DE_PASSE_SQL = /^[A-Za-z0-9-]{8,100}$/

const litteral = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

function exigerDesNoms({ base, role }: BaseDeLaSource): void {
	if (!NOM_SQL.test(base) || !NOM_SQL.test(role))
		throw new Error('Fausse base Strapi : une base et un rôle s’écrivent en minuscules, chiffres et « _ ».')
}

/** The functions of PostgreSQL that create a large object, server side (`lo_create`) or by the client library (`lo_creat`, `lo_import`). */
const FONCTIONS_DE_GRANDS_OBJETS = [
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
export async function exigerLaRevocation(executer: Executer, role: string): Promise<void> {
	const encore: string[] = []
	for (const fonction of FONCTIONS_DE_GRANDS_OBJETS) {
		const [ligne] = (await executer("SELECT has_function_privilege($1::name, $2::text, 'EXECUTE') AS permis", [
			role,
			fonction,
		])) as { permis?: boolean }[]
		if (ligne?.permis !== false) encore.push(fonction)
	}
	if (encore.length > 0)
		throw new Error(
			`Fausse base Strapi : le rôle « ${role} » peut encore créer des grands objets (${encore.join(', ')}). Le retrait de ce droit demande un super-utilisateur : crée la base avec un compte qui l’est.`
		)
}

/** A salt of bcrypt drawn from the id of the account: the same account always gets the same hash. */
export function selBcrypt(id: number): string {
	const octets = createHash('sha256').update(`sel-factice-${id}`).digest()
	// 16 bytes of salt in 22 characters of 6 bits: the last character carries the last 2 bits only,
	// its 4 low bits stay at 0, as bcrypt writes them.
	const caracteres = Array.from({ length: 22 }, (_vide, rang) => {
		const valeur = octets[rang] ?? 0
		return ALPHABET_BCRYPT[rang === 21 ? valeur & 0x30 : valeur & 0x3f] ?? '.'
	})
	return `$2a$${COUT_BCRYPT}$${caracteres.join('')}`
}

/** One INSERT per table, every value a parameter cast to the type of its column. */
async function remplir(executer: Executer, table: NomDeTable, lignes: readonly Ligne[]): Promise<void> {
	if (lignes.length === 0) return
	const colonnes = TABLES[table]
	const inconnue = lignes.flatMap(ligne => Object.keys(ligne)).find(nom => !colonnes.some(c => c.nom === nom))
	if (inconnue) throw new Error(`Fausse base Strapi : la table ${table} n’a pas de colonne ${inconnue}.`)
	const parametres: Parametre[] = []
	const valeurs = lignes.map(ligne => {
		const cellules = colonnes.map(colonne => {
			const valeur: Valeur | undefined = ligne[colonne.nom]
			parametres.push(
				valeur === undefined || valeur === null ? null : typeof valeur === 'object' ? JSON.stringify(valeur) : valeur
			)
			return `$${parametres.length}::${CONVERSIONS[colonne.type]}`
		})
		return `(${cellules.join(', ')})`
	})
	const noms = colonnes.map(colonne => identifiant(colonne.nom)).join(', ')
	await executer(`INSERT INTO ${identifiant(table)} (${noms}) VALUES ${valeurs.join(', ')}`, parametres)
	// As if the rows had been created one by one: the next id follows the highest one.
	await executer(
		`SELECT setval(pg_get_serial_sequence(${litteral(identifiant(table))}, 'id'), (SELECT max(id) FROM ${identifiant(table)}))`
	)
}

/**
 * Creates the source database from nothing, and its read-only role with this password: dropped
 * first when they exist (a role that exists is reset: no parameter of its own, its password rewritten). Each statement on its own: CREATE DATABASE cannot run inside a transaction.
 */
export async function preparerLaBase(
	executer: Executer,
	{ base, role, motDePasse }: BaseDeLaSource & { motDePasse: string }
): Promise<void> {
	exigerDesNoms({ base, role })
	if (!MOT_DE_PASSE_SQL.test(motDePasse))
		throw new Error('Fausse base Strapi : le mot de passe du rôle s’écrit en lettres, chiffres et « - ».')
	await executer(`DROP DATABASE IF EXISTS ${identifiant(base)} WITH (FORCE)`)
	await executer(`CREATE DATABASE ${identifiant(base)}`)
	const roles = await executer('SELECT 1 AS present FROM pg_roles WHERE rolname = $1', [role])
	await executer(
		`${roles.length > 0 ? 'ALTER' : 'CREATE'} ROLE ${identifiant(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${litteral(motDePasse)}`
	)
	// What the role set for itself in an earlier life (its parameters, outside any database) is wiped:
	// a role that already existed is made again from nothing, as the database is.
	await executer(`ALTER ROLE ${identifiant(role)} RESET ALL`)
	await executer(`REVOKE ALL ON DATABASE ${identifiant(base)} FROM PUBLIC`)
	await executer(`GRANT CONNECT ON DATABASE ${identifiant(base)} TO ${identifiant(role)}`)
	// A second lock: every transaction of the role starts read-only.
	await executer(
		`ALTER ROLE ${identifiant(role)} IN DATABASE ${identifiant(base)} SET default_transaction_read_only = on`
	)
}

/**
 * Fills the source database: tables, rows, bcrypt hashes, and the grants of the read-only role.
 * Runs in the source database, inside one transaction the caller opens and commits.
 */
export async function remplirLaBase(executer: Executer, definition: DefinitionDeLaSource, role: string): Promise<void> {
	if (!NOM_SQL.test(role)) throw new Error('Fausse base Strapi : un rôle s’écrit en minuscules, chiffres et « _ ».')
	for (const table of NOMS_DES_TABLES) await executer(creationDeTable(table))
	for (const table of NOMS_DES_TABLES) await remplir(executer, table, definition.lignes[table])
	// bcrypt by pgcrypto, with a fixed salt per account: the hash is written by PostgreSQL and read
	// by nobody here. pgcrypto lives in a schema of its own, dropped once the hashes are written:
	// the source keeps the tables of Strapi and nothing else.
	await executer('CREATE SCHEMA fabrique')
	await executer('CREATE EXTENSION pgcrypto SCHEMA fabrique')
	for (const [id, motDePasseDuCompte] of definition.motsDePasse)
		await executer('UPDATE up_users SET password = fabrique.crypt($1, $2) WHERE id = $3', [
			motDePasseDuCompte,
			selBcrypt(id),
			id,
		])
	await executer('DROP SCHEMA fabrique CASCADE')
	await executer('REVOKE ALL ON SCHEMA public FROM PUBLIC')
	await executer(`GRANT USAGE ON SCHEMA public TO ${identifiant(role)}`)
	await executer(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${identifiant(role)}`)
	// Large objects live outside the tables: PostgreSQL lets anybody create one, and a role that lifted its
	// own read-only default could fill the source with objects the fingerprint of the tables never sees.
	// The functions that create one are taken from everybody but the owner (ticket 227).
	await executer(`REVOKE EXECUTE ON FUNCTION ${FONCTIONS_DE_GRANDS_OBJETS.join(', ')} FROM PUBLIC`)
	await exigerLaRevocation(executer, role)
}

/** Drops the source database and its role, when they exist. Nothing else of the server is touched. */
export async function effacerLaBase(executer: Executer, source: BaseDeLaSource): Promise<void> {
	exigerDesNoms(source)
	await executer(`DROP DATABASE IF EXISTS ${identifiant(source.base)} WITH (FORCE)`)
	await executer(`DROP ROLE IF EXISTS ${identifiant(source.role)}`)
}

/** How many rows the definition puts into the tables: what the pre-production says it posed. */
export const lignesDeLaDefinition = (definition: DefinitionDeLaSource): number =>
	NOMS_DES_TABLES.reduce((total, table) => total + definition.lignes[table].length, 0)
