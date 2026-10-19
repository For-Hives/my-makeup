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
import { LONGUEUR_MAX_EMAIL, LONGUEUR_MAX_TELEPHONE } from '../profil/coordonnees'

export const CHAMPS_DES_COORDONNEES = ['telephone', 'email', 'contactPublic'] as const
export type ChampDesCoordonnees = (typeof CHAMPS_DES_COORDONNEES)[number]

export type ValeursDesCoordonnees = {
	telephone: string
	email: string
	contactPublic: boolean
}

/** What a save gives back: her three fields as stored, and the date the server dated her choice. */
export type CoordonneesEnregistrees = ValeursDesCoordonnees & {
	/** ISO date of the moment she chose to show them; `null` while they are hidden. */
	consentiLe: string | null
}

export const MESSAGES_DES_COORDONNEES_DE_L_ESPACE = {
	pasUnTexte: 'Ce champ doit être un texte.',
	telephoneTropLong: `Ton numéro ne doit pas dépasser ${LONGUEUR_MAX_TELEPHONE} caractères.`,
	telephoneInvalide: 'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.',
	emailTropLong: `Ton email ne doit pas dépasser ${LONGUEUR_MAX_EMAIL} caractères.`,
	emailInvalide: 'Cet email n’est pas valide : écris-le comme prenom@exemple.fr.',
} as const

const SEPARATEURS = /^[\d\s+().-]+$/
const CHIFFRES_MIN = 9
const CHIFFRES_MAX = 15

const telephone = z
	.string({ error: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.pasUnTexte })
	.trim()
	.superRefine((valeur, contexte) => {
		if (valeur === '') return
		if (valeur.length > LONGUEUR_MAX_TELEPHONE) {
			contexte.addIssue({ code: 'custom', message: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.telephoneTropLong })
			return
		}
		const chiffres = valeur.replace(/\D/g, '').length
		if (!SEPARATEURS.test(valeur) || chiffres < CHIFFRES_MIN || chiffres > CHIFFRES_MAX)
			contexte.addIssue({ code: 'custom', message: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.telephoneInvalide })
	})

const EMAIL = z.email()

const email = z
	.string({ error: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.pasUnTexte })
	.trim()
	.superRefine((valeur, contexte) => {
		if (valeur === '') return
		if (!EMAIL.safeParse(valeur).success)
			contexte.addIssue({ code: 'custom', message: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.emailInvalide })
		else if (valeur.length > LONGUEUR_MAX_EMAIL)
			contexte.addIssue({ code: 'custom', message: MESSAGES_DES_COORDONNEES_DE_L_ESPACE.emailTropLong })
	})

const FORME = {
	telephone,
	email,
	contactPublic: z.boolean({ error: 'Choisis si tes coordonnées s’affichent.' }),
}

/** What the form checks before it sends anything. */
export const schemaDesCoordonnees = z.object(FORME)

/** What the server accepts: the three fields and no other key (no date of consent, no identifier). */
export const schemaDesCoordonneesStrict = z.strictObject(FORME)

/** The message of each field that does not pass, the first one when a field has several. */
export function erreursDesCoordonnees(erreur: z.ZodError): Partial<Record<ChampDesCoordonnees, string>> {
	const champs: Partial<Record<ChampDesCoordonnees, string>> = {}
	for (const { path, message } of erreur.issues) {
		const champ = CHAMPS_DES_COORDONNEES.find(nom => nom === path[0])
		if (champ !== undefined && champs[champ] === undefined) champs[champ] = message
	}
	return champs
}

const FORMAT_DE_LA_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' })

/** « 15 octobre 2026 », in Paris time, or `null` for a date that is missing or unreadable. */
export function dateLongue(date: unknown): string | null {
	if (typeof date !== 'string') return null
	const instant = new Date(date)
	return Number.isNaN(instant.getTime()) ? null : FORMAT_DE_LA_DATE.format(instant)
}
