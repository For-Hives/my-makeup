import type { CollectionBeforeChangeHook, Payload } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOrEditor } from './access'

/** The slug of the collection Payload keeps its editing locks in. */
export const LOCKS_COLLECTION = 'payload-locked-documents'

/**
 * A lock is always in the name of the account that sends the request (ticket 094). Whatever `user`
 * the body says, the session wins: no account takes a lock, or a take-over, in the name of another
 * admin. The take-over of the admin panel is a change of `user` to the account that takes over, so
 * it still goes through. Without a session (the Local API of the server), the data stays as given.
 */
export const lockInSessionName: CollectionBeforeChangeHook = ({ data, req: { user } }) =>
	user ? { ...data, user: { relationTo: user.collection, value: user.id } } : data

/**
 * Payload's collection of document locks is open to any logged-in account by default: a makeup
 * artist listed the locks, put one in the name of an admin or removed one. It is reserved here to
 * the accounts of the admin panel, `admin` and `editor` (the panel reads the locks as the
 * account, rules active), and every lock carries the account of the session.
 *
 * Payload builds this collection itself, after the plugins: it is changed once Payload is built
 * (`onInit`, before any request), like `boundPayloadCollections`.
 */
export function reserveLocksToAdmins(payload: Pick<Payload, 'collections'>): void {
	const locks = payload.collections[LOCKS_COLLECTION]
	if (!locks) return
	const { config } = locks
	config.access = {
		...config.access,
		create: adminOrEditor,
		delete: adminOrEditor,
		read: adminOrEditor,
		update: adminOrEditor,
	}
	if (!config.hooks.beforeChange.includes(lockInSessionName)) config.hooks.beforeChange.push(lockInSessionName)
}
