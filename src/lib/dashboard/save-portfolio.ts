import type { Payload } from 'payload'
import { namedPhotos, PHOTO_MESSAGES } from '../profile/photos'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { type PortfolioValues, portfolioSchema } from './portfolio'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/**
 * Saves the portfolio of the signed-in makeup artist (tickets 135 and 136), on the contract of
 * ticket 119. The files were sent beforehand to the media route of Payload; this names the photos
 * of her portfolio, in order.
 *
 * - The request is read by the strict schema: the list of identifiers, 10 at most (U80), none twice.
 * - The profile written is hers, found by her account; the write goes through the access rules and
 *   the rule of the field as herself: each photo new to the portfolio is one of her own media; the
 *   photos it already held pass as they are.
 * - A photo left out of the list goes to the bin of the storage once nothing references it
 *   (ticket 045, I25): the hooks of the collection do it, in the same transaction as this write. A
 *   photo still her main photo, or in an article, stays where it is.
 * - The list given back is the one the database stored.
 */
export async function savePortfolio(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<PortfolioValues>> {
	const parsed = portfolioSchema.safeParse(saisie)
	if (!parsed.success) {
		// Only the messages of the schema are French; a forged key gets the general message.
		const messages = parsed.error.issues.map(({ message }) => message)
		const message = [PHOTO_MESSAGES.galeriePleine, PHOTO_MESSAGES.photoRefusee].find(m => messages.includes(m))
		return message ? { ok: false, message, champs: { galerie: message } } : { ok: false, message: FAILURE_MESSAGE }
	}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const stored = await payload.update({
			collection: 'profiles',
			data: { gallery: parsed.data.galerie.map(Number) },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { galerie: namedPhotos(stored.gallery) } }
	} catch (error) {
		return payloadFailure(error, ['galerie'] as const, chemin => (chemin === 'gallery' ? 'galerie' : ''))
	}
}
