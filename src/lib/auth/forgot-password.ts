import { z } from 'zod'
import { EMAIL_MAX, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './sign-up'

/**
 * The rules of the forgotten password (tickets 085 and 086), pure: the request form, the page of the
 * link, the proxy and the server share them. No `next` import, no Payload.
 *
 * - The request answers the same sentence whether the address has an account or not
 *   (`PASSWORD_MESSAGES.envoyee`); the only refusals are ones that depend on the visitor alone
 *   (an address that is not an address, too many tries from this client address).
 * - The link of the mail holds a token of 40 hexadecimal characters (Payload's own). It is moved from
 *   the URL to a cookie by the proxy before any page is rendered, so that it never reaches the
 *   audience measurement, the history or a Referer. A code of another shape, such as the 128
 *   characters of the old site, is « not valid anymore »: it is never sent to the database.
 * - The texts are the ones of the current site, word for word.
 */

/** How long the link lives: one hour (plan 01 §2.3). */
export const LINK_DURATION_MS = 60 * 60 * 1000

/** The shortest time a request takes, whatever the address (plan 01 §2.3). */
export const FORGOT_PASSWORD_FLOOR_MS = 300

/** The token Payload makes: 20 random bytes in hexadecimal. */
export const PASSWORD_RESET_TOKEN = /^[0-9a-f]{40}$/

/** What the proxy accepts to keep in the cookie: the old site's codes too, so the page can say « plus valable ». */
const CODE_TO_KEEP = /^[A-Za-z0-9_-]{16,512}$/

export const PASSWORD_RESET_COOKIE = 'mm-reset'
export const PASSWORD_RESET_PAGE = '/auth/reinitialiser'
export const FORGOT_PASSWORD_PAGE = '/auth/mot-de-passe-oublie'

export const PASSWORD_MESSAGES = {
	envoyee:
		'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans tes courriers indésirables.',
	'email-vide': 'Indique ton adresse email.',
	'email-invalide': 'Cette adresse email n’est pas valide.',
	'trop-de-tentatives': 'Trop d’essais, réessaie dans quelques minutes.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
	'code-invalide': 'Ce lien n’est plus valable : il a déjà servi ou il est incomplet. Demande un nouveau lien.',
	'code-absent': 'Ce lien est incomplet : ouvre le lien reçu par email, ou demandes-en un nouveau.',
	'mot-de-passe-trop-court': `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
	'mot-de-passe-trop-long': `Le mot de passe est trop long (${MAX_PASSWORD_LENGTH} caractères au plus).`,
	'mots-de-passe-differents': 'Les deux mots de passe ne sont pas identiques.',
	modifie: 'Ton mot de passe est modifié. Tu peux te connecter avec ton email et ce nouveau mot de passe.',
} as const
export type PasswordCode = keyof typeof PASSWORD_MESSAGES

export type ForgotPasswordFailureCode = 'email-vide' | 'email-invalide' | 'trop-de-tentatives' | 'service-indisponible'
export type PasswordResetFailureCode = Exclude<PasswordCode, 'envoyee' | 'email-vide' | 'email-invalide' | 'modifie'>

const text = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '')

const schemaEmail = z
	.string()
	.trim()
	.min(1, 'email-vide')
	.max(EMAIL_MAX, 'email-invalide')
	.pipe(z.email('email-invalide'))

/** The address of the request: trimmed, and lower-cased by Payload. Gives the code of the problem otherwise. */
export function validateAddress(
	brut: unknown
): { ok: true; email: string } | { ok: false; code: 'email-vide' | 'email-invalide' } {
	const result = schemaEmail.safeParse(text(brut))
	if (result.success) return { ok: true, email: result.data }
	return { ok: false, code: result.error.issues[0]?.message === 'email-vide' ? 'email-vide' : 'email-invalide' }
}

/** The new password and its confirmation. No rule of composition (AUTH-11), 8 characters at least, never trimmed. */
export function validateNewPassword(
	motDePasse: unknown,
	confirmation: unknown
):
	| { ok: true; motDePasse: string }
	| { ok: false; code: 'mot-de-passe-trop-court' | 'mot-de-passe-trop-long' | 'mots-de-passe-differents' } {
	const password = text(motDePasse)
	if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, code: 'mot-de-passe-trop-court' }
	if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, code: 'mot-de-passe-trop-long' }
	if (password !== text(confirmation)) return { ok: false, code: 'mots-de-passe-differents' }
	return { ok: true, motDePasse: password }
}

/** The token of a link or a cookie if it has the shape of ours, otherwise nothing. */
export function passwordResetToken(brut: unknown): string | null {
	const value = Array.isArray(brut) ? brut[0] : brut
	if (typeof value !== 'string') return null
	const token = value.trim()
	return PASSWORD_RESET_TOKEN.test(token) ? token : null
}

/** What the proxy does with a request for the page of the link: the cookie to set or to clear, and where to go. */
export type LinkPlan = { aller: string; cookie: { valeur: string; maxAgeS: number } }

/**
 * The link of the mail (`/auth/reinitialiser?code=…`) opens the page without its code: the code goes
 * into a cookie of this page only, HttpOnly, for the life of the link, and the visitor is sent to the
 * bare address (one redirection). A code that is not a code clears the cookie, so that an old one does
 * not outlive the link that replaced it. Nothing else under that path is concerned.
 */
export function linkPlan(chemin: string, parametres: URLSearchParams): LinkPlan | null {
	if (chemin !== PASSWORD_RESET_PAGE || !parametres.has('code')) return null
	const code = parametres.get('code')?.trim() ?? ''
	return CODE_TO_KEEP.test(code)
		? { aller: PASSWORD_RESET_PAGE, cookie: { valeur: code, maxAgeS: LINK_DURATION_MS / 1000 } }
		: { aller: PASSWORD_RESET_PAGE, cookie: { valeur: '', maxAgeS: 0 } }
}
