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
export const MESSAGES_DES_PHOTOS = {
	galeriePleine: 'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.',
	photoRefusee:
		"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées.",
} as const

/** The identifier of a document a relationship holds: the identifier itself, or the document once populated. */
export const identifiantDe = (valeur: unknown): number | string | undefined => {
	const id = typeof valeur === 'object' && valeur !== null && 'id' in valeur ? valeur.id : valeur
	return typeof id === 'number' || typeof id === 'string' ? id : undefined
}

/** The media a field of photos names: none, one, or the list of the gallery, in order. */
export const photosNommees = (valeur: unknown): (number | string)[] =>
	(Array.isArray(valeur) ? valeur : [valeur]).map(identifiantDe).filter(id => id !== undefined)

/**
 * In the admin panel, the photos offered for a profile: those of its account. Nothing before the
 * account is chosen.
 */
export const photosDeLaProprietaire = ({ data }: { data: unknown }): Where | boolean => {
	const pro = identifiantDe((data as { pro?: unknown } | undefined)?.pro)
	return pro === undefined ? false : { owner: { equals: pro } }
}

/** What Payload hands a `validate` of these fields. `hasMany` is the one of the field, when it is known. */
interface OptionsDeValidation {
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
export async function validerPhotosDuProfil(
	valeur: unknown,
	{ data, hasMany, previousValue, req }: OptionsDeValidation
): Promise<true | string> {
	const plusieurs = hasMany ?? Array.isArray(valeur)
	if (!plusieurs && Array.isArray(valeur)) return MESSAGES_DES_PHOTOS.photoRefusee
	const entrees = (Array.isArray(valeur) ? valeur : [valeur]).filter(entree => entree !== undefined && entree !== null)
	const toutes = photosNommees(entrees)
	if (toutes.length !== entrees.length) return MESSAGES_DES_PHOTOS.photoRefusee
	if (toutes.length > GALERIE_MAX) return MESSAGES_DES_PHOTOS.galeriePleine
	const dejaLa = new Set(photosNommees(previousValue).map(String))
	const ids = toutes.filter(id => !dejaLa.has(String(id)))
	if (ids.length === 0) return true
	if (!ids.every(identifiantPossible)) return MESSAGES_DES_PHOTOS.photoRefusee
	const pro = identifiantDe((data as { pro?: unknown } | undefined)?.pro)
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { owner: true },
		where: { id: { in: ids } },
	})
	const proprietaires = new Map(docs.map(({ id, owner }) => [String(id), identifiantDe(owner)]))
	const toutesASonCompte = ids.every(id => {
		const proprietaire = proprietaires.get(String(id))
		return pro !== undefined && proprietaire !== undefined && String(proprietaire) === String(pro)
	})
	return toutesASonCompte ? true : MESSAGES_DES_PHOTOS.photoRefusee
}

/** `validate` of `photoPrincipale`: one photo, never a list. */
export const validerPhotoPrincipale = (
	valeur: unknown,
	options: Omit<OptionsDeValidation, 'hasMany'>
): Promise<true | string> => validerPhotosDuProfil(valeur, { ...options, hasMany: false })

/** `validate` of `galerie`: a list, in order. */
export const validerGalerie = (
	valeur: unknown,
	options: Omit<OptionsDeValidation, 'hasMany'>
): Promise<true | string> => validerPhotosDuProfil(valeur, { ...options, hasMany: true })
