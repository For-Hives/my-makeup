import { SESSION_COOKIE } from '@/lib/auth/closed-dashboard'
import { uploadRequestSizeMax } from '@/lib/photo-limits'
import { UPLOAD_MESSAGES } from '@/lib/photo-upload'

/**
 * A request to the media route that is refused before its body is read (ticket 273). Payload reads the
 * body of a request before it checks who sends it, so the proxy decides on what the headers say:
 * - no session cookie: 403, the answer Payload gives an anonymous request (nobody sends a file without an account);
 * - a declared length past what the site reads (the setting `PHOTO_UPLOAD_MAX_MB` plus the overhead of a multipart body): 413 with the usual message.
 * A body with no declared length (chunked) is cut by the limits of Payload's parser (`uploadLimits`).
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
	if (size > uploadRequestSizeMax()) return { status: 413, message: UPLOAD_MESSAGES.taille }
	return undefined
}
