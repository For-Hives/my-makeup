/**
 * Sending her photos at the moment she validates (tickets 134 and 135; plan 02 E34, E36, I24, I25):
 * the browser sends each reduced file to the media route of Payload (the server checks its type,
 * its size and its name, ticket 133), then asks the server to name the photos on her profile.
 * Nothing is sent before that; closing a panel sends nothing, so it leaves no object.
 *
 * `envoyerPuisEnregistrer` is the whole gesture, with its three outcomes kept apart:
 * - a file is refused or the network fails while sending: nothing is saved, the files already sent
 *   in this gesture are deleted again (they are referenced by nothing), and she is told which file;
 * - the server answers « not saved » (`ok: false`): the same, the files sent are deleted;
 * - the call to the server throws, or its answer is lost: the outcome is unknown. The save may have
 *   gone through, so NOTHING is deleted (a photo her profile now names must never be removed); she
 *   is told to read the page again, and the files already sent are kept for the next try.
 *
 * Dependencies are parameters: the page gives `fetch` and the server action, a test gives fakes.
 */

import { UPLOAD_MESSAGES } from '../photo-upload'
import { MESSAGES_PHOTO } from './photo'
import type { PhotoId } from './photos'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from './result'

/** The route of Payload that receives a photo. */
export const MEDIA_ROUTE = '/api/media'

/** Said when the answer of the server is lost: the photos may or may not be saved. */
export const UNCERTAIN_RESULT_MESSAGE =
	'Nous n’avons pas reçu la réponse du serveur : tes photos sont peut-être enregistrées. Recharge la page pour voir ce qui l’est, puis recommence si besoin.'

export type FileUploadResult =
	| { ok: true; id: PhotoId }
	| { ok: false; message: string; session?: 'expiree'; cause?: RefusalCause }

/** Why a photo was refused, in the words of the event `upload_error` (ticket 147). */
export type RefusalCause = 'size' | 'type' | 'server'

/** What a test replaces: the network. */
export type Network = (adresse: string, options?: RequestInit) => Promise<Response>

/**
 * Sends one reduced file. `alt` is the alternative text it is stored with. A refusal of the server
 * (400) says if it is the size or the type; a session that ended (401, 403) says so.
 */
export async function uploadPhoto(
	fichier: File,
	alt: string,
	reseau: Network = (adresse, options) => fetch(adresse, options)
): Promise<FileUploadResult> {
	const form = new FormData()
	form.append('file', fichier)
	// Payload reads the fields of a document sent with a file as JSON under `_payload`.
	form.append('_payload', JSON.stringify({ alt }))
	let response: Response
	try {
		response = await reseau(`${MEDIA_ROUTE}?depth=0`, {
			method: 'POST',
			body: form,
			credentials: 'same-origin',
		})
	} catch {
		return { ok: false, message: MESSAGES_PHOTO['envoi-impossible'], cause: 'server' }
	}
	if (response.status === 401 || response.status === 403)
		return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	if (response.status === 413) return { ok: false, message: MESSAGES_PHOTO['refus-taille'], cause: 'size' }
	if (response.status === 400 || response.status === 415) {
		const text = await response.text().catch(() => '')
		const size = text.includes(UPLOAD_MESSAGES.taille)
		return {
			ok: false,
			message: size ? MESSAGES_PHOTO['refus-taille'] : MESSAGES_PHOTO['refus-type'],
			cause: size ? 'size' : 'type',
		}
	}
	if (response.status === 201) {
		const corps: unknown = await response.json().catch(() => null)
		const id = (corps as { doc?: { id?: unknown } } | null)?.doc?.id
		if (typeof id === 'number' || typeof id === 'string') return { ok: true, id }
	}
	return { ok: false, message: MESSAGES_PHOTO['envoi-impossible'], cause: 'server' }
}

/** Deletes a media nothing references (a file sent in a gesture that did not end). Never throws. */
export async function deleteMedia(
	id: PhotoId,
	reseau: Network = (adresse, options) => fetch(adresse, options)
): Promise<boolean> {
	try {
		const response = await reseau(`${MEDIA_ROUTE}/${encodeURIComponent(String(id))}?depth=0`, {
			method: 'DELETE',
			credentials: 'same-origin',
		})
		return response.ok
	} catch {
		return false
	}
}

/** A photo to send: the reduced file, and its identifier once the server holds it. */
export interface PhotoToSend {
	cle: string
	fichier: File
	alt: string
	/** Set once sent: a second try does not send it again. */
	id?: PhotoId | undefined
}

export type UploadOutcome<Valeurs extends Record<string, unknown>> =
	| { ok: true; valeurs: Valeurs; devenuPublicable?: true }
	| {
			ok: false
			message: string
			champs?: Partial<Record<keyof Valeurs, string>> | undefined
			session?: 'expiree' | undefined
			/** True when nothing is known of the save: the photos sent are kept. */
			incertain?: true
	  }

export async function sendThenSave<Valeurs extends Record<string, unknown>>({
	photos,
	televerser,
	supprimer,
	enregistrer,
	marquerEnvoyee,
}: {
	photos: readonly PhotoToSend[]
	televerser: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer: (id: PhotoId) => Promise<unknown>
	/** Names the photos on her profile: gets the identifiers of `photos`, in order. */
	enregistrer: (ids: PhotoId[]) => Promise<SaveResult<Valeurs>>
	/** Called each time a file is held by the server (and with `undefined` when it is deleted again). */
	marquerEnvoyee?: (cle: string, id: PhotoId | undefined) => void
}): Promise<UploadOutcome<Valeurs>> {
	const ids: PhotoId[] = []
	const sentHere: { cle: string; id: PhotoId }[] = []
	const removeUploads = async () => {
		for (const { cle: key, id } of sentHere) {
			await supprimer(id)
			marquerEnvoyee?.(key, undefined)
		}
	}
	for (const photo of photos) {
		if (photo.id !== undefined) {
			ids.push(photo.id)
			continue
		}
		const upload = await televerser(photo.fichier, photo.alt)
		if (!upload.ok) {
			await removeUploads()
			return upload.session === 'expiree'
				? { ok: false, message: upload.message, session: 'expiree' }
				: { ok: false, message: upload.message }
		}
		ids.push(upload.id)
		sentHere.push({ cle: photo.cle, id: upload.id })
		marquerEnvoyee?.(photo.cle, upload.id)
	}
	let result: SaveResult<Valeurs>
	try {
		result = await enregistrer(ids)
	} catch {
		// The call was lost: the save may have happened. Delete nothing.
		return { ok: false, message: UNCERTAIN_RESULT_MESSAGE, incertain: true }
	}
	if (result.ok) return result
	// Session ended: nothing stored, but she cannot delete either; the files wait for her next try.
	if (result.session === 'expiree') return { ok: false, message: result.message, session: 'expiree' }
	await removeUploads()
	return { ok: false, message: result.message || FAILURE_MESSAGE, champs: result.champs }
}
