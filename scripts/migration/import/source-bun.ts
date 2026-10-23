/**
 * The source of the import, opened with the PostgreSQL client of bun: the command of the import
 * and the tests on the bench. Read-only twice over: the session starts every transaction
 * read-only, and each reading is a read-only transaction of its own. The role that opens it
 * should be read-only too (docs/migration/IMPORT.md).
 */

import { SQL } from 'bun'
import type { Query, Source } from './source'

/** Opens the source at this address. The caller closes it (`await source.fermer()`). */
export function openSourceBun(adresse: string): Source {
	const sql = new SQL({ url: adresse, max: 1, connection: { default_transaction_read_only: 'on' } })
	return {
		lire: travail =>
			sql.begin('isolation level repeatable read read only', transaction => {
				const query: Query = async (texte, parametres = []) => [...(await transaction.unsafe(texte, [...parametres]))]
				return travail(query)
			}),
		fermer: () => sql.close(),
	}
}
