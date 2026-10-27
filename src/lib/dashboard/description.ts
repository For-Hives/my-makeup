/**
 * The description of a makeup artist, as she writes it in her space (ticket 122; plan 02 U05, U27).
 * One schema, read by the form in the browser and by the server action, so that the two can never
 * disagree on the bound, on the HTML removal or on a message.
 *
 * - The text is 2 000 characters at most (U27), counted on what will be stored: once the HTML is
 *   removed and the edge spaces cut. The collection `profils` holds the same bound.
 * - Every tag pasted into the text is removed (U27), with the content of a `script` or a `style`.
 *   The line breaks she typed are kept.
 * - The counter next to the field counts with `descriptionLength`, the single definition of the
 *   length that lets Google index a profile (U05, src/lib/profile/completeness.ts): the form never
 *   computes its own.
 * - The server reads the same schema in its strict form: any key but `description` refuses the
 *   whole request (U32). Every message is in French.
 */

import { z } from 'zod'
import { stripMarkup } from '../html/strip-markup'
import { DESCRIPTION_MIN, descriptionLength } from '../profile/completeness'

/** The longest description: the bound of the collection `profils`. */
export const DESCRIPTION_MAX = 2000
export { DESCRIPTION_MIN }

/** The only field of the section. */
export const DESCRIPTION_FIELDS = ['description'] as const
export type DescriptionValues = Record<(typeof DESCRIPTION_FIELDS)[number], string>

/**
 * The text without any HTML: scripts and styles with their content, comments, then every tag. It
 * starts again until nothing changes, so that `<<b>script>` cannot rebuild a tag from the pieces.
 * A `<` that opens no tag (« 3 < 5 ») is text and stays. Line breaks are `\n`, edge spaces cut.
 */
export function removeHtml(valeur: string): string {
	return stripMarkup(valeur.replace(/\r\n?/g, '\n'), { dropContentOf: ['script', 'style'] }).trim()
}

/** The counter under the field: how many characters count, and where she stands against 100. */
export interface Counter {
	/** The length that counts for Google (`indexable`, U05): runs of spaces and line breaks count once. */
	readonly compte: number
	/** The length of the text as it will be stored, against the bound of 2 000. */
	readonly total: number
	/** At least 100 characters count. */
	readonly assez: boolean
}

export function descriptionCounter(saisie: string): Counter {
	const text = removeHtml(saisie)
	const account = descriptionLength(text)
	return { compte: account, total: text.length, assez: account >= DESCRIPTION_MIN }
}

const TOO_LONG = `Ta description ne doit pas dépasser ${DESCRIPTION_MAX} caractères.`

const SHAPE = {
	// A value that is not a text (a forged request) gets a message of its own, in French.
	description: z
		.string({ error: 'Ta description doit être un texte.' })
		.transform(removeHtml)
		.pipe(z.string().max(DESCRIPTION_MAX, TOO_LONG)),
}

/** What the form checks before it sends anything: the text without HTML, cut to its edges. */
export const descriptionSchema = z.object(SHAPE)

/** What the server accepts: the same field and no other key. */
export const strictDescriptionSchema = z.strictObject(SHAPE)

/** The message of the field when it does not pass. */
export function descriptionErrors(erreur: z.ZodError): Partial<Record<'description', string>> {
	const first = erreur.issues.find(({ path }) => path[0] === 'description')
	return first ? { description: first.message } : {}
}
