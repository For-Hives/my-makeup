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
 * @param {{photosEnregistrees?: number[]}} [options] - ids of the pictures
 *   the page shows as saved (see messageEchecSauvegarde)
 * @returns {Promise<{ok: boolean, data?: object, error?: string, sessionExpiree?: true, photoRefusee?: true, fichiersRefuses?: number[]}>}
 *   `error`: the French message of a failed save (plans/01 UI-01);
 *   `photoRefusee`: a 400 « File not allowed » (see photoRefusee in
 *   src/lib/sauvegarde-profil.js), the picture modals then drop the refused
 *   pictures, whose ids are in `fichiersRefuses`
 */
export async function patchMeMakeup(authSession, data, section, options) {
	const ports = {
		envoyer: corps =>
			authenticatedFetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
				authSession,
				{ method: 'PATCH', body: corps }
			),
		compter: track,
	}
	const resultat = await sauvegarderProfil(data, section, ports, options)

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
