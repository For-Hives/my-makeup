import { type FieldHook, type FilterOptionsProps, type PayloadRequest, ValidationError, type Where } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { estAdmin, identifiantPossible, MEDIAS_DE_LA_REDACTION } from './acces'
import { photosNommees } from './profile/photos'

/**
 * The gallery of an article (ticket 046; docs/migration/SCHEMA.md, §5.3): images only. The old site
 * took any file there (`galery`: images, files, videos, sounds); the v3 keeps what a browser shows
 * as a photo. Never a PDF, a video, or an SVG, which may carry a script.
 */
export const TYPES_D_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const

/** True for the type of a file the gallery of an article holds. */
export const estUneImage = (type: unknown): boolean =>
	typeof type === 'string' && (TYPES_D_IMAGE as readonly string[]).includes(type)

/**
 * The message of a gallery that names anything but an image of the newsroom. One message for every
 * refusal: a save never tells whether a media it may not read exists, nor whose it is.
 */
export const MESSAGE_GALERIE_IMAGES =
	'La galerie d’un article ne prend que des images envoyées par la rédaction (JPEG, PNG, WebP, GIF ou AVIF), jamais la photo d’une maquilleuse.'

/** The media that are images. */
export const IMAGES: Where = { mimeType: { in: [...TYPES_D_IMAGE] } }

/**
 * In the admin panel, the media offered for the gallery: the images of the newsroom, those that
 * belong to nobody. The photo of a makeup artist is never offered.
 *
 * `admin` reads every media: the owner is part of the filter. `editor` reads only the media of
 * the newsroom (`lectureDesMedias`), and may not filter on the owner, a field it does not read:
 * Payload would find nothing, and refuse every photo. Payload plays the same filter again when it
 * validates a published save, with the access rules of the request.
 */
export const imagesDeLaRedaction = ({ req }: Pick<FilterOptionsProps, 'req'>): Where =>
	estAdmin(req.user) ? { and: [IMAGES, MEDIAS_DE_LA_REDACTION] } : IMAGES

/**
 * Whether every media these identifiers name is an image of the newsroom: an image that belongs to
 * nobody (docs/migration/SCHEMA.md, §8). A media that does not exist is not one, and neither is an
 * identifier no media can have, refused before any query (Postgres would fail on it).
 *
 * One query, without access control: the rule is the file and its owner, not what the request may
 * read.
 */
export async function queDesImagesDeLaRedaction(ids: (number | string)[], req: PayloadRequest): Promise<boolean> {
	if (ids.length === 0) return true
	if (!ids.every(identifiantPossible)) return false
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { mimeType: true, owner: true },
		where: { id: { in: ids } },
	})
	const trouves = new Map(docs.map(media => [String(media.id), media]))
	return ids.every(id => {
		const media = trouves.get(String(id))
		return media !== undefined && estUneImage(media.mimeType) && (media.owner ?? null) === null
	})
}

/**
 * `beforeChange` of the gallery: a save that names anything but images of the newsroom is refused
 * (400), with the French message on the field. A hook, not `validate`: Payload skips the validation
 * of a draft, and a draft must hold neither a PDF nor the photo of a makeup artist, which publishing
 * the article would make public (`lectureDesMedias`, src/lib/acces.ts).
 *
 * Every entry of the gallery is looked at: one that names no identifier at all is refused too.
 *
 * The envelope of the refusal is in the language of the request, French (src/lib/langue-payload.ts,
 * ticket 221), and names the field by its label, as Payload does for a field it refuses itself:
 * « Le champ suivant n’est pas valide : Galerie ».
 */
export const galerieDImages: FieldHook = async ({ field, value, req }) => {
	const entrees = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
	const ids = photosNommees(entrees)
	if (ids.length !== entrees.length || !(await queDesImagesDeLaRedaction(ids, req)))
		throw new ValidationError(
			{
				collection: 'articles',
				errors: [{ label: field.label || undefined, message: MESSAGE_GALERIE_IMAGES, path: 'gallery' }],
			},
			req.t
		)
	return value
}
