import type { Payload } from 'payload'

/**
 * The journal of the authentication events (ticket 077, plan 01 §2.3): one row for each sign-in,
 * sign-out, sign-up and email confirmation, with its kind, its outcome, how long it took and when.
 *
 * It keeps no personal data, and it cannot: a row holds a kind and an outcome taken from the two
 * closed lists below, a duration and a date. There is no field for an address, a name, an IP
 * or a token, so nothing a visitor types can reach it. A value that is not in a list is written as
 * `inconnu`, never as it came.
 *
 * Writing it never fails the event it describes: `journaliser` swallows its own errors and leaves
 * one line in the application log, with no detail.
 *
 * No `next` import: the collection, the scripts and the tests load this file too.
 */

/** What happened. */
export const TYPES_EVENEMENT = [
	'connexion',
	'deconnexion',
	'deconnexion-partout',
	'inscription',
	'confirmation',
	'renvoi',
	'mot-de-passe-oublie',
	'reinitialisation',
] as const
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number]

/**
 * How it ended. `inconnu` is what a value outside the list becomes. The sign-in codes are those of
 * `src/lib/auth/erreurs.ts`.
 */
export const CODES_EVENEMENT = [
	'ok',
	'heritee',
	'identifiants-invalides',
	'trop-de-tentatives',
	'service-indisponible',
	'email-non-confirme',
	'donnees-invalides',
	'email-deja-pris',
	'deja-confirme',
	'lien-invalide',
	'inconnu',
	'champ-piege',
] as const
export type CodeEvenement = (typeof CODES_EVENEMENT)[number]

/** How long a row is kept, in days (plan 01 §2.3). */
export const CONSERVATION_JOURNAL_JOURS = 90

export const COLLECTION_JOURNAL = 'auth-evenements'

export interface EvenementAuth {
	type: TypeEvenement
	code: CodeEvenement
	/** How long the event took, in milliseconds. */
	dureeMs?: number
}

/** The one door the code writes the journal through: a test hands it a double. */
export type Journaliser = (evenement: EvenementAuth) => Promise<void>

const estCode = (valeur: unknown): valeur is CodeEvenement => (CODES_EVENEMENT as readonly unknown[]).includes(valeur)

/**
 * The row to write: a code outside the list becomes `inconnu`, the duration is a whole number of
 * milliseconds. Nothing else is copied. A kind outside its list is refused by the collection itself
 * (a select field), and `journaliser` then writes nothing.
 */
export function ligneDeJournal(evenement: EvenementAuth, maintenant: Date = new Date()) {
	const duree = evenement.dureeMs
	return {
		type: evenement.type,
		code: estCode(evenement.code) ? evenement.code : ('inconnu' as const),
		...(typeof duree === 'number' && Number.isFinite(duree) && duree >= 0 && { dureeMs: Math.round(duree) }),
		date: maintenant.toISOString(),
	}
}

/**
 * Writes one row, outside any transaction of the event (no `req`): the sign-in holds a lock on the
 * account while it runs, and a failure here must not abort it. Never throws.
 */
export async function journaliser(
	payload: Pick<Payload, 'create' | 'logger'>,
	evenement: EvenementAuth
): Promise<void> {
	try {
		await payload.create({
			collection: COLLECTION_JOURNAL,
			data: ligneDeJournal(evenement),
			depth: 0,
			overrideAccess: true,
		})
	} catch {
		// No detail: an error of the database may quote the row.
		try {
			payload.logger.error({ msg: 'Une ligne du journal d’authentification n’a pas pu être écrite.' })
		} catch {
			// The log itself failed: nothing more to do.
		}
	}
}

/** The journal wired to a Payload instance, as `connecter` and the actions receive it. */
export const journalDe =
	(payload: Pick<Payload, 'create' | 'logger'>): Journaliser =>
	evenement =>
		journaliser(payload, evenement)

/** The date before which a row is purged, `maintenant` being the clock of the purge. */
export const seuilDePurge = (maintenant: Date): Date =>
	new Date(maintenant.getTime() - CONSERVATION_JOURNAL_JOURS * 24 * 60 * 60 * 1000)
