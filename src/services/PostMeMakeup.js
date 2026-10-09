import { profilCree } from '@/lib/sauvegarde-profil'
import { authenticatedFetch } from './api'

/**
 * POST /api/me-makeup: creates the profile of the signed-in account, once,
 * at the onboarding (UI-05). Awaited: the name step only shows up once the
 * profile exists, so its PATCH can never arrive first. A profile that
 * already exists counts as created, with `existant`: it is not a new sign-up.
 * @param {object} authSession - NextAuth session, for its JWT
 * @returns {Promise<{ok: boolean, existant?: true, sessionExpiree?: boolean}>}
 */
export async function postMeMakeup(authSession) {
	let response
	try {
		response = await authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, authSession, {
			method: 'POST',
			body: JSON.stringify({}),
		})
	} catch {
		return { ok: false }
	}
	if (response === null) return { ok: false, sessionExpiree: true }

	let corps = null
	try {
		corps = await response.json()
	} catch {
		// no JSON body: the status decides
	}
	if (!profilCree(response.status, corps)) return { ok: false }
	// 400 « already exists »: the profile was made before this visit
	return response.ok ? { ok: true } : { ok: true, existant: true }
}
