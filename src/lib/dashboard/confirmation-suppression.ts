import { z } from 'zod'

/**
 * What the form and the server share about deleting an account (ticket 141): what she retypes, the
 * strict schema of the request, the messages and the answer. Pure: the browser loads this file.
 */

/** The longest confirmation read (the limit of the sign-in password): a longer one is refused as wrong. */
export const CONFIRMATION_MAX = 1024

export type ModeDeConfirmation = 'mot-de-passe' | 'email'

/** The account of a provider that gave no password to the user: Google and Facebook. */
const FOURNISSEURS_SANS_MOT_DE_PASSE: readonly string[] = ['google', 'facebook']

/** What she retypes: her password, or her address when her account came from Google or Facebook. */
export const modeDeConfirmation = (compte: object): ModeDeConfirmation =>
	'legacyProvider' in compte &&
	typeof compte.legacyProvider === 'string' &&
	FOURNISSEURS_SANS_MOT_DE_PASSE.includes(compte.legacyProvider)
		? 'email'
		: 'mot-de-passe'

/** One field, nothing else: a key of more refuses the whole request. */
export const schemaDeLaSuppression = z.strictObject({ confirmation: z.string().max(CONFIRMATION_MAX) })

export interface ValeursDeLaSuppression extends Record<string, unknown> {
	confirmation: string
}

export const MESSAGES_DE_SUPPRESSION = {
	echec: 'La suppression n’a pas abouti : ton compte n’a pas été supprimé. Réessaie dans un instant.',
	motDePasse: 'Ce n’est pas le bon mot de passe : ton compte n’a pas été supprimé.',
	email: 'Ce n’est pas l’adresse email de ton compte : ton compte n’a pas été supprimé.',
	freine: 'Trop d’essais. Réessaie dans quelques minutes : ton compte n’a pas été supprimé.',
	session: 'Ta session a expiré : ton compte n’a pas été supprimé. Reconnecte-toi, puis recommence.',
	stockage: 'Le stockage des photos ne répond pas : ton compte n’a pas été supprimé. Réessaie dans quelques minutes.',
} as const

export type ResultatDeLaSuppression = { ok: true } | { ok: false; message: string; session?: 'expiree'; freine?: true }
