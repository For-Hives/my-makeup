import { type Endpoint, Forbidden } from 'payload'

/**
 * Payload gives every account collection a « first account » route, which creates an account
 * without access control while the collection is empty. It is closed on both account collections
 * (tickets 018 and 094): no anonymous request, and no session of the other collection, creates an
 * account through REST, even on an empty database.
 *
 * - `pros`: a makeup artist never opens the admin panel, whose first screen the route serves.
 * - `admins`: the first admin is created by the operating procedure (`bun run admin:create`,
 *   README), which reads the password at the keyboard. The screen of the first account stays
 *   closed to the public, who would otherwise race the owner to a new database.
 *
 * A collection's own routes come before Payload's.
 */
export const firstClosedAccount: Endpoint = {
	path: '/first-register',
	method: 'post',
	handler: req => {
		throw new Forbidden(req.t)
	},
}
