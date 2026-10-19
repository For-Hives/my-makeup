/**
 * The description of a makeup artist, as she writes it in her space (ticket 122; plan 02 U05, U27).
 * One schema, read by the form in the browser and by the server action, so that the two can never
 * disagree on the bound, on the HTML removal or on a message.
 *
 * - The text is 2 000 characters at most (U27), counted on what will be stored: once the HTML is
 *   removed and the edge spaces cut. The collection `profils` holds the same bound.
 * - Every tag pasted into the text is removed (U27), with the content of a `script` or a `style`.
 *   The line breaks she typed are kept.
 * - The counter next to the field counts with `longueurDescription`, the single definition of the
 *   length that makes a profile publishable (U05, src/lib/profil/completude.ts): the form never
 *   computes its own.
 * - The server reads the same schema in its strict form: any key but `description` refuses the
 *   whole request (U32). Every message is in French.
 */

import { z } from 'zod'
import { DESCRIPTION_MIN, longueurDescription } from '../profil/completude'

/** The longest description: the bound of the collection `profils`. */
export const DESCRIPTION_MAX = 2000
export { DESCRIPTION_MIN }

/** The only field of the section. */
export const CHAMPS_DE_LA_DESCRIPTION = ['description'] as const
export type ValeursDeLaDescription = Record<(typeof CHAMPS_DE_LA_DESCRIPTION)[number], string>

const BALISES_A_VIDER = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const COMMENTAIRES = /<!--[\s\S]*?-->/g
const BALISES = /<\/?[a-z][^>]*>|<![^>]*>|<\?[^>]*>/gi

/**
 * The text without any HTML: scripts and styles with their content, comments, then every tag. It
 * starts again until nothing changes, so that `<<b>script>` cannot rebuild a tag from the pieces.
 * A `<` that opens no tag (« 3 < 5 ») is text and stays. Line breaks are `\n`, edge spaces cut.
 */
export function retirerLeHtml(valeur: string): string {
	let texte = valeur.replace(/\r\n?/g, '\n')
	for (;;) {
		const suivant = texte.replace(BALISES_A_VIDER, '').replace(COMMENTAIRES, '').replace(BALISES, '')
		if (suivant === texte) break
		texte = suivant
	}
	return texte.trim()
}

/** The counter under the field: how many characters count, and where she stands against 200. */
export interface Compteur {
	/** The length that counts for « publiable » (U05): runs of spaces and line breaks count once. */
	readonly compte: number
	/** The length of the text as it will be stored, against the bound of 2 000. */
	readonly total: number
	/** At least 200 characters count. */
	readonly assez: boolean
}

export function compteurDeLaDescription(saisie: string): Compteur {
	const texte = retirerLeHtml(saisie)
	const compte = longueurDescription(texte)
	return { compte, total: texte.length, assez: compte >= DESCRIPTION_MIN }
}

const TROP = `Ta description ne doit pas dépasser ${DESCRIPTION_MAX} caractères.`

const FORME = {
	// A value that is not a text (a forged request) gets a message of its own, in French.
	description: z
		.string({ error: 'Ta description doit être un texte.' })
		.transform(retirerLeHtml)
		.pipe(z.string().max(DESCRIPTION_MAX, TROP)),
}

/** What the form checks before it sends anything: the text without HTML, cut to its edges. */
export const schemaDeLaDescription = z.object(FORME)

/** What the server accepts: the same field and no other key. */
export const schemaDeLaDescriptionStrict = z.strictObject(FORME)

/** The message of the field when it does not pass. */
export function erreursDeLaDescription(erreur: z.ZodError): Partial<Record<'description', string>> {
	const premiere = erreur.issues.find(({ path }) => path[0] === 'description')
	return premiere ? { description: premiere.message } : {}
}
