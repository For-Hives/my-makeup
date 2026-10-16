/**
 * The source of the import, opened with `pg`, the PostgreSQL client of Payload's adapter: the
 * import run by the application itself, under Node, where the client of bun does not exist. Read-only twice over, as with bun (./source-bun.ts): the session
 * starts every transaction read-only, and each reading is a read-only transaction of its own, on
 * one snapshot. The role that opens it should be read-only too (docs/migration/IMPORT.md).
 *
 * The client is the one Payload's adapter carries (`payload.db.pg`): no driver of its own, and
 * the same version as the one Payload runs on.
 *
 * Both clients read the columns the import asks for the same way: integers and `count(*)::int` as
 * numbers, text as text, booleans as booleans; every timestamp is read as text (`iso`, ./source.ts).
 * A test reads the fake source of the bench through both and compares the reports.
 */

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Requete, Source } from './source'

/** The `pg` module, as Payload's adapter gives it. */
export type ClientPg = PostgresAdapter['pg']

/** Opens the source at this address. The caller closes it (`await source.fermer()`). */
export function ouvrirLaSourcePg(adresse: string, pg: ClientPg): Source {
	const pool = new pg.Pool({
		connectionString: adresse,
		max: 1,
		options: '-c default_transaction_read_only=on',
	})
	return {
		lire: async travail => {
			const client = await pool.connect()
			let fini = false
			try {
				await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
				const requete: Requete = async <Ligne extends object>(texte: string, parametres: readonly unknown[] = []) =>
					(await client.query(texte, [...parametres])).rows as Ligne[]
				const resultat = await travail(requete)
				await client.query('COMMIT')
				fini = true
				return resultat
			} finally {
				// A reading that failed ends its transaction before the connection goes back to the pool.
				if (!fini) await client.query('ROLLBACK').catch(() => undefined)
				client.release()
			}
		},
		fermer: () => pool.end(),
	}
}
