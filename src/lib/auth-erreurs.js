/**
 * Authentication errors (A3, plans/01 §2.2): stable codes for the sign-in and
 * sign-up forms and the error page, with their French messages.
 *
 * Strapi users-permissions answers in English and NextAuth has its own error
 * names: everything shown to a visitor goes through `normaliserCodeErreur`
 * first, so a raw message (or anything typed in the URL) is never displayed.
 * Pure functions, ported as is to the v3 (src/lib/auth-erreurs.ts).
 */

export const CODES_ERREUR = [
	'identifiants-invalides',
	'email-ou-nom-deja-pris',
	'nom-trop-court',
	'trop-de-tentatives',
	'service-indisponible',
	'session-expiree',
	'email-deja-avec-mot-de-passe',
	'email-non-confirme',
	'compte-bloque',
	'erreur-inconnue',
]

const MESSAGES = {
	'identifiants-invalides': 'Email ou mot de passe incorrect.',
	'email-ou-nom-deja-pris': 'Cet email ou ce nom est déjà utilisé.',
	'nom-trop-court': 'Le nom doit contenir au moins 3 caractères.',
	'trop-de-tentatives': "Trop d'essais, réessaie dans quelques minutes.",
	'service-indisponible':
		'Le service est momentanément indisponible, réessaie dans quelques minutes.',
	'session-expiree': 'Ta session a expiré, reconnecte-toi.',
	'email-deja-avec-mot-de-passe':
		'Cet email a déjà un compte avec un mot de passe : connecte-toi avec ton email et ton mot de passe.',
	'email-non-confirme': "Ton adresse email n'est pas encore confirmée.",
	'compte-bloque':
		'Ce compte est bloqué. Écris-nous depuis la page contact pour en savoir plus.',
	'erreur-inconnue': 'Une erreur est survenue, réessaie dans quelques minutes.',
}

// NextAuth's own error names (?error= on its pages) mapped to our codes
const CODES_NEXTAUTH = {
	CredentialsSignin: 'identifiants-invalides',
	SessionRequired: 'session-expiree',
	OAuthSignin: 'service-indisponible',
	OAuthCallback: 'service-indisponible',
	OAuthCreateAccount: 'service-indisponible',
	Callback: 'service-indisponible',
	Configuration: 'service-indisponible',
}

/**
 * Code for a failed call to Strapi's local auth (`/api/auth/local`,
 * `/api/auth/local/register`).
 * @param {number} status - HTTP status, 0 when the API could not be reached
 * @param {string} [message] - `error.message` of the Strapi answer
 * @returns {string} one of CODES_ERREUR
 */
export function codeErreurStrapi(status, message = '') {
	const texte = typeof message === 'string' ? message : ''
	if (status === 429) return 'trop-de-tentatives'
	if (!status || status >= 500) return 'service-indisponible'
	if (/already taken/i.test(texte)) return 'email-ou-nom-deja-pris'
	if (/username.*(at least|short)|minLength/i.test(texte))
		return 'nom-trop-court'
	if (/not confirmed/i.test(texte)) return 'email-non-confirme'
	if (/blocked/i.test(texte)) return 'compte-bloque'
	if (/invalid identifier or password/i.test(texte))
		return 'identifiants-invalides'
	return 'erreur-inconnue'
}

/**
 * Code for a failed exchange of a Google access token with Strapi
 * (`/api/auth/google/callback`). Strapi refuses with « Email is already
 * taken. » when the address already has an email and password account.
 * @param {number} status
 * @param {string} [message]
 * @returns {string} one of CODES_ERREUR
 */
export function codeErreurOAuth(status, message = '') {
	if (status === 400 && /email is already taken/i.test(String(message)))
		return 'email-deja-avec-mot-de-passe'
	return codeErreurStrapi(status, message)
}

/**
 * Our code for a `?error=` value (string or repeated parameter), or null when
 * there is none. Unknown values become `erreur-inconnue`, never echoed back.
 * @param {unknown} brut
 * @returns {string|null}
 */
export function normaliserCodeErreur(brut) {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	if (typeof valeur !== 'string' || valeur.trim() === '') return null
	const code = valeur.trim()
	if (CODES_ERREUR.includes(code)) return code
	return CODES_NEXTAUTH[code] ?? 'erreur-inconnue'
}

/**
 * French message for a code (or any `?error=` value).
 * @param {unknown} code
 * @returns {string}
 */
export function messageErreur(code) {
	return MESSAGES[normaliserCodeErreur(code) ?? 'erreur-inconnue']
}

/**
 * Expiry (ms) of a Strapi JWT, read without checking the signature: Strapi
 * checks it on every call. Null when the token cannot be read.
 * @param {string} jwt
 * @returns {number|null}
 */
export function expirationJwt(jwt) {
	try {
		const partie = String(jwt).split('.')[1]
		const base64 = partie.replace(/-/g, '+').replace(/_/g, '/')
		const { exp } = JSON.parse(atob(base64))
		return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
	} catch {
		return null
	}
}
