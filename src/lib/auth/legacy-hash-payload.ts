import type { CollectionAfterChangeHook, CollectionBeforeValidateHook } from 'payload'

/**
 * A new password ends the old site's hash (ticket 087; plans 01 §2.3).
 *
 * `pros.legacyBcrypt` lets an account of the old site sign in with its usual password until a
 * password of Payload's own exists. Once one is chosen another way (an admin sets it, the reset
 * link, a Google account that defines one), the old hash must go: left in place, the old password
 * would still open the account and would then overwrite the password the person just chose.
 *
 * - `clearLegacyHashOnRenewal` (before validation) notes an update that carries a
 *   password, and, for Payload's reset, which writes the hash and the salt of the whole row itself
 *   and runs only this kind of hook, erases the old hash in the row it is about to write.
 * - `clearLegacyHashAfterPassword` (after a change): erases the old hash of the noted
 *   update. Written straight to the database, because the field is closed to every API (an admin's
 *   request cannot write it, so a hook through the Local API could not either).
 *
 * The creation is left alone: the import creates the account with its old hash and a random password.
 */

const PASSWORD_KEY = 'motDePasseChoisiPourEffacerLeHashHerite'

export const clearLegacyHashAfterPassword: CollectionAfterChangeHook = async ({ collection, doc, operation, req }) => {
	if (operation !== 'update' || req.context[PASSWORD_KEY] !== true) return doc
	delete req.context[PASSWORD_KEY]
	await req.payload.db.updateOne({
		collection: collection.slug,
		id: doc.id,
		data: { legacyBcrypt: null },
		req,
		returning: false,
	})
	return doc
}

export const clearLegacyHashOnRenewal: CollectionBeforeValidateHook = ({ data, operation, originalDoc, req }) => {
	if (operation !== 'update' || !data) return data
	const written = data as { password?: unknown; salt?: unknown; legacyBcrypt?: unknown }
	// An update that carries a password: Payload hashes it later and drops it from `data`, so it is noted here
	// for the hook after the change. (In an update, `data` also carries the row's own salt: not a signal.)
	if (typeof written.password === 'string') req.context[PASSWORD_KEY] = true
	// Payload's reset: no original document, the whole row with its new salt and hash.
	else if (!originalDoc && typeof written.salt === 'string') written.legacyBcrypt = null
	return data
}
