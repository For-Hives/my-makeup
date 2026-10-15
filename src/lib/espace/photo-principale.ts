/**
 * The main photo, as the server takes it from her space (ticket 134): the identifier of a photo
 * she already sent, and nothing else. The server reads the same strict schema as the form: a key
 * that is not `photoPrincipale` (`statut`, `galerie`, `pro`…) refuses the whole request.
 */

import { z } from 'zod'
import { MESSAGES_DES_PHOTOS } from '../profil/photos'
import { estUnIdentifiantDePhoto, type IdentifiantDePhoto } from './photos'

export interface ValeursDeLaPhoto extends Record<string, unknown> {
	photoPrincipale: IdentifiantDePhoto
}

const identifiant = z.custom<IdentifiantDePhoto>(estUnIdentifiantDePhoto, { error: MESSAGES_DES_PHOTOS.photoRefusee })

export const schemaDeLaPhoto = z.strictObject({ photoPrincipale: identifiant })
