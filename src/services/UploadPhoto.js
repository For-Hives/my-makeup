import { authenticatedFetch } from './api'
import { track } from '@/lib/analytics'
import { codeRefusEnvoi, MESSAGES_PHOTO } from '@/lib/photo'

/**
 * POST /api/upload: sends one picture, already checked and compressed
 * (src/lib/photo.js). Called when the artist saves, never when she only
 * picks a file, so closing a modal leaves no file on the server (UI-03).
 * @param {object} authSession - NextAuth session, for its JWT
 * @param {File} fichier
 * @returns {Promise<{ok: true, fichier: object} | {ok: false, message?: string, sessionExpiree?: boolean}>}
 *   `fichier`: the Strapi file (id, url, width, height…)
 */
export async function uploadPhoto(authSession, fichier) {
	const formulaire = new FormData()
	formulaire.append('files', fichier)

	let response
	try {
		response = await authenticatedFetch(
			`${process.env.NEXT_PUBLIC_API_URL}/api/upload`,
			authSession,
			{ method: 'POST', body: formulaire }
		)
	} catch {
		response = undefined
	}
	if (response === null) return { ok: false, sessionExpiree: true }

	if (response?.ok) {
		try {
			const [stocke] = await response.json()
			if (stocke && stocke.id) return { ok: true, fichier: stocke }
		} catch {
			// unreadable answer: reported as a failure below
		}
	}

	track('upload_error', { kind: 'server' })
	return {
		ok: false,
		message: MESSAGES_PHOTO[codeRefusEnvoi(response?.status ?? 0)],
	}
}
