'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { fermerLaSession } from '@/lib/auth/sign-out'
import { journalDe } from '@/lib/auth/auth-log'
import { PAGE_APRES_DECONNEXION } from '@/lib/auth/return-to'

/**
 * The sign-out of the space (ticket 078). Both actions remove the session from the database first
 * (`fermerLaSession`), clear the cookie whatever happened, and send the visitor to a page that
 * exists and answers without a session: the home page.
 *
 * The origin is checked as in the sign-in (Next refuses a Server Action from another origin before
 * this code runs; the rule is written down here as well).
 */
async function sortir(toutes: boolean): Promise<never> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine === null || payload.config.csrf.includes(origine)) {
		await fermerLaSession({ payload, headers: entetes, toutes, journal: journalDe(payload) })
		// Clear the cookie even when nothing could be removed: a cookie that no longer opens anything is no use.
		const auth = payload.collections.pros.config.auth
		;(await cookies()).delete({ name: `${payload.config.cookiePrefix}-token`, path: '/', domain: auth.cookies.domain })
	}
	// `redirect` throws: it stays outside any try/catch.
	redirect(PAGE_APRES_DECONNEXION)
}

/** « Me déconnecter » : this device only. */
export async function seDeconnecter(): Promise<never> {
	return sortir(false)
}

/**
 * « Me déconnecter de tous les appareils » : every session of the account. The form carries a
 * confirmation the page asked for; without it nothing is closed and the visitor stays where she is.
 */
export async function seDeconnecterPartout(formulaire: FormData): Promise<never> {
	if (formulaire.get('confirmation') !== 'oui') redirect('/auth/profil')
	return sortir(true)
}
