'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { authLog } from '@/lib/auth/auth-log'
import { PAGE_AFTER_SIGN_OUT } from '@/lib/auth/return-to'
import { closeSession } from '@/lib/auth/sign-out'

/**
 * The sign-out of the space (ticket 078). Both actions remove the session from the database first
 * (`closeSession`), clear the cookie whatever happened, and send the visitor to a page that
 * exists and answers without a session: the home page.
 *
 * The origin is checked as in the sign-in (Next refuses a Server Action from another origin before
 * this code runs; the rule is written down here as well).
 */
async function leave(toutes: boolean): Promise<never> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	if (requestOrigin === null || payload.config.csrf.includes(requestOrigin)) {
		await closeSession({ payload, headers: requestHeaders, toutes, journal: authLog(payload) })
		// Clear the cookie even when nothing could be removed: a cookie that no longer opens anything is no use.
		const auth = payload.collections.pros.config.auth
		;(await cookies()).delete({ name: `${payload.config.cookiePrefix}-token`, path: '/', domain: auth.cookies.domain })
	}
	// `redirect` throws: it stays outside any try/catch.
	redirect(PAGE_AFTER_SIGN_OUT)
}

/** « Me déconnecter » : this device only. */
export async function signOut(): Promise<never> {
	return leave(false)
}

/**
 * « Me déconnecter de tous les appareils » : every session of the account. The form carries a
 * confirmation the page asked for; without it nothing is closed and the visitor stays where she is.
 */
export async function signOutEverywhere(formulaire: FormData): Promise<never> {
	if (formulaire.get('confirmation') !== 'oui') redirect('/auth/profil')
	return leave(true)
}
