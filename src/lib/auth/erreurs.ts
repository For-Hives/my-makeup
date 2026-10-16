/**
 * The codes of the sign-in errors and their messages, word for word those of the current site
 * (plan 01 §2.2, A3). A message shown to a makeup artist always comes from this table: a raw
 * error, or anything typed in the URL, is never displayed.
 */

import { ERREUR_SESSION_EXPIREE } from './retour'

export const CODES_ERREUR = [
	'identifiants-invalides',
	'email-non-confirme',
	'compte-bloque',
	'trop-de-tentatives',
	'service-indisponible',
] as const
export type CodeErreur = (typeof CODES_ERREUR)[number]

const MESSAGES: Record<CodeErreur, string> = {
	'identifiants-invalides': 'Email ou mot de passe incorrect.',
	'email-non-confirme':
		'Ton adresse email n’est pas encore confirmée. Regarde ta boîte mail (et tes spams) : le lien du mail active ton compte.',
	// The words of the current site. Said only to someone who gave the right password.
	'compte-bloque': 'Ce compte est bloqué. Écris-nous depuis la page contact pour en savoir plus.',
	'trop-de-tentatives': 'Trop d’essais, réessaie dans quelques minutes.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
}

export const messageErreur = (code: CodeErreur): string => MESSAGES[code]

/**
 * The codes the Google sign-in sends the visitor back to the sign-in page with (`?error=`), and
 * their messages (tickets 090 to 092). A closed list, like the rest: nothing Google said is shown,
 * and neither is the address of the account. `email-deja-avec-mot-de-passe` is the code of the
 * current site; `compte-bloque` is the one of the password sign-in (ticket 089), with its message.
 */
export const CODES_ERREUR_GOOGLE = [
	'google-echec',
	'google-annule',
	'google-indisponible',
	'google-email-non-verifie',
	'email-deja-avec-mot-de-passe',
	'compte-bloque',
	// The return was braked (ticket 223): too many returns from this address.
	'trop-de-tentatives',
] as const
export type CodeErreurGoogle = (typeof CODES_ERREUR_GOOGLE)[number]

const MESSAGES_GOOGLE: Record<CodeErreurGoogle, string> = {
	'google-echec':
		'La connexion avec Google n’a pas abouti. Réessaie dans un instant, ou connecte-toi avec ton email et ton mot de passe.',
	'google-annule':
		'Tu as annulé la connexion avec Google. Réessaie quand tu veux, ou connecte-toi avec ton email et ton mot de passe.',
	'google-indisponible':
		'Google ne répond pas pour le moment. Réessaie dans quelques minutes, ou connecte-toi avec ton email et ton mot de passe.',
	'google-email-non-verifie':
		'Google n’a pas confirmé ton adresse email : on ne peut pas t’inscrire ni te connecter avec ce compte Google. Inscris-toi avec ton email et un mot de passe.',
	'email-deja-avec-mot-de-passe':
		'Cette adresse email a déjà un compte avec un mot de passe : la connexion avec Google ne l’ouvre pas. Connecte-toi avec ton email et ton mot de passe, ou utilise « Mot de passe oublié ».',
	'compte-bloque': MESSAGES['compte-bloque'],
	'trop-de-tentatives': MESSAGES['trop-de-tentatives'],
}

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
	return erreurDeLUrl(brut)?.message ?? null
}

/** The same, with the code that was asked for: only a code of the closed list, never the value typed in the address. */
export function erreurDeLUrl(brut: unknown): { code: string; message: string } | null {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	if (valeur === ERREUR_SESSION_EXPIREE) return { code: valeur, message: MESSAGE_SESSION_EXPIREE }
	const google = CODES_ERREUR_GOOGLE.find(code => code === valeur)
	return google ? { code: google, message: MESSAGES_GOOGLE[google] } : null
}
