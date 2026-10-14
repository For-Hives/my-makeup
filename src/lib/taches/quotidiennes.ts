import type { Payload } from 'payload'
import { COLLECTION_JOURNAL, seuilDePurge } from '../auth/journal'
import { purgeDesComptesNonConfirmes } from './comptes-non-confirmes'

/**
 * The daily tasks of the application (ticket 077): the purges that keep a retention promise, one
 * after the other, once a day. The purge of the authentication journal is the first; the next
 * purges (the contact messages, the accounts never confirmed) add their entry to
 * `TACHES_QUOTIDIENNES` and nothing else.
 *
 * A task is idempotent: it removes what is past its date and stops there, so that running it twice,
 * or on two instances, does the same as running it once. It receives the clock, so a test plays any
 * day. It reports a number of rows, never a row.
 *
 * Who starts them: `demarrerLesTachesQuotidiennes` (./planificateur.ts), from the server only.
 * No `next` import: the scripts and the tests load this file too.
 */

export interface TacheQuotidienne {
	/** A short name, written in the log. */
	nom: string
	/** Does the work for the day `maintenant`; gives the number of rows it removed. */
	executer: (payload: Payload, maintenant: Date) => Promise<number>
}

/** Removes the rows of the authentication journal older than 90 days. */
export const purgeDuJournalDAuthentification: TacheQuotidienne = {
	nom: 'purge-journal-authentification',
	executer: async (payload, maintenant) => {
		const { docs } = await payload.delete({
			collection: COLLECTION_JOURNAL,
			depth: 0,
			overrideAccess: true,
			select: { type: true },
			where: { date: { less_than: seuilDePurge(maintenant).toISOString() } },
		})
		return docs.length
	},
}

/** Every daily task, in the order they run. A new purge is added here. */
export const TACHES_QUOTIDIENNES: readonly TacheQuotidienne[] = [
	purgeDuJournalDAuthentification,
	purgeDesComptesNonConfirmes,
]

export type ResultatDeTache = { nom: string; supprimes: number } | { nom: string; echec: true }

/**
 * Runs the tasks one after the other. A task that fails is logged (its name, never its error: it
 * may quote a row) and the next one runs anyway.
 */
export async function lancerLesTachesQuotidiennes(
	payload: Payload,
	maintenant: Date = new Date(),
	taches: readonly TacheQuotidienne[] = TACHES_QUOTIDIENNES
): Promise<ResultatDeTache[]> {
	const resultats: ResultatDeTache[] = []
	for (const tache of taches) {
		try {
			const supprimes = await tache.executer(payload, maintenant)
			payload.logger.info({ msg: `Tâche quotidienne ${tache.nom} : ${supprimes} ligne(s) supprimée(s).` })
			resultats.push({ nom: tache.nom, supprimes })
		} catch {
			payload.logger.error({ msg: `Tâche quotidienne ${tache.nom} : échec.` })
			resultats.push({ nom: tache.nom, echec: true })
		}
	}
	return resultats
}
