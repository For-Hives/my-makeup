import type { PayloadRequest, Where } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { identifiantPossible } from '../acces'
import { GALERIE_MAX } from '../medias'

/**
 * The photos of a profile (ticket 043): its main photo and its gallery, in order, 10 photos at most.
 * A profile holds only photos of the account it belongs to: a makeup artist never attaches the
 * photo of another one, and neither does an admin or the import.
 *
 * The messages are those of the old site, word for word (src/lib/photo.js and
 * src/lib/sauvegarde-profil.js, branch main).
 */
export const PHOTO_MESSAGES = {
	galeriePleine: 'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.',
	photoRefusee:
		"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées.",
} as const

/** The identifier of a document a relationship holds: the identifier itself, or the document once populated. */
export const idOf = (valeur: unknown): number | string | undefined => {
	const id = typeof valeur === 'object' && valeur !== null && 'id' in valeur ? valeur.id : valeur
	return typeof id === 'number' || typeof id === 'string' ? id : undefined
}

/** The media a field of photos names: none, one, or the list of the gallery, in order. */
export const namedPhotos = (valeur: unknown): (number | string)[] =>
	(Array.isArray(valeur) ? valeur : [valeur]).map(idOf).filter(id => id !== undefined)

/**
 * In the admin panel, the photos offered for a profile: those of its account. Nothing before the
 * account is chosen.
 */
export const ownerPhotos = ({ data }: { data: unknown }): Where | boolean => {
	const pro = idOf((data as { pro?: unknown } | undefined)?.pro)
	return pro === undefined ? false : { owner: { equals: pro } }
}

/** What Payload hands a `validate` of these fields. `hasMany` is the one of the field, when it is known. */
interface ValidationOptions {
	data: unknown
	hasMany?: boolean
	previousValue?: unknown
	req: PayloadRequest
}

/**
 * `validate` of `photoPrincipale` and `galerie`: 10 photos at most, and each photo the save
 * attaches an existing media that belongs to the account of the profile. A photo the profile
 * already holds stays, as on the old API (`checkRequestedFiles`, which checks the new files only):
 * an admin who gives a profile to another account does not lose its photos on the next save.
 *
 * Refused, with the same message and before any query (ticket 133, addendum of 14/10/2026):
 * - an entry that names no identifier (`true`, `{}`, `{ relationTo, value }`), instead of ignoring
 *   it, and a list given to a field that holds one photo;
 * - a new photo whose identifier no media can have (`identifiantPossible`): Postgres would fail on
 *   it and the request end in a 500.
 *
 * The media are read without access control: the rule is the owner, not what the request may read.
 */
export async function validateProfilePhotos(
	valeur: unknown,
	{ data, hasMany, previousValue, req }: ValidationOptions
): Promise<true | string> {
	const several = hasMany ?? Array.isArray(valeur)
	if (!several && Array.isArray(valeur)) return PHOTO_MESSAGES.photoRefusee
	const entries = (Array.isArray(valeur) ? valeur : [valeur]).filter(entree => entree !== undefined && entree !== null)
	const all = namedPhotos(entries)
	if (all.length !== entries.length) return PHOTO_MESSAGES.photoRefusee
	if (all.length > GALERIE_MAX) return PHOTO_MESSAGES.galeriePleine
	const alreadyThere = new Set(namedPhotos(previousValue).map(String))
	const ids = all.filter(id => !alreadyThere.has(String(id)))
	if (ids.length === 0) return true
	if (!ids.every(identifiantPossible)) return PHOTO_MESSAGES.photoRefusee
	const pro = idOf((data as { pro?: unknown } | undefined)?.pro)
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { owner: true },
		where: { id: { in: ids } },
	})
	const photoOwners = new Map(docs.map(({ id, owner }) => [String(id), idOf(owner)]))
	const allOnHerAccount = ids.every(id => {
		const photoOwner = photoOwners.get(String(id))
		return pro !== undefined && photoOwner !== undefined && String(photoOwner) === String(pro)
	})
	return allOnHerAccount ? true : PHOTO_MESSAGES.photoRefusee
}

/** `validate` of `photoPrincipale`: one photo, never a list. */
export const validateMainPhoto = (
	valeur: unknown,
	options: Omit<ValidationOptions, 'hasMany'>
): Promise<true | string> => validateProfilePhotos(valeur, { ...options, hasMany: false })

/** `validate` of `galerie`: a list, in order. */
export const validateGallery = (
	valeur: unknown,
	options: Omit<ValidationOptions, 'hasMany'>
): Promise<true | string> => validateProfilePhotos(valeur, { ...options, hasMany: true })
