import type { Payload } from 'payload'
import { identifiantPossible } from '../acces'
import { photosNommees } from '../profil/photos'
import type { ProfilDeLEspace } from './cards'

/** An identifier of a media, as Payload gives it (a number) or a request spells it (digits). */
export type IdentifiantDePhoto = number | string

/** What her space shows of one of her photos: where it is, how big, its alternative text. */
export interface PhotoDeLEspace {
	id: IdentifiantDePhoto
	url: string
	largeur: number | null
	hauteur: number | null
	alt: string
}

/** The photos of her profile, as the panels show them: the main one, and the portfolio in order. */
export interface PhotosDeLEspace {
	photo: PhotoDeLEspace | null
	galerie: PhotoDeLEspace[]
}

/** The identifier of a photo in a request: a whole number, or its digits. Nothing else. */
export const estUnIdentifiantDePhoto = (valeur: unknown): valeur is IdentifiantDePhoto =>
	(typeof valeur === 'number' || typeof valeur === 'string') && identifiantPossible(valeur)

/**
 * The photos her profile names, read by the identifiers of that profile (never by the request): a
 * photo that is gone or has no address is left out. The profile is hers, found by her account.
 */
export async function lirePhotosDeLEspace(
	payload: Payload,
	profil: Pick<ProfilDeLEspace, 'mainPicture' | 'gallery'>
): Promise<PhotosDeLEspace> {
	const principale = photosNommees(profil.mainPicture)[0]
	const rangee = photosNommees(profil.gallery)
	const demandes = [...new Set([...(principale === undefined ? [] : [principale]), ...rangee].map(String))]
	if (demandes.length === 0) return { photo: null, galerie: [] }
	const { docs } = await payload.find({
		collection: 'media',
		depth: 0,
		limit: demandes.length,
		overrideAccess: true,
		pagination: false,
		// The address is built from the file name and the prefix: they are read with it.
		select: { url: true, width: true, height: true, alt: true, filename: true, prefix: true },
		where: { id: { in: demandes } },
	})
	const parId = new Map<string, PhotoDeLEspace>()
	for (const media of docs) {
		if (typeof media.url !== 'string' || media.url === '') continue
		parId.set(String(media.id), {
			id: media.id,
			url: media.url,
			largeur: media.width ?? null,
			hauteur: media.height ?? null,
			alt: typeof media.alt === 'string' ? media.alt : '',
		})
	}
	return {
		photo: (principale !== undefined && parId.get(String(principale))) || null,
		galerie: rangee.flatMap(id => parId.get(String(id)) ?? []),
	}
}
