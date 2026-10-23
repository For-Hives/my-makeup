/**
 * The SIRET of a makeup artist, as she edits it in her space (issue 1004): one optional field. One module, read by
 * the form in the browser and by the server action.
 *
 * - She may type it with spaces (« 123 456 789 01237 »): they are taken off before the check, and the value
 *   stored is the 14 digits. Empty clears it, and the badge with it.
 * - The check is the one of the collection (src/lib/profile/siret.ts): 14 digits and the check key. The messages
 *   are in French, under the field.
 * - The SIRET is a personal datum for a sole trader: it is never shown on a public page, in a log or in an event
 *   of the measure. Nothing here reaches the registry: the daily task does (src/lib/tasks/activity-check.ts).
 */

import { z } from 'zod'
import { MESSAGE_SIRET_CHECK, normalizeSiret, validateSiret } from '../profile/siret'

export const SIRET_FIELDS = ['siret'] as const

export type SiretValues = { siret: string }

export const DASHBOARD_SIRET_MESSAGES = {
	pasUnTexte: 'Ce champ doit être un texte.',
	shape: 'Un SIRET compte 14 chiffres : écris-le avec ou sans espaces, sans lettre.',
	key: MESSAGE_SIRET_CHECK,
} as const

const siret = z.string({ error: DASHBOARD_SIRET_MESSAGES.pasUnTexte }).superRefine((typed, context) => {
	const checked = validateSiret(normalizeSiret(typed))
	if (checked === true) return
	context.addIssue({
		code: 'custom',
		message: checked === MESSAGE_SIRET_CHECK ? DASHBOARD_SIRET_MESSAGES.key : DASHBOARD_SIRET_MESSAGES.shape,
	})
})

/** What the form checks before it sends anything. */
export const siretSchema = z.object({ siret })

/** What the server accepts: the field and no other key. */
export const strictSiretSchema = z.strictObject({ siret })

/** The message of the field when it does not pass. */
export function siretErrors(erreur: z.ZodError): Partial<Record<'siret', string>> {
	const message = erreur.issues.find(({ path }) => path[0] === 'siret')?.message
	return message === undefined ? {} : { siret: message }
}
