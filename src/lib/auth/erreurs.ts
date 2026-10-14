/**
 * The codes of the sign-in errors and their messages, word for word those of the current site
 * (plan 01 §2.2, A3). A message shown to a makeup artist always comes from this table: a raw
 * error, or anything typed in the URL, is never displayed.
 */

export const CODES_ERREUR = ['identifiants-invalides', 'trop-de-tentatives', 'service-indisponible'] as const
export type CodeErreur = (typeof CODES_ERREUR)[number]

const MESSAGES: Record<CodeErreur, string> = {
	'identifiants-invalides': 'Email ou mot de passe incorrect.',
	'trop-de-tentatives': 'Trop d’essais, réessaie dans quelques minutes.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
}

export const messageErreur = (code: CodeErreur): string => MESSAGES[code]
