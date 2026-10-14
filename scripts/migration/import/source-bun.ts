/**
 * The source of the import, opened with the PostgreSQL client of bun: the command of the import
 * and the tests on the bench. Read-only twice over: the session starts every transaction
 * read-only, and each reading is a read-only transaction of its own. The role that opens it
 * should be read-only too (docs/migration/IMPORT.md).
 */

import { SQL } from 'bun'
import type { Requete, Source } from './source'

/** Opens the source at this address. The caller closes it (`await source.fermer()`). */
export function ouvrirLaSourceBun(adresse: string): Source {
	const sql = new SQL({ url: adresse, max: 1, connection: { default_transaction_read_only: 'on' } })
	return {
		lire: travail =>
			sql.begin('isolation level repeatable read read only', transaction => {
				const requete: Requete = async (texte, parametres = []) => [
					...(await transaction.unsafe(texte, [...parametres])),
				]
				return travail(requete)
			}),
		fermer: () => sql.close(),
	}
}
