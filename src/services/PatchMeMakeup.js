import { toast } from 'react-toastify'
import { authenticatedFetch } from './api'
import { track } from '@/lib/analytics'
import {
	MESSAGE_SAUVEGARDE_OK,
	messageEchecSauvegarde,
} from '@/lib/sauvegarde-profil'

// one toast of each kind at a time; a success replaces the failure before it
const TOAST_OK = 'profile-save-ok'
const TOAST_ECHEC = 'profile-save-echec'

async function lireJson(response) {
	try {
		return await response.json()
	} catch {
		return null
	}
}

/**
 * PATCH /api/me-makeup: saves fields of the signed-in artist's profile.
 *
 * Always awaited by the modals (UI-01): they change what the page shows and
 * close only when `ok` is true, and show `message` otherwise. The outcome is
 * also shown in a toast and counted (`profile_save`).
 *
 * @param {object} authSession - NextAuth session (useSession), for its JWT
 * @param {object} data - fields to save
 * @param {string} section - one of SECTIONS_PROFIL (src/lib/sauvegarde-profil.js)
 * @returns {Promise<{ok: boolean, data?: object, message?: string}>}
 */
export async function patchMeMakeup(authSession, data, section) {
	let response
	try {
		response = await authenticatedFetch(
			`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
			authSession,
			{
				method: 'PATCH',
				body: JSON.stringify({ ...data }),
			}
		)
	} catch {
		response = undefined // network error: status 0
	}

	// null: the session expired, the visitor is sent to the sign-in page
	const status = response === null ? 401 : (response?.status ?? 0)
	const ok = !!response?.ok
	track('profile_save', { section, ok })

	if (ok) {
		toast.dismiss(TOAST_ECHEC)
		toast(MESSAGE_SAUVEGARDE_OK, { type: 'success', toastId: TOAST_OK })
		return { ok: true, data: await lireJson(response) }
	}

	const message = messageEchecSauvegarde(
		status,
		response ? await lireJson(response) : null
	)
	if (response !== null) {
		toast.dismiss(TOAST_OK)
		toast(message, { type: 'error', icon: '⛔', toastId: TOAST_ECHEC })
	}
	return { ok: false, message }
}
