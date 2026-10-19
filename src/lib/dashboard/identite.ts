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
export const IDENTITE_MAX = 70
/** The shortest first or last name. */
export const NOM_MIN = 2

/** The four fields she edits, in display order. */
export const CHAMPS_DE_L_IDENTITE = ['prenom', 'nom', 'nomArtiste', 'specialite'] as const
export type ChampDeLIdentite = (typeof CHAMPS_DE_L_IDENTITE)[number]

export type ValeursDeLIdentite = Record<ChampDeLIdentite, string>

/** The name of each field in a sentence, with its article: « ton prénom ». */
export const LIBELLES_DE_L_IDENTITE: Readonly<Record<ChampDeLIdentite, { libelle: string; phrase: string }>> = {
	prenom: { libelle: 'Prénom', phrase: 'ton prénom' },
	nom: { libelle: 'Nom', phrase: 'ton nom' },
	nomArtiste: { libelle: 'Nom d’artiste', phrase: 'ton nom d’artiste' },
	specialite: { libelle: 'Spécialité', phrase: 'ta spécialité' },
}

const maj = (phrase: string): string => phrase.charAt(0).toUpperCase() + phrase.slice(1)

function texteBorne(champ: ChampDeLIdentite, minimum: number) {
	const { phrase } = LIBELLES_DE_L_IDENTITE[champ]
	const trop = `${maj(phrase)} ne doit pas dépasser ${IDENTITE_MAX} caractères.`
	// A value that is not a text (a forged request) gets the message of an empty field.
	const base = z.string({ error: minimum > 0 ? `Indique ${phrase}.` : 'Ce champ doit être un texte.' }).trim()
	if (minimum === 0) return base.max(IDENTITE_MAX, trop)
	return base
		.min(1, `Indique ${phrase}.`)
		.min(minimum, `${maj(phrase)} doit contenir au moins ${minimum} caractères.`)
		.max(IDENTITE_MAX, trop)
}

const FORME = {
	prenom: texteBorne('prenom', NOM_MIN),
	nom: texteBorne('nom', NOM_MIN),
	nomArtiste: texteBorne('nomArtiste', 0),
	specialite: texteBorne('specialite', 0),
}

/** What the form checks before it sends anything: the four fields, trimmed. */
export const schemaDeLIdentite = z.object(FORME)

/** What the server accepts: the same four fields and no other key. */
export const schemaDeLIdentiteStrict = z.strictObject(FORME)

/** The message of each field that does not pass, the first one when a field has several. */
export function erreursParChamp(erreur: z.ZodError): Partial<Record<ChampDeLIdentite, string>> {
	const champs: Partial<Record<ChampDeLIdentite, string>> = {}
	for (const { path, message } of erreur.issues) {
		const champ = path[0]
		if (CHAMPS_DE_L_IDENTITE.some(nom => nom === champ) && champs[champ as ChampDeLIdentite] === undefined)
			champs[champ as ChampDeLIdentite] = message
	}
	return champs
}
