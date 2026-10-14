/**
 * The codes of the sign-in errors and their messages, word for word those of the current site
 * (plan 01 §2.2, A3). A message shown to a makeup artist always comes from this table: a raw
 * error, or anything typed in the URL, is never displayed.
 */

import { ERREUR_SESSION_EXPIREE } from './retour'

export const CODES_ERREUR = ['identifiants-invalides', 'trop-de-tentatives', 'service-indisponible'] as const
export type CodeErreur = (typeof CODES_ERREUR)[number]

const MESSAGES: Record<CodeErreur, string> = {
	'identifiants-invalides': 'Email ou mot de passe incorrect.',
	'trop-de-tentatives': 'Trop d’essais, réessaie dans quelques minutes.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
}

export const messageErreur = (code: CodeErreur): string => MESSAGES[code]

/** What the sign-in page says when the session ended (the words of the current site). */
export const MESSAGE_SESSION_EXPIREE = 'Ta session a expiré, reconnecte-toi.'

/** What the pages of the space say when the session cannot be checked for now. */
export const MESSAGE_VERIFICATION_IMPOSSIBLE =
	'Le service est momentanément indisponible, réessaie dans quelques minutes. Tu restes connectée.'

/**
 * The message the `?error=` of the sign-in page asks for, or nothing. A closed list: the value of
 * the address is compared with it and never copied to the screen, so a code nobody knows (or a
 * line of text in the link) shows nothing.
 */
export function messageDeLUrl(brut: unknown): string | null {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	return valeur === ERREUR_SESSION_EXPIREE ? MESSAGE_SESSION_EXPIREE : null
}
