'use server'

import { cookies, headers } from 'next/headers'
import { deleteMyAccount } from '@/lib/dashboard/delete-account'
import { DELETION_MESSAGES, type DeletionResult } from '@/lib/dashboard/deletion-confirmation'
import { requestUser } from '@/lib/dashboard/request'

/**
 * Deletes the account of the signed-in makeup artist (ticket 141), once she has retyped her
 * password or her address. An action is a public endpoint: the session is read again here, the
 * origin is checked against the origins Payload trusts, and the account deleted is the one of the
 * session, never one named by the request.
 *
 * On success the session cookie is cleared (the session itself went with the account) and the form
 * sends the browser to the home page. It gives back a message in French otherwise, and nothing was
 * deleted.
 */
export async function deleteMyAccountAction(saisie: unknown): Promise<DeletionResult> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: DELETION_MESSAGES.session, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const requestHeaders = await headers()
	const origin = requestHeaders.get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: DELETION_MESSAGES.echec }

	const result = await deleteMyAccount({ payload, compte: user, headers: requestHeaders, saisie })
	if (result.ok) {
		const auth = payload.collections.pros.config.auth
		;(await cookies()).delete({ name: `${payload.config.cookiePrefix}-token`, path: '/', domain: auth.cookies.domain })
	}
	return result
}
