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
export const EVENT_TYPES = [
	'sign-in',
	'sign-out',
	'sign-out-everywhere',
	'sign-up',
	'confirmation',
	'resend',
	'forgot-password',
	'password-reset',
	'block',
	'unblock',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

/**
 * How it ended. `inconnu` is what a value outside the list becomes. The sign-in codes are those of
 * `src/lib/auth/erreurs.ts`.
 */
export const EVENT_CODES = [
	'ok',
	'heritee',
	'identifiants-invalides',
	'trop-de-tentatives',
	'service-indisponible',
	'email-non-confirme',
	'compte-bloque',
	'donnees-invalides',
	'email-deja-pris',
	'deja-confirme',
	'lien-invalide',
	'email-non-verifie',
	'compte-refuse',
	'annule',
	'retour-invalide',
	'inconnu',
	'champ-piege',
] as const
export type EventCode = (typeof EVENT_CODES)[number]

/**
 * How the person proved who she is (ticket 090). Older rows have none. Closed list, like the others:
 * a value outside it is not written.
 */
export const EVENT_METHODS = ['password', 'google'] as const
export type EventMethod = (typeof EVENT_METHODS)[number]

/** How long a row is kept, in days (plan 01 §2.3). */
export const AUTH_LOG_RETENTION_DAYS = 90

export const AUTH_LOG_COLLECTION = 'auth-events'

export interface AuthEvent {
	type: EventType
	code: EventCode
	/** How long the event took, in milliseconds. */
	durationMs?: number
	/** How she signed in or up. Left out for the events that have no such thing (sign-out, confirmation). */
	method?: EventMethod
}

/** The one door the code writes the journal through: a test hands it a double. */
export type Log = (evenement: AuthEvent) => Promise<void>

const isCode = (valeur: unknown): valeur is EventCode => (EVENT_CODES as readonly unknown[]).includes(valeur)

const isMethod = (valeur: unknown): valeur is EventMethod =>
	(EVENT_METHODS as readonly unknown[]).includes(valeur)

/**
 * The row to write: a code outside the list becomes `inconnu`, the duration is a whole number of
 * milliseconds. Nothing else is copied. A kind outside its list is refused by the collection itself
 * (a select field), and `journaliser` then writes nothing.
 */
export function authLogRow(evenement: AuthEvent, maintenant: Date = new Date()) {
	const duration = evenement.durationMs
	return {
		type: evenement.type,
		code: isCode(evenement.code) ? evenement.code : ('inconnu' as const),
		...(typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 && { durationMs: Math.round(duration) }),
		...(isMethod(evenement.method) && { method: evenement.method }),
		date: maintenant.toISOString(),
	}
}

/**
 * Writes one row, outside any transaction of the event (no `req`): the sign-in holds a lock on the
 * account while it runs, and a failure here must not abort it. Never throws.
 */
export async function log(
	payload: Pick<Payload, 'create' | 'logger'>,
	evenement: AuthEvent
): Promise<void> {
	try {
		await payload.create({
			collection: AUTH_LOG_COLLECTION,
			data: authLogRow(evenement),
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
export const authLog =
	(payload: Pick<Payload, 'create' | 'logger'>): Log =>
	evenement =>
		log(payload, evenement)

/** The date before which a row is purged, `maintenant` being the clock of the purge. */
export const purgeThreshold = (maintenant: Date): Date =>
	new Date(maintenant.getTime() - AUTH_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
