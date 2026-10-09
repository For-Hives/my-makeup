/**
 * Calls from the Next server to Strapi's users-permissions (A1, A3): sign-in,
 * sign-up, Google token exchange and session check. Every failure becomes an
 * `ErreurAuth` whose message is a stable code (`auth-erreurs.js`): NextAuth
 * passes that message as `?error=`, so no Strapi text and no TypeError reach
 * the visitor. `fetchImpl` is injectable for the tests.
 */

import { codeErreurOAuth, codeErreurStrapi } from './auth-erreurs.js'
import { DELAI_REVALIDATION_MS, DELAI_STRAPI_MS } from './auth-session.js'

export class ErreurAuth extends Error {
	/** @param {string} code - one of CODES_ERREUR */
	constructor(code) {
		super(code)
		this.name = 'ErreurAuth'
		this.code = code
	}
}

const ENTETES = {
	Accept: 'application/json',
	'Content-Type': 'application/json',
}

async function lireJson(reponse) {
	try {
		return await reponse.json()
	} catch {
		return null
	}
}

/**
 * Sign-in with Strapi's local provider, or sign-up when `name` is set.
 * @param {object} options
 * @param {string} options.api - Strapi base URL
 * @param {string} options.email
 * @param {string} options.password
 * @param {string} [options.name] - account name, sign-up only
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.delaiMs]
 * @returns {Promise<{id: number, name: string, email: string, jwt: string}>}
 * @throws {ErreurAuth}
 */
export async function authentifierStrapi({ api, email, password, name, fetchImpl = fetch, delaiMs = DELAI_STRAPI_MS }) {
	const identifiant = typeof email === 'string' ? email.trim() : ''
	const nom = typeof name === 'string' ? name.trim() : ''
	if (!identifiant || typeof password !== 'string' || password === '') throw new ErreurAuth('identifiants-invalides')

	const inscription = nom !== ''
	const corps = inscription ? { username: nom, email: identifiant, password } : { identifier: identifiant, password }

	let reponse
	try {
		reponse = await fetchImpl(`${api}/api/auth/local${inscription ? '/register' : ''}`, {
			method: 'POST',
			headers: ENTETES,
			body: JSON.stringify(corps),
			signal: AbortSignal.timeout(delaiMs),
		})
	} catch {
		throw new ErreurAuth('service-indisponible')
	}

	const donnees = await lireJson(reponse)
	// sign-up with email confirmation on: Strapi answers the user, no JWT
	if (reponse.ok && donnees?.user && !donnees.jwt) throw new ErreurAuth('email-non-confirme')
	if (!(reponse.ok && donnees?.jwt && donnees?.user?.id))
		throw new ErreurAuth(codeErreurStrapi(reponse.status, donnees?.error?.message))

	return {
		id: donnees.user.id,
		name: donnees.user.username,
		email: donnees.user.email,
		jwt: donnees.jwt,
	}
}

/**
 * Exchanges an OAuth access token (Google) for a Strapi JWT.
 * @param {object} options
 * @param {string} options.api
 * @param {string} options.provider - e.g. `google`
 * @param {string} options.accessToken
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.delaiMs]
 * @returns {Promise<{id: number, jwt: string}>}
 * @throws {ErreurAuth}
 */
export async function connexionStrapiOAuth({
	api,
	provider,
	accessToken,
	fetchImpl = fetch,
	delaiMs = DELAI_STRAPI_MS,
}) {
	if (typeof accessToken !== 'string' || accessToken === '') throw new ErreurAuth('service-indisponible')

	let reponse
	try {
		reponse = await fetchImpl(
			`${api}/api/auth/${encodeURIComponent(provider)}/callback?access_token=${encodeURIComponent(accessToken)}`,
			{ headers: ENTETES, signal: AbortSignal.timeout(delaiMs) }
		)
	} catch {
		throw new ErreurAuth('service-indisponible')
	}

	const donnees = await lireJson(reponse)
	if (!(reponse.ok && donnees?.jwt && donnees?.user?.id))
		throw new ErreurAuth(codeErreurOAuth(reponse.status, donnees?.error?.message))

	return { id: donnees.user.id, jwt: donnees.jwt }
}

/**
 * HTTP status of `GET /api/users/me` for a Strapi JWT, 0 when Strapi could
 * not be reached in time.
 * @param {object} options
 * @param {string} options.api
 * @param {string} options.jwt
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.delaiMs]
 * @returns {Promise<number>}
 */
export async function statutCompteStrapi({ api, jwt, fetchImpl = fetch, delaiMs = DELAI_REVALIDATION_MS }) {
	try {
		const reponse = await fetchImpl(`${api}/api/users/me`, {
			headers: { ...ENTETES, Authorization: `Bearer ${jwt}` },
			signal: AbortSignal.timeout(delaiMs),
		})
		// the body is not needed: release the connection
		reponse.body?.cancel().catch(() => {
			// Cancellation is best-effort; the HTTP status remains authoritative.
		})
		return reponse.status
	} catch {
		return 0
	}
}
