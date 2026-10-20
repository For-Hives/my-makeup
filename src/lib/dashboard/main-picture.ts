/**
 * The main photo, as the server takes it from her space (ticket 134): the identifier of a photo
 * she already sent, and nothing else. The server reads the same strict schema as the form: a key
 * that is not `photoPrincipale` (`statut`, `galerie`, `pro`…) refuses the whole request.
 */

import { z } from 'zod'
import { MESSAGES_DES_PHOTOS } from '../profil/photos'
import { isPhotoId, type PhotoId } from './photos'

export interface PhotoValues extends Record<string, unknown> {
	photoPrincipale: PhotoId
}

const id = z.custom<PhotoId>(isPhotoId, { error: MESSAGES_DES_PHOTOS.photoRefusee })

export const photoSchema = z.strictObject({ photoPrincipale: id })
