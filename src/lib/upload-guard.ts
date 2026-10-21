import { SESSION_COOKIE } from '@/lib/auth/closed-dashboard'
import { UPLOAD_MESSAGES, UPLOAD_REQUEST_SIZE_MAX } from '@/lib/photo-upload'

/**
 * A request to the media route that is refused before its body is read (ticket 273). Payload reads the
 * body of a request before it checks who sends it, so the proxy decides on what the headers say:
 * - no session cookie: 403, the answer Payload gives an anonymous request (nobody sends a file without an account);
 * - a declared length past what the site reads (`UPLOAD_REQUEST_SIZE_MAX`): 413 with the usual message.
 * A body with no declared length (chunked) is cut by the limits of Payload's parser (`PAYLOAD_UPLOAD_LIMITS`).
 * The cookie is only looked for, not checked: Payload still decides who may send.
 */
export const MEDIA_API_PATH = /^\/api\/media(\/|$)/

const BODY_METHODS = new Set(['POST', 'PATCH', 'PUT'])

export interface UploadRefusal {
	status: 403 | 413
	message: string
}

export function uploadRefusal({
	chemin,
	methode,
	cookies,
	longueur,
}: {
	chemin: string
	methode: string
	/** The names of the cookies of the request. */
	cookies: readonly string[]
	/** The `Content-Length` header as sent, if any. */
	longueur: string | null
}): UploadRefusal | undefined {
	if (!MEDIA_API_PATH.test(chemin) || !BODY_METHODS.has(methode.toUpperCase())) return undefined
	if (!cookies.includes(SESSION_COOKIE))
		return { status: 403, message: 'Vous n’êtes pas autorisé à effectuer cette action.' }
	const size = longueur === null || longueur.trim() === '' ? Number.NaN : Number(longueur)
	if (size > UPLOAD_REQUEST_SIZE_MAX) return { status: 413, message: UPLOAD_MESSAGES.taille }
	return undefined
}
