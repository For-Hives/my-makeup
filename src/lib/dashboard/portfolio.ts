/**
 * The portfolio, as the server takes it from her space (tickets 135 and 136; plan 02 U80, E34,
 * E35): the whole list of her photos, in the order she wants, as identifiers of photos she already
 * sent. At most 10 (`GALERIE_MAX`), none twice. The server reads the same strict schema as the
 * form: a key that is not `galerie` (`statut`, `photoPrincipale`, `pro`…) refuses the whole request.
 *
 * Which of these photos are hers, and which were already in the portfolio, is the rule of the
 * field `galerie` of the profile (src/lib/profile/photos.ts), checked by the write itself.
 */

import { z } from 'zod'
import { GALERIE_MAX } from '../media'
import { PHOTO_MESSAGES } from '../profile/photos'
import { isPhotoId, type PhotoId } from './photos'

export interface PortfolioValues extends Record<string, unknown> {
	galerie: PhotoId[]
}

const id = z.custom<PhotoId>(isPhotoId, { error: PHOTO_MESSAGES.photoRefusee })

export const portfolioSchema = z.strictObject({
	galerie: z
		.array(id)
		.max(GALERIE_MAX, PHOTO_MESSAGES.galeriePleine)
		.refine(ids => new Set(ids.map(String)).size === ids.length, PHOTO_MESSAGES.photoRefusee),
})
