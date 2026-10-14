/**
 * The guarded reset of the pre-production (ticket 027, docs/preprod.md), and the check the reset
 * and the start import both make before anything else: the database is the one of the
 * pre-production.
 *
 * - **Before the migrations.** The reset runs when Payload connects to its database, before it
 *   plays its migrations (./au-demarrage.ts wraps the `connect` of the adapter). Payload stops the
 *   process when a migration fails: a migration that cannot apply to the old database, such as the
 *   `init` of ticket 049, would otherwise stop it before anything could empty that database.
 * - **Once per token.** The token is written on the new schema, in the same transaction that drops
 *   and recreates it: a start that finds it there empties nothing.
 * - **The database of the pre-production only.** The environment already says the process is the
 *   pre-production (src/lib/env.ts); the database itself must also be its own,
 *   `mymakeup_preprod` (ticket 011). A misconfigured address is refused before anything is read.
 *
 * Only SQL on a client given by the caller: nothing here loads Payload.
 */

import { type BaseDeLaSource, type Executer, effacerLaBase } from '../../tests/outils/source-strapi/creation'

/** The task was asked to run elsewhere than on the pre-production: nothing was touched. */
export class PreprodRefusee extends Error {
	override readonly name = 'PreprodRefusee'
}

/** The database of the pre-production on its server, as Coolify created it (ticket 011). */
export const BASE_DE_LA_PREPROD = 'mymakeup_preprod'

/** Where the fake source lives on the server of the pre-production: a database of its own, beside the one of Payload. */
export const SOURCE_DE_LA_PREPROD: BaseDeLaSource = { base: 'strapi_source_preprod', role: 'lecture_strapi_preprod' }

/** Written on the schema of the database once a reset is done, followed by its token. */
export const MARQUE_DE_REMISE = 'my-makeup préprod, remise à zéro : '

/** The schema of Payload, the one a reset empties. */
const SCHEMA = 'public'

/** What a pool or a client of `pg` offers: one query, its rows. */
export interface ClientSql {
	query(texte: string, parametres?: unknown[]): Promise<{ rows: unknown[] }>
}

/** Runs the statements of tests/outils/source-strapi/creation.ts on a pool or a client of `pg`. */
export const executerSur =
	(client: ClientSql): Executer =>
	async (texte, parametres) =>
		(await client.query(texte, parametres === undefined ? undefined : [...parametres])).rows

const litteral = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

/**
 * Refuses, before anything is read, unless the connection is on the database of the
 * pre-production. `attendue` is that database; a test names the one of the bench.
 */
export async function exigerLaBaseDeLaPreprod(executer: Executer, attendue: string): Promise<void> {
	const [ligne] = (await executer('SELECT current_database() AS base')) as { base?: unknown }[]
	if (ligne?.base !== attendue)
		throw new PreprodRefusee(
			`Refusé : la base de DATABASE_URI n’est pas celle de la préprod (${attendue}). Rien n’est lu ni écrit.`
		)
}

export interface DemandeDeRemise {
	/** The token of PREPROD_REMISE_A_ZERO, as src/lib/env.ts checked it. */
	jeton: string
	/** How many migrations Payload plays right after, on the empty schema. */
	migrations: number
	/** Receives each line of the log. */
	journal: (ligne: string) => void
	/** The database the reset accepts to empty: the one of the pre-production, unless a test names the bench. */
	base?: string
	/** The fake source dropped with it: the one of the pre-production, unless a test names the bench. */
	source?: BaseDeLaSource
}

/**
 * Empties the database of Payload and drops the fake source, once per token. `executer` runs on
 * the database of Payload, as its owner, outside of any transaction: dropping a database cannot
 * run inside one. Gives true when the database was emptied: Payload then plays its migrations on
 * an empty schema.
 */
export async function remettreAZero(executer: Executer, demande: DemandeDeRemise): Promise<boolean> {
	const { jeton, migrations, journal, base = BASE_DE_LA_PREPROD, source = SOURCE_DE_LA_PREPROD } = demande
	await exigerLaBaseDeLaPreprod(executer, base)

	const marque = `${MARQUE_DE_REMISE}${jeton}`
	const [ligne] = (await executer('SELECT obj_description(to_regnamespace($1), $2) AS marque', [
		SCHEMA,
		'pg_namespace',
	])) as { marque?: unknown }[]
	if (ligne?.marque === marque) {
		journal(`Remise à zéro « ${jeton} » déjà faite : rien n’est effacé.`)
		return false
	}
	// Without its migrations, the application could not rebuild the tables it is about to drop.
	if (migrations === 0)
		throw new PreprodRefusee('Remise à zéro refusée : l’application n’a aucune migration pour reconstruire la base.')

	journal(`Remise à zéro « ${jeton} » : la base et la fausse source Strapi sont effacées, avant les migrations.`)
	await effacerLaBase(executer, source)
	// Several statements in one query run in one transaction: the schema is dropped and marked
	// together, or not at all.
	await executer(
		`DROP SCHEMA ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}; COMMENT ON SCHEMA ${SCHEMA} IS ${litteral(marque)}`
	)
	return true
}
