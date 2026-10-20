/**
 * The identity of a makeup artist, as she edits it in her space (ticket 119; plan 02 U25, U26, U32):
 * first name, last name, artist name and speciality. One schema, read by the form in the browser
 * and by the server action, so that the two can never disagree on a bound or on a message.
 *
 * - A name is 2 to 70 characters once its edge spaces are cut (U26), as on the old site. The artist
 *   name and the speciality may stay empty, 70 characters at most.
 * - The server reads the same schema in its strict form: a key that is not one of the four fields
 *   (`statut`, `verifie`, `score`, `pro`, `slug`, an identifier…) refuses the whole request (U32).
 * - Every message is in French, under the field it is about (U25).
 */

import { z } from 'zod'

/** The longest value of the four fields: the bound of the collection `profils`. */
export const IDENTITY_MAX = 70
/** The shortest first or last name. */
export const NAME_MIN = 2

/** The four fields she edits, in display order. */
export const IDENTITY_FIELDS = ['prenom', 'nom', 'nomArtiste', 'specialite'] as const
export type IdentityField = (typeof IDENTITY_FIELDS)[number]

export type IdentityValues = Record<IdentityField, string>

/** The name of each field in a sentence, with its article: « ton prénom ». */
export const IDENTITY_LABELS: Readonly<Record<IdentityField, { libelle: string; phrase: string }>> = {
	prenom: { libelle: 'Prénom', phrase: 'ton prénom' },
	nom: { libelle: 'Nom', phrase: 'ton nom' },
	nomArtiste: { libelle: 'Nom d’artiste', phrase: 'ton nom d’artiste' },
	specialite: { libelle: 'Spécialité', phrase: 'ta spécialité' },
}

const capitalize = (phrase: string): string => phrase.charAt(0).toUpperCase() + phrase.slice(1)

function boundedText(champ: IdentityField, minimum: number) {
	const { phrase } = IDENTITY_LABELS[champ]
	const tooLong = `${capitalize(phrase)} ne doit pas dépasser ${IDENTITY_MAX} caractères.`
	// A value that is not a text (a forged request) gets the message of an empty field.
	const base = z.string({ error: minimum > 0 ? `Indique ${phrase}.` : 'Ce champ doit être un texte.' }).trim()
	if (minimum === 0) return base.max(IDENTITY_MAX, tooLong)
	return base
		.min(1, `Indique ${phrase}.`)
		.min(minimum, `${capitalize(phrase)} doit contenir au moins ${minimum} caractères.`)
		.max(IDENTITY_MAX, tooLong)
}

const SHAPE = {
	prenom: boundedText('prenom', NAME_MIN),
	nom: boundedText('nom', NAME_MIN),
	nomArtiste: boundedText('nomArtiste', 0),
	specialite: boundedText('specialite', 0),
}

/** What the form checks before it sends anything: the four fields, trimmed. */
export const identitySchema = z.object(SHAPE)

/** What the server accepts: the same four fields and no other key. */
export const strictIdentitySchema = z.strictObject(SHAPE)

/** The message of each field that does not pass, the first one when a field has several. */
export function errorsByField(erreur: z.ZodError): Partial<Record<IdentityField, string>> {
	const fields: Partial<Record<IdentityField, string>> = {}
	for (const { path, message } of erreur.issues) {
		const field = path[0]
		if (IDENTITY_FIELDS.some(nom => nom === field) && fields[field as IdentityField] === undefined)
			fields[field as IdentityField] = message
	}
	return fields
}
