/**
 * The portfolio, as the server takes it from her space (tickets 135 and 136; plan 02 U80, E34,
 * E35): the whole list of her photos, in the order she wants, as identifiers of photos she already
 * sent. At most 10 (`GALERIE_MAX`), none twice. The server reads the same strict schema as the
 * form: a key that is not `galerie` (`statut`, `photoPrincipale`, `pro`…) refuses the whole request.
 *
 * Which of these photos are hers, and which were already in the portfolio, is the rule of the
 * field `galerie` of the profile (src/lib/profil/photos.ts), checked by the write itself.
 */

import { z } from 'zod'
import { GALERIE_MAX } from '../medias'
import { MESSAGES_DES_PHOTOS } from '../profil/photos'
import { estUnIdentifiantDePhoto, type IdentifiantDePhoto } from './photos'

export interface ValeursDuPortfolio extends Record<string, unknown> {
	galerie: IdentifiantDePhoto[]
}

const identifiant = z.custom<IdentifiantDePhoto>(estUnIdentifiantDePhoto, { error: MESSAGES_DES_PHOTOS.photoRefusee })

export const schemaDuPortfolio = z.strictObject({
	galerie: z
		.array(identifiant)
		.max(GALERIE_MAX, MESSAGES_DES_PHOTOS.galeriePleine)
		.refine(ids => new Set(ids.map(String)).size === ids.length, MESSAGES_DES_PHOTOS.photoRefusee),
})
