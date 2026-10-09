/**
 * NextAuth session rules (A1, A2, A4, plans/01 §2.2), as pure functions so
 * they are tested without a server: when to ask Strapi again, what a Strapi
 * answer means for the session, which cookies to clear, where to send the
 * visitor back, what to log. Edge-safe (the middleware imports it): no Node
 * API at module level.
 */

/** At most one `/api/users/me` call per session and per window */
export const REVALIDATION_PAR_DEFAUT_MS = 15 * 60 * 1000
/** A Strapi JWT this close to its expiry is treated as expired */
export const MARGE_EXPIRATION_MS = 60 * 1000
/** Timeout of the revalidation call: the session read must stay fast */
export const DELAI_REVALIDATION_MS = 3000
/** Timeout of the sign-in, sign-up and profile calls */
export const DELAI_STRAPI_MS = 8000

/**
 * Revalidation window from AUTH_REVALIDATION_MS (ms). Empty or invalid: the
 * default 15 min. 0 revalidates on every session read (tests only).
 * @param {string|undefined} brut
 * @returns {number}
 */
export function delaiRevalidation(brut) {
	if (typeof brut !== 'string' || brut.trim() === '')
		return REVALIDATION_PAR_DEFAUT_MS
	const valeur = Number(brut)
	return Number.isFinite(valeur) && valeur >= 0
		? Math.floor(valeur)
		: REVALIDATION_PAR_DEFAUT_MS
}

/**
 * What to do with a NextAuth token on a session read.
 * - `sans-jwt`: no Strapi JWT, the session is useless
 * - `expire`: the Strapi JWT is expired (or about to be)
 * - `frais`: checked less than a window ago, keep it without calling Strapi
 * - `a-verifier`: ask Strapi (`/api/users/me`)
 * @param {{jwt?: string, strapiExp?: number|null, verifieA?: number}|null} token
 * @param {number} maintenant - ms
 * @param {number} revalidationMs
 * @returns {'sans-jwt'|'expire'|'frais'|'a-verifier'}
 */
export function etatJeton(token, maintenant, revalidationMs) {
	if (!token || !token.jwt) return 'sans-jwt'
	if (token.strapiExp && maintenant > token.strapiExp - MARGE_EXPIRATION_MS)
		return 'expire'
	if (maintenant - (token.verifieA ?? 0) < revalidationMs) return 'frais'
	return 'a-verifier'
}

/**
 * Meaning of the `/api/users/me` status for the session. Only a 401 proves
 * the JWT is invalid: a 5xx, a 429 or a network error (status 0) keeps the
 * session, it will be checked again on the next read.
 * @param {number} status
 * @returns {'refusee'|'valide'|'inchangee'}
 */
export function suiteVerification(status) {
	if (status === 401) return 'refusee'
	if (status >= 200 && status < 300) return 'valide'
	return 'inchangee'
}

/**
 * `session.expires` bounded by the expiry of the Strapi JWT: the browser is
 * never told the session lasts longer than the JWT it carries.
 * @param {string} expires - ISO date computed by NextAuth
 * @param {number|null|undefined} strapiExp - ms
 * @returns {string} ISO date
 */
export function expirationSession(expires, strapiExp) {
	const session = Date.parse(expires)
	const bornes = [session, strapiExp].filter(
		valeur => typeof valeur === 'number' && Number.isFinite(valeur)
	)
	return bornes.length ? new Date(Math.min(...bornes)).toISOString() : expires
}

/**
 * Whether the middleware lets a token through: a Strapi JWT is present and
 * not expired (same margin as the session read, so the page never gets a
 * token the session read would refuse).
 * @param {{jwt?: string, strapiExp?: number|null}|null} token
 * @param {number} maintenant - ms
 * @returns {boolean}
 */
export function sessionValide(token, maintenant) {
	const etat = etatJeton(token, maintenant, Infinity)
	return etat !== 'sans-jwt' && etat !== 'expire'
}

const SECRETS_VIDES = ['', 'undefined', 'null']

/**
 * NEXTAUTH_SECRET checked: missing or empty at runtime in production is an
 * error (it used to become the string « undefined »). During `next build` and
 * outside production it may be missing (NextAuth then derives a dev secret).
 * @param {object} contexte
 * @param {string} [contexte.secret] - NEXTAUTH_SECRET
 * @param {string} [contexte.nodeEnv] - NODE_ENV
 * @param {string} [contexte.phase] - NEXT_PHASE
 * @returns {string|undefined}
 */
export function secretNextAuth({ secret, nodeEnv, phase } = {}) {
	const valeur = typeof secret === 'string' ? secret.trim() : ''
	if (!SECRETS_VIDES.includes(valeur)) return valeur
	if (nodeEnv === 'production' && phase !== 'phase-production-build')
		throw new Error(
			'NEXTAUTH_SECRET manquant : définir la variable au runtime (openssl rand -base64 32)'
		)
	return undefined
}

/**
 * Base URL of Strapi for server-side calls: the internal Docker network URL
 * when set (no public DNS nor Traefik on the way), the public one otherwise.
 * @param {{interne?: string, publique?: string}} urls
 * @returns {string} without trailing slash
 */
export function urlApiServeur({ interne, publique } = {}) {
	const choisie = [interne, publique].find(
		url => typeof url === 'string' && url.trim() !== ''
	)
	return choisie ? choisie.trim().replace(/\/+$/, '') : ''
}

const COOKIE_SESSION = /^(__Secure-)?next-auth\.session-token(\.\d+)?$/

/**
 * Whether the browser sent a NextAuth session cookie (plain, `__Secure-` or
 * one of its chunks): a visitor who never signed in sends none.
 * @param {string[]} noms - cookie names of the request
 * @returns {boolean}
 */
export function aCookieDeSession(noms = []) {
	return noms.some(nom => COOKIE_SESSION.test(nom))
}

/**
 * Where a session that ended was caught, as `session_expired` counts it
 * (`where` of the analytics catalogue):
 * - `api_401`: Strapi refused the JWT on a page or API call
 * - `jwt_expire`: the session read refused it (Strapi JWT expired, or
 *   `/api/users/me` in 401 at revalidation)
 * - `middleware`: the middleware saw an expired JWT or an unreadable token
 */
export const OU_SESSION_EXPIREE = ['api_401', 'jwt_expire', 'middleware']

/**
 * Sign-in page with the « session expirée » message, where it was caught and
 * the page to come back to (RG-08).
 * @param {string} chemin - path (and query) of the private page
 * @param {'api_401'|'jwt_expire'|'middleware'} ou
 * @returns {string}
 */
export function urlSessionExpiree(chemin, ou) {
	if (!OU_SESSION_EXPIREE.includes(ou))
		throw new Error(`ou inconnu : ${String(ou)}`)
	return `/auth/signin?error=session-expiree&ou=${ou}&callbackUrl=${encodeURIComponent(chemin)}`
}

/**
 * `where` of `session_expired` from the `?ou=` of the sign-in page: a value
 * of the catalogue, `api_401` otherwise (the older links carry no `ou`).
 * @param {unknown} brut
 * @returns {'api_401'|'jwt_expire'|'middleware'}
 */
export function ouSessionExpiree(brut) {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	return OU_SESSION_EXPIREE.includes(valeur) ? valeur : 'api_401'
}

/**
 * `Set-Cookie` values that delete the NextAuth session cookie and its chunks
 * (`.0`, `.1`…) among the cookie names sent by the browser.
 * @param {string[]} noms
 * @returns {string[]}
 */
export function cookiesSessionAEffacer(noms = []) {
	return noms
		.filter(nom => COOKIE_SESSION.test(nom))
		.map(
			nom =>
				`${nom}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${
					nom.startsWith('__Secure-') ? '; Secure' : ''
				}`
		)
}

const PAGES_SANS_RETOUR = [
	'/auth/signin',
	'/auth/signup',
	'/auth/error',
	'/api/',
]

/**
 * Where to go after signing in: the requested page when it is on this site,
 * the default page otherwise (other site, `//host`, `javascript:`, or an auth
 * page that would loop).
 * @param {unknown} brut - `callbackUrl` from the query string
 * @param {string} origine - origin of the site, e.g. https://my-makeup.fr
 * @param {string} [defaut]
 * @returns {string} path (with query and hash) on this site
 */
export function callbackUrlSure(brut, origine, defaut = '/auth/profil') {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	if (typeof valeur !== 'string' || valeur.trim() === '') return defaut
	try {
		const base = new URL(origine)
		// parsed, not compared as text: `//host`, `/\host`, tabs or
		// `javascript:` all end up with another origin
		const url = new URL(valeur.trim(), base)
		if (url.origin !== base.origin) return defaut
		if (PAGES_SANS_RETOUR.some(page => url.pathname.startsWith(page)))
			return defaut
		return `${url.pathname}${url.search}${url.hash}`
	} catch {
		return defaut
	}
}

const MOT = /^[a-z0-9_-]{1,40}$/

/**
 * One `[auth]` log line: event, code, duration and, for an unexpected error,
 * its kind. Never an email, a name, a token or an IP: anything that is not a
 * short lowercase word is replaced by `autre`.
 * @param {string} evt - e.g. `connexion`, `revalidation`, `session_expiree`
 * @param {{code?: string, ms?: number, cause?: string}} [details]
 * @returns {string}
 */
export function ligneLogAuth(evt, { code = 'ok', ms, cause } = {}) {
	const mot = valeur =>
		typeof valeur === 'string' && MOT.test(valeur) ? valeur : 'autre'
	let ligne = `[auth] evt=${mot(evt)} code=${mot(code)}`
	if (Number.isFinite(ms) && ms >= 0) ligne += ` ms=${Math.round(ms)}`
	if (cause !== undefined) ligne += ` cause=${mot(cause)}`
	return ligne
}

/**
 * Kind of an error reported by NextAuth's logger, for `cause=`: our own codes
 * (thrown as `Error(code)`) or the class name (`typeerror`…), lowercased.
 * @param {unknown} metadata - an Error, or `{ error }`
 * @returns {string|undefined}
 */
export function causeErreur(metadata) {
	const erreur = metadata instanceof Error ? metadata : metadata?.error
	if (!(erreur instanceof Error)) return undefined
	const nom = erreur.name === 'Error' ? erreur.message : erreur.name
	return String(nom).toLowerCase()
}
