import {
	APIError,
	type CollectionAfterChangeHook,
	type CollectionBeforeChangeHook,
	type CollectionBeforeLoginHook,
} from 'payload'
import { log } from './auth-log'
import { errorMessage } from './errors'

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
export class BlockedAccount extends APIError {
	constructor() {
		super(errorMessage('compte-bloque'), 403, null, true)
		this.name = 'CompteBloque'
	}
}

/** Turns a blocked account away once its password is right. */
export const refuseBlockedAccount: CollectionBeforeLoginHook = ({ user }) => {
	if ((user as { blocked?: boolean | null }).blocked === true) throw new BlockedAccount()
	return user
}

const isBlocked = (doc: { blocked?: boolean | null } | undefined): boolean => doc?.blocked === true

/** Blocking an account closes its sessions: the write that sets the flag also empties them. */
export const closeSessionsOnBlock: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
	if (operation !== 'update' || data.blocked !== true || isBlocked(originalDoc)) return data
	return { ...data, sessions: [] }
}

/** One journal row when the flag changes (an account created blocked counts as blocked). */
export const recordBlock: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
	const before = operation === 'create' ? false : isBlocked(previousDoc)
	const after = isBlocked(doc)
	if (before !== after) await log(req.payload, { type: after ? 'block' : 'unblock', code: 'ok' })
	return doc
}
