/**
 * Where the import writes: the database of Payload that `DATABASE_URI` names. A database of this
 * machine is the usual target (the bench, the development database, a restored copy). Any other
 * one is refused unless the person says so with `--cible-distante`: the check runs before the
 * configuration of Payload is even loaded, so nothing connects to it and nothing is written.
 *
 * The import writes documents, never the schema: the tables are the application's, built by its
 * migrations when it starts. Payload is started without its two changes of schema at connection,
 * and a target without the tables of the v3 is refused.
 */

import type { Payload, SanitizedConfig } from 'payload'
import { isLocalDatabase } from '../../../src/lib/env'
import type { CollectionImportee } from './moteur'

/** The import does not start: the message says why and what to do, never a value. */
export class ImportRefuse extends Error {
	override readonly name = 'ImportRefuse'
}

export type GenreDeCible = 'locale' | 'distante'

/** The flag that lets the import write into a database that is not on this machine. */
export const DRAPEAU_CIBLE_DISTANTE = '--cible-distante'

/** The flag that names the database the target must be (`current_database()`): required with `--cible-distante`. */
export const DRAPEAU_BASE_ATTENDUE = '--base-attendue'

/** The flag that lets the import run on a target the v3 already uses (./garde-bascule.ts, ticket 227). */
export const DRAPEAU_CIBLE_EN_SERVICE = '--cible-en-service'

/**
 * Which kind of database the import is about to write into, or `ImportRefuse` when it must not:
 * no database named, or a database elsewhere than on this machine without the flag.
 */
export function verifierLaCible(
	databaseUri: string | undefined,
	{ cibleDistante, baseAttendue }: { cibleDistante: boolean; baseAttendue?: string | undefined }
): GenreDeCible {
	// A remote target is named twice, by its address and by its database: an address that points at
	// the database of another site by mistake is caught by `verifierLaBaseAttendue` (ticket 233, L9).
	if (cibleDistante && !baseAttendue)
		throw new ImportRefuse(
			`${DRAPEAU_CIBLE_DISTANTE} exige ${DRAPEAU_BASE_ATTENDUE} <nom> : le nom que la base de la cible doit donner. Rien n’est écrit.`
		)
	if (!databaseUri) throw new ImportRefuse('DATABASE_URI manque : l’import ne sait pas où écrire. Rien n’est écrit.')
	if (isLocalDatabase(databaseUri)) return 'locale'
	if (cibleDistante) return 'distante'
	throw new ImportRefuse(
		[
			'DATABASE_URI ne désigne pas une base de ce poste : l’import refuse d’y écrire, et rien n’est écrit.',
			`Pour écrire dans une base distante, la commande le dit elle-même : ${DRAPEAU_CIBLE_DISTANTE}.`,
		].join(' ')
	)
}

/**
 * Refuses, once Payload is connected and before anything is read or written, a target whose
 * database is not the one `--base-attendue` names (ticket 233, L9). The refusal names the expected
 * database only: what the target really is stays unsaid.
 */
export async function verifierLaBaseAttendue(payload: Payload, attendue: string): Promise<void> {
	const { rows } = await payload.db.pool.query<{ base: string }>('SELECT current_database() AS base')
	if (rows[0]?.base === attendue) return
	throw new ImportRefuse(
		`La base de DATABASE_URI n’est pas « ${attendue} » (${DRAPEAU_BASE_ATTENDUE}) : l’import refuse d’y lire ou d’y écrire. Rien n’est écrit.`
	)
}

/**
 * The configuration of Payload for the import: Payload connects to the target without changing
 * its schema. Two changes happen otherwise when it connects:
 *
 * - out of production, on a database of this machine, the push of the schema of the code, which
 *   may drop what it does not know and leaves its mark in `payload_migrations`: Payload's own
 *   switch, `PAYLOAD_MIGRATING`, turns it off. It is set here, in the environment of this
 *   process, where Payload reads it when it connects;
 * - in production, the migrations not yet played: they are taken out of the adapter.
 */
export function configurationSansChangementDeSchema(config: SanitizedConfig): SanitizedConfig {
	process.env.PAYLOAD_MIGRATING = 'true'
	const { init } = config.db
	return {
		...config,
		db: { ...config.db, init: options => Object.assign(init(options), { prodMigrations: undefined }) },
	}
}

/**
 * The collections the import writes, in the order it writes them (plan 01 §5, P4). Their tables
 * keep the name Payload gives them from their slug. A database where all of them are empty is an empty one.
 */
export const COLLECTIONS_ECRITES: readonly CollectionImportee[] = ['pros', 'media', 'profiles', 'articles', 'talents']

/**
 * Refuses a target that does not hold the tables the import writes: the import creates none
 * (`configurationSansChangementDeSchema`). Run once Payload is connected, before anything is read.
 */
export async function verifierLeSchemaDeLaCible(payload: Payload): Promise<void> {
	const tables = COLLECTIONS_ECRITES.map(collection => payload.db.tableNameMap.get(collection) ?? collection)
	const { rows } = await payload.db.pool.query<{ table: string }>(
		'SELECT nom AS table FROM unnest($1::text[]) AS nom WHERE to_regclass(quote_ident(nom)) IS NULL ORDER BY nom',
		[tables]
	)
	if (rows.length === 0) return
	const manquantes = rows.map(({ table }) => `« ${table} »`).join(', ')
	throw new ImportRefuse(
		[
			`La base de DATABASE_URI n’a pas le schéma de la v3 : ${rows.length > 1 ? 'il manque les tables' : 'il manque la table'} ${manquantes}.`,
			'L’import ne crée ni ne change aucune table : l’application les crée par ses migrations quand elle démarre sur cette base',
			'(sur le banc : bun run banc:prepare). Rien n’est écrit.',
		].join(' ')
	)
}
