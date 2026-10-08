import { toast } from 'react-toastify'
import { authenticatedFetch } from './api'
import { track } from '@/lib/analytics'
import {
	MESSAGE_SAUVEGARDE_OK,
	sauvegarderProfil,
} from '@/lib/sauvegarde-profil'

// one toast of each kind at a time; a success replaces the failure before it
const TOAST_OK = 'profile-save-ok'
const TOAST_ECHEC = 'profile-save-echec'

/**
 * PATCH /api/me-makeup: saves fields of the signed-in artist's profile.
 *
 * Always awaited by the modals (UI-01): they change what the page shows and
 * close only when `ok` is true, and show `error` otherwise. The outcome is
 * also shown in a toast and counted (`profile_save`, see sauvegarderProfil).
 *
 * @param {object} authSession - NextAuth session (useSession), for its JWT
 * @param {object} data - fields to save
 * @param {string} section - one of SECTIONS_PROFIL (src/lib/sauvegarde-profil.js)
 * @returns {Promise<{ok: boolean, data?: object, error?: string, sessionExpiree?: true}>}
 *   `error`: the French message of a failed save (plans/01 UI-01)
 */
export async function patchMeMakeup(authSession, data, section) {
	const resultat = await sauvegarderProfil(data, section, {
		envoyer: corps =>
			authenticatedFetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
				authSession,
				{ method: 'PATCH', body: corps }
			),
		compter: track,
	})

	if (resultat.ok) {
		toast.dismiss(TOAST_ECHEC)
		toast(MESSAGE_SAUVEGARDE_OK, { type: 'success', toastId: TOAST_OK })
	} else if (!resultat.sessionExpiree) {
		// an expired session already has its own toast (authenticatedFetch)
		toast.dismiss(TOAST_OK)
		toast(resultat.error, { type: 'error', icon: '⛔', toastId: TOAST_ECHEC })
	}
	return resultat
}
