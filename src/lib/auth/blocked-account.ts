import {
	APIError,
	type CollectionAfterChangeHook,
	type CollectionBeforeChangeHook,
	type CollectionBeforeLoginHook,
} from 'payload'
import { messageErreur } from './errors'
import { journaliser } from './auth-log'

/**
 * The blocked account (ticket 089, plan 01 §6.1, `pros.blocked`): an admin blocks a makeup artist,
 * and from then on she cannot sign in; the sessions she had open are closed; unblocking gives the
 * access back. Only an admin changes the flag (the field access of `pros`).
 *
 * - The refusal comes after the password has been checked (Payload's `beforeLogin` runs only once
 *   it is right): "this account is blocked" is told to someone who holds the password, never to
 *   someone who guesses an address. A wrong password on a blocked account gets the generic answer,
 *   the same as for an account that does not exist.
 * - Blocking empties the `sessions` of the account in the same write: every token already issued
 *   is refused from then on, on every device, like a sign-out of all devices.
 * - Each change of the flag leaves one row in the authentication journal (kinds `block` and
 *   `unblock`); a refused sign-in leaves a `sign-in` row with the code `compte-bloque`.
 *
 * No `next` import: the collection, the scripts and the tests load this file too.
 */

/** The refusal of a blocked account that gave the right password. 403, in French, public. */
export class CompteBloque extends APIError {
	constructor() {
		super(messageErreur('compte-bloque'), 403, null, true)
		this.name = 'CompteBloque'
	}
}

/** Turns a blocked account away once its password is right. */
export const refuserUnCompteBloque: CollectionBeforeLoginHook = ({ user }) => {
	if ((user as { blocked?: boolean | null }).blocked === true) throw new CompteBloque()
	return user
}

const estBloque = (doc: { blocked?: boolean | null } | undefined): boolean => doc?.blocked === true

/** Blocking an account closes its sessions: the write that sets the flag also empties them. */
export const fermerLesSessionsAuBlocage: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
	if (operation !== 'update' || data.blocked !== true || estBloque(originalDoc)) return data
	return { ...data, sessions: [] }
}

/** One journal row when the flag changes (an account created blocked counts as blocked). */
export const noterLeBlocage: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
	const avant = operation === 'create' ? false : estBloque(previousDoc)
	const apres = estBloque(doc)
	if (avant !== apres) await journaliser(req.payload, { type: apres ? 'block' : 'unblock', code: 'ok' })
	return doc
}
