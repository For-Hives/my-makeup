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

import { MESSAGES_D_ENVOI } from '../envoi-photo'
import { MESSAGES_PHOTO } from './photo'
import type { IdentifiantDePhoto } from './photos'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from './resultat'

/** The route of Payload that receives a photo. */
export const ROUTE_DES_MEDIAS = '/api/media'

/** Said when the answer of the server is lost: the photos may or may not be saved. */
export const MESSAGE_RESULTAT_INCERTAIN =
	'Nous n’avons pas reçu la réponse du serveur : tes photos sont peut-être enregistrées. Recharge la page pour voir ce qui l’est, puis recommence si besoin.'

export type ResultatDEnvoiDUnFichier =
	| { ok: true; id: IdentifiantDePhoto }
	| { ok: false; message: string; session?: 'expiree'; cause?: CauseDeRefus }

/** Why a photo was refused, in the words of the event `upload_error` (ticket 147). */
export type CauseDeRefus = 'size' | 'type' | 'server'

/** What a test replaces: the network. */
export type Reseau = (adresse: string, options?: RequestInit) => Promise<Response>

/**
 * Sends one reduced file. `alt` is the alternative text it is stored with. A refusal of the server
 * (400) says if it is the size or the type; a session that ended (401, 403) says so.
 */
export async function televerserLaPhoto(
	fichier: File,
	alt: string,
	reseau: Reseau = (adresse, options) => fetch(adresse, options)
): Promise<ResultatDEnvoiDUnFichier> {
	const formulaire = new FormData()
	formulaire.append('file', fichier)
	// Payload reads the fields of a document sent with a file as JSON under `_payload`.
	formulaire.append('_payload', JSON.stringify({ alt }))
	let reponse: Response
	try {
		reponse = await reseau(`${ROUTE_DES_MEDIAS}?depth=0`, {
			method: 'POST',
			body: formulaire,
			credentials: 'same-origin',
		})
	} catch {
		return { ok: false, message: MESSAGES_PHOTO['envoi-impossible'], cause: 'server' }
	}
	if (reponse.status === 401 || reponse.status === 403)
		return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	if (reponse.status === 413) return { ok: false, message: MESSAGES_PHOTO['refus-taille'], cause: 'size' }
	if (reponse.status === 400 || reponse.status === 415) {
		const texte = await reponse.text().catch(() => '')
		const taille = texte.includes(MESSAGES_D_ENVOI.taille)
		return {
			ok: false,
			message: taille ? MESSAGES_PHOTO['refus-taille'] : MESSAGES_PHOTO['refus-type'],
			cause: taille ? 'size' : 'type',
		}
	}
	if (reponse.status === 201) {
		const corps: unknown = await reponse.json().catch(() => null)
		const id = (corps as { doc?: { id?: unknown } } | null)?.doc?.id
		if (typeof id === 'number' || typeof id === 'string') return { ok: true, id }
	}
	return { ok: false, message: MESSAGES_PHOTO['envoi-impossible'], cause: 'server' }
}

/** Deletes a media nothing references (a file sent in a gesture that did not end). Never throws. */
export async function supprimerLeMedia(
	id: IdentifiantDePhoto,
	reseau: Reseau = (adresse, options) => fetch(adresse, options)
): Promise<boolean> {
	try {
		const reponse = await reseau(`${ROUTE_DES_MEDIAS}/${encodeURIComponent(String(id))}?depth=0`, {
			method: 'DELETE',
			credentials: 'same-origin',
		})
		return reponse.ok
	} catch {
		return false
	}
}

/** A photo to send: the reduced file, and its identifier once the server holds it. */
export interface PhotoAEnvoyer {
	cle: string
	fichier: File
	alt: string
	/** Set once sent: a second try does not send it again. */
	id?: IdentifiantDePhoto | undefined
}

export type IssueDeLEnvoi<Valeurs extends Record<string, unknown>> =
	| { ok: true; valeurs: Valeurs; devenuPublicable?: true }
	| {
			ok: false
			message: string
			champs?: Partial<Record<keyof Valeurs, string>> | undefined
			session?: 'expiree' | undefined
			/** True when nothing is known of the save: the photos sent are kept. */
			incertain?: true
	  }

export async function envoyerPuisEnregistrer<Valeurs extends Record<string, unknown>>({
	photos,
	televerser,
	supprimer,
	enregistrer,
	marquerEnvoyee,
}: {
	photos: readonly PhotoAEnvoyer[]
	televerser: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer: (id: IdentifiantDePhoto) => Promise<unknown>
	/** Names the photos on her profile: gets the identifiers of `photos`, in order. */
	enregistrer: (ids: IdentifiantDePhoto[]) => Promise<ResultatDEnregistrement<Valeurs>>
	/** Called each time a file is held by the server (and with `undefined` when it is deleted again). */
	marquerEnvoyee?: (cle: string, id: IdentifiantDePhoto | undefined) => void
}): Promise<IssueDeLEnvoi<Valeurs>> {
	const ids: IdentifiantDePhoto[] = []
	const envoyesIci: { cle: string; id: IdentifiantDePhoto }[] = []
	const retirerLesEnvois = async () => {
		for (const { cle, id } of envoyesIci) {
			await supprimer(id)
			marquerEnvoyee?.(cle, undefined)
		}
	}
	for (const photo of photos) {
		if (photo.id !== undefined) {
			ids.push(photo.id)
			continue
		}
		const envoi = await televerser(photo.fichier, photo.alt)
		if (!envoi.ok) {
			await retirerLesEnvois()
			return envoi.session === 'expiree'
				? { ok: false, message: envoi.message, session: 'expiree' }
				: { ok: false, message: envoi.message }
		}
		ids.push(envoi.id)
		envoyesIci.push({ cle: photo.cle, id: envoi.id })
		marquerEnvoyee?.(photo.cle, envoi.id)
	}
	let resultat: ResultatDEnregistrement<Valeurs>
	try {
		resultat = await enregistrer(ids)
	} catch {
		// The call was lost: the save may have happened. Delete nothing.
		return { ok: false, message: MESSAGE_RESULTAT_INCERTAIN, incertain: true }
	}
	if (resultat.ok) return resultat
	// Session ended: nothing stored, but she cannot delete either; the files wait for her next try.
	if (resultat.session === 'expiree') return { ok: false, message: resultat.message, session: 'expiree' }
	await retirerLesEnvois()
	return { ok: false, message: resultat.message || MESSAGE_ECHEC, champs: resultat.champs }
}
