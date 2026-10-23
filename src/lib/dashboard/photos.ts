import type { Payload } from 'payload'
import { possibleId } from '../access'
import { namedPhotos } from '../profile/photos'
import type { DashboardProfile } from './cards'

/** An identifier of a media, as Payload gives it (a number) or a request spells it (digits). */
export type PhotoId = number | string

/** What her space shows of one of her photos: where it is, how big, its alternative text. */
export interface DashboardPhoto {
	id: PhotoId
	url: string
	largeur: number | null
	hauteur: number | null
	alt: string
}

/** The photos of her profile, as the panels show them: the main one, and the portfolio in order. */
export interface DashboardPhotos {
	photo: DashboardPhoto | null
	galerie: DashboardPhoto[]
	/** Her main photo is named, but its file was missing when the old site was taken over (ticket 275): she is told to add it again. */
	principaleManquante: boolean
}

/** The identifier of a photo in a request: a whole number, or its digits. Nothing else. */
export const isPhotoId = (valeur: unknown): valeur is PhotoId =>
	(typeof valeur === 'number' || typeof valeur === 'string') && possibleId(valeur)

/**
 * The photos her profile names, read by the identifiers of that profile (never by the request): a
 * photo that is gone or has no address is left out. The profile is hers, found by her account.
 */
export async function readDashboardPhotos(
	payload: Payload,
	profil: Pick<DashboardProfile, 'mainPicture' | 'gallery'>
): Promise<DashboardPhotos> {
	const main = namedPhotos(profil.mainPicture)[0]
	const ranked = namedPhotos(profil.gallery)
	const requested = [...new Set([...(main === undefined ? [] : [main]), ...ranked].map(String))]
	if (requested.length === 0) return { photo: null, galerie: [], principaleManquante: false }
	const { docs } = await payload.find({
		collection: 'media',
		depth: 0,
		limit: requested.length,
		overrideAccess: true,
		pagination: false,
		// The address is built from the file name and the prefix: they are read with it.
		select: { url: true, width: true, height: true, alt: true, filename: true, prefix: true, objectMissing: true },
		where: { id: { in: requested } },
	})
	const byId = new Map<string, DashboardPhoto>()
	const missing = new Set<string>()
	for (const media of docs) {
		// Marked by the import, no new request here: the page leaves it out like a photo that is gone.
		if (media.objectMissing === true) {
			missing.add(String(media.id))
			continue
		}
		if (typeof media.url !== 'string' || media.url === '') continue
		byId.set(String(media.id), {
			id: media.id,
			url: media.url,
			largeur: media.width ?? null,
			hauteur: media.height ?? null,
			alt: typeof media.alt === 'string' ? media.alt : '',
		})
	}
	return {
		photo: (main !== undefined && byId.get(String(main))) || null,
		galerie: ranked.flatMap(id => byId.get(String(id)) ?? []),
		principaleManquante: main !== undefined && missing.has(String(main)),
	}
}
