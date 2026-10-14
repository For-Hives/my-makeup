/**
 * Where the import writes: the database of Payload that `DATABASE_URI` names. A database of this
 * machine is the usual target (the bench, the development database, a restored copy). Any other
 * one is refused unless the person says so with `--cible-distante`: the check runs before the
 * configuration of Payload is even loaded, so nothing connects to it and nothing is written.
 */

import { isLocalDatabase } from '../../../src/lib/env'

/** The import does not start: the message says why and what to do, never a value. */
export class ImportRefuse extends Error {
	override readonly name = 'ImportRefuse'
}

export type GenreDeCible = 'locale' | 'distante'

/** The flag that lets the import write into a database that is not on this machine. */
export const DRAPEAU_CIBLE_DISTANTE = '--cible-distante'

/**
 * Which kind of database the import is about to write into, or `ImportRefuse` when it must not:
 * no database named, or a database elsewhere than on this machine without the flag.
 */
export function verifierLaCible(
	databaseUri: string | undefined,
	{ cibleDistante }: { cibleDistante: boolean }
): GenreDeCible {
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
