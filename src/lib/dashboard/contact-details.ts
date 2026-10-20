/**
 * The contact details of a makeup artist, as she edits them in her space (ticket 126; plan 02 U28,
 * E30): a phone number, an email of contact, and her choice to show them on her public page. One
 * module, read by the form in the browser and by the server action.
 *
 * - The phone number is 20 characters at most (the bound of the collection), made of digits and
 *   the usual separators, with 9 to 15 digits: a French number, with or without its international
 *   prefix. The email is a well-formed address of 200 characters at most. Both may stay empty.
 * - `contactPublic` is her choice. The server dates it itself (`consentiLe`, src/collections/Profiles.ts):
 *   the request holds no date, and the strict schema refuses one.
 * - Every message is in French, under the field it is about.
 */

import { z } from 'zod'
import { EMAIL_MAX_LENGTH, PHONE_MAX_LENGTH } from '../profile/contact-details'

export const CONTACT_DETAILS_FIELDS = ['telephone', 'email', 'contactPublic'] as const
export type ContactDetailsField = (typeof CONTACT_DETAILS_FIELDS)[number]

export type ContactDetailsValues = {
	telephone: string
	email: string
	contactPublic: boolean
}

/** What a save gives back: her three fields as stored, and the date the server dated her choice. */
export type SavedContactDetails = ContactDetailsValues & {
	/** ISO date of the moment she chose to show them; `null` while they are hidden. */
	consentiLe: string | null
}

export const DASHBOARD_CONTACT_DETAILS_MESSAGES = {
	pasUnTexte: 'Ce champ doit être un texte.',
	telephoneTropLong: `Ton numéro ne doit pas dépasser ${PHONE_MAX_LENGTH} caractères.`,
	telephoneInvalide: 'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.',
	emailTropLong: `Ton email ne doit pas dépasser ${EMAIL_MAX_LENGTH} caractères.`,
	emailInvalide: 'Cet email n’est pas valide : écris-le comme prenom@exemple.fr.',
} as const

const SEPARATORS = /^[\d\s+().-]+$/
const DIGITS_MIN = 9
const DIGITS_MAX = 15

const phone = z
	.string({ error: DASHBOARD_CONTACT_DETAILS_MESSAGES.pasUnTexte })
	.trim()
	.superRefine((valeur, contexte) => {
		if (valeur === '') return
		if (valeur.length > PHONE_MAX_LENGTH) {
			contexte.addIssue({ code: 'custom', message: DASHBOARD_CONTACT_DETAILS_MESSAGES.telephoneTropLong })
			return
		}
		const digits = valeur.replace(/\D/g, '').length
		if (!SEPARATORS.test(valeur) || digits < DIGITS_MIN || digits > DIGITS_MAX)
			contexte.addIssue({ code: 'custom', message: DASHBOARD_CONTACT_DETAILS_MESSAGES.telephoneInvalide })
	})

const EMAIL = z.email()

const email = z
	.string({ error: DASHBOARD_CONTACT_DETAILS_MESSAGES.pasUnTexte })
	.trim()
	.superRefine((valeur, contexte) => {
		if (valeur === '') return
		if (!EMAIL.safeParse(valeur).success)
			contexte.addIssue({ code: 'custom', message: DASHBOARD_CONTACT_DETAILS_MESSAGES.emailInvalide })
		else if (valeur.length > EMAIL_MAX_LENGTH)
			contexte.addIssue({ code: 'custom', message: DASHBOARD_CONTACT_DETAILS_MESSAGES.emailTropLong })
	})

const SHAPE = {
	telephone: phone,
	email,
	contactPublic: z.boolean({ error: 'Choisis si tes coordonnées s’affichent.' }),
}

/** What the form checks before it sends anything. */
export const contactDetailsSchema = z.object(SHAPE)

/** What the server accepts: the three fields and no other key (no date of consent, no identifier). */
export const strictContactDetailsSchema = z.strictObject(SHAPE)

/** The message of each field that does not pass, the first one when a field has several. */
export function contactDetailsErrors(erreur: z.ZodError): Partial<Record<ContactDetailsField, string>> {
	const fields: Partial<Record<ContactDetailsField, string>> = {}
	for (const { path, message } of erreur.issues) {
		const field = CONTACT_DETAILS_FIELDS.find(nom => nom === path[0])
		if (field !== undefined && fields[field] === undefined) fields[field] = message
	}
	return fields
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' })

/** « 15 octobre 2026 », in Paris time, or `null` for a date that is missing or unreadable. */
export function longDate(date: unknown): string | null {
	if (typeof date !== 'string') return null
	const instant = new Date(date)
	return Number.isNaN(instant.getTime()) ? null : DATE_FORMAT.format(instant)
}
