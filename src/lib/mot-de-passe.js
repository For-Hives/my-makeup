/**
 * Forgotten password (A7, plans/01 §2.2): /auth/mot-de-passe-oublie asks
 * Strapi for an email (POST /api/auth/forgot-password), the link of that
 * email opens /auth/reinitialiser?code=… which sets the new password
 * (POST /api/auth/reset-password).
 *
 * The request page answers the same whether the address has an account or
 * not. Strapi itself answers `{ ok: true }` for an unknown address, but a 500
 * when the email provider fails, which only happens for a known one: that
 * 500 gets the same answer too.
 *
 * Pure functions, ported to the v3 with the same paths.
 */

/**
 * Whether the « Mot de passe oublié ? » link is shown: only once Strapi
 * really sends emails (Mailgun configured). Build-time variable
 * NEXT_PUBLIC_FORGOT_PASSWORD=on.
 * @param {unknown} valeur
 * @returns {boolean}
 */
export function motDePasseOublieActif(valeur) {
	return typeof valeur === 'string' && valeur.trim().toLowerCase() === 'on'
}

export const MOT_DE_PASSE_MIN = 8

/** Cookie that carries the code from the email link to the form */
export const COOKIE_CODE = 'mm-reinit'
export const CHEMIN_REINITIALISATION = '/auth/reinitialiser'
const DUREE_COOKIE_S = 60 * 60

export const MESSAGES_MOT_DE_PASSE = {
	envoyee:
		'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans tes courriers indésirables.',
	'trop-de-tentatives': "Trop d'essais, réessaie dans quelques minutes.",
	'service-indisponible':
		'Le service est momentanément indisponible, réessaie dans quelques minutes.',
	'code-invalide':
		"Ce lien n'est plus valable : il a déjà servi ou il est incomplet. Demande un nouveau lien.",
	'code-absent':
		'Ce lien est incomplet : ouvre le lien reçu par email, ou demandes-en un nouveau.',
	'mot-de-passe-trop-court': `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`,
	'mots-de-passe-differents': 'Les deux mots de passe ne sont pas identiques.',
	'erreur-inconnue': 'Une erreur est survenue, réessaie dans quelques minutes.',
	modifie:
		'Ton mot de passe est modifié. Tu peux te connecter avec ton email et ce nouveau mot de passe.',
}

/**
 * What to tell after a POST /api/auth/forgot-password.
 * @param {number} status - 0 when the API could not be reached
 * @returns {'envoyee'|'trop-de-tentatives'|'service-indisponible'}
 */
export function issueDemandeReinitialisation(status) {
	if (status === 429) return 'trop-de-tentatives'
	// answers that may depend on the account all read the same: 2xx (sent or
	// unknown address), 400 and 500 (the email provider failed, known address)
	if ((status >= 200 && status < 300) || status === 400 || status === 500)
		return 'envoyee'
	return 'service-indisponible'
}

/**
 * Code of a failed POST /api/auth/reset-password.
 * @param {number} status
 * @param {string} [message] - `error.message` of the Strapi answer
 * @returns {string} a key of MESSAGES_MOT_DE_PASSE
 */
export function codeEchecReinitialisation(status, message = '') {
	const texte = typeof message === 'string' ? message : ''
	if (status === 429) return 'trop-de-tentatives'
	if (!status || status >= 500) return 'service-indisponible'
	if (/incorrect code/i.test(texte)) return 'code-invalide'
	if (/passwords do not match/i.test(texte)) return 'mots-de-passe-differents'
	if (/password/i.test(texte) && /(at least|short|min)/i.test(texte))
		return 'mot-de-passe-trop-court'
	return 'erreur-inconnue'
}

/**
 * The new password and its confirmation, checked before anything is sent.
 * No composition rule (plans/02 U24), 8 characters at least.
 * @param {unknown} motDePasse
 * @param {unknown} confirmation
 * @returns {string|null} a key of MESSAGES_MOT_DE_PASSE, null when fine
 */
export function erreurNouveauMotDePasse(motDePasse, confirmation) {
	if (typeof motDePasse !== 'string' || motDePasse.length < MOT_DE_PASSE_MIN)
		return 'mot-de-passe-trop-court'
	if (motDePasse !== confirmation) return 'mots-de-passe-differents'
	return null
}

/**
 * The reset code of a query string or a cookie, or null. Strapi's codes are
 * 128 hexadecimal characters; anything that does not look like a code is
 * dropped instead of being sent or echoed.
 * @param {unknown} brut - `?code=` (string or repeated) or a cookie value
 * @returns {string|null}
 */
export function codeReinitialisation(brut) {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	if (typeof valeur !== 'string') return null
	const code = valeur.trim()
	return /^[A-Za-z0-9_-]{16,512}$/.test(code) ? code : null
}

/**
 * Set-Cookie that keeps the code out of the URL: the link of the email is
 * read once on the server, then the page reloads without `?code=` so the
 * code never reaches the audience measurement nor the history.
 * @param {string} code
 * @param {{secure?: boolean}} [options]
 * @returns {string}
 */
export function cookieCode(code, { secure = true } = {}) {
	return [
		`${COOKIE_CODE}=${code}`,
		`Path=${CHEMIN_REINITIALISATION}`,
		`Max-Age=${DUREE_COOKIE_S}`,
		'HttpOnly',
		'SameSite=Lax',
		...(secure ? ['Secure'] : []),
	].join('; ')
}
