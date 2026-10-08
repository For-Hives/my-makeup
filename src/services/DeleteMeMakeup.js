import { authenticatedFetch } from './api'

const MESSAGE_ECHEC =
	"Ton compte n'a pas été supprimé : une erreur est survenue, réessaie dans quelques minutes."

/**
 * DELETE /api/me-makeup: deletes the profile and the account (UI-05).
 * Awaited by DangerZone, which signs out only when `ok` is true.
 * @param {object} authSession - NextAuth session, for its JWT
 * @returns {Promise<{ok: boolean, message?: string, sessionExpiree?: boolean}>}
 */
export async function DeleteMeMakeup(authSession) {
	let response
	try {
		response = await authenticatedFetch(
			`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
			authSession,
			{ method: 'DELETE' }
		)
	} catch {
		return { ok: false, message: MESSAGE_ECHEC }
	}

	if (response === null) {
		// session expired: the visitor is already sent to the sign-in page
		return { ok: false, sessionExpiree: true }
	}
	return response.ok ? { ok: true } : { ok: false, message: MESSAGE_ECHEC }
}
