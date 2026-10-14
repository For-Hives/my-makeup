import { type FieldHook, type PayloadRequest, ValidationError, type Where } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { photosNommees } from './profil/photos'

/**
 * The gallery of an article (ticket 046; docs/migration/SCHEMA.md, §5.3): images only. The old site
 * took any file there (`galery`: images, files, videos, sounds); the v3 keeps what a browser shows
 * as a photo. Never a PDF, a video, or an SVG, which may carry a script.
 */
export const TYPES_D_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const

/** True for the type of a file the gallery of an article holds. */
export const estUneImage = (type: unknown): boolean =>
	typeof type === 'string' && (TYPES_D_IMAGE as readonly string[]).includes(type)

/** The message of a gallery that names something else than an image. */
export const MESSAGE_GALERIE_IMAGES = 'La galerie d’un article ne prend que des images : JPEG, PNG, WebP, GIF ou AVIF.'

/** In the admin panel, the media offered for the gallery: the images. */
export const IMAGES_SEULEMENT: Where = { mimeType: { in: [...TYPES_D_IMAGE] } }

/**
 * Whether every media these identifiers name is an image: one query, without access control (the
 * rule is the type of the file, not what the request may read). A media that does not exist is not
 * an image.
 */
export async function queDesImages(ids: (number | string)[], req: PayloadRequest): Promise<boolean> {
	if (ids.length === 0) return true
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { mimeType: true },
		where: { id: { in: ids } },
	})
	const types = new Map(docs.map(({ id, mimeType }) => [String(id), mimeType]))
	return ids.every(id => estUneImage(types.get(String(id))))
}

/**
 * `beforeChange` of the gallery: a save that names anything but images is refused (400), with the
 * French message on the field. A hook, not `validate`: Payload skips the validation of a draft, and
 * a draft must not hold a PDF either.
 */
export const galerieDImages: FieldHook = async ({ value, req }) => {
	if (!(await queDesImages(photosNommees(value), req)))
		throw new ValidationError({
			collection: 'articles',
			errors: [{ message: MESSAGE_GALERIE_IMAGES, path: 'galerie' }],
		})
	return value
}
