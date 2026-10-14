import { AuthenticationError } from 'payload'
import type { CodeErreur } from './erreurs'
import { type Frein, freinDeConnexion } from './frein'
import { ipClient } from './ip-client'
import type { JetonDeSession } from './jeton'

/** A password longer than this is refused as wrong: hashing it would cost more than it proves. */
export const MOT_DE_PASSE_MAX = 1024

export type ResultatConnexion = { ok: true; token: string } | { ok: false; code: CodeErreur }

export interface EntreesDeConnexion {
	/** Signs the makeup artist in and gives the token back (`ouvrirParMotDePasse`). */
	ouvrir: (data: { email: string; password: string }) => Promise<JetonDeSession>
	headers: Headers
	email: unknown
	password: unknown
	frein?: Frein
	maintenant?: number
}

const estTexte = (valeur: unknown): valeur is string => typeof valeur === 'string'

/**
 * The sign-in of a makeup artist by email and password.
 *
 * - Braked by client address before anything is checked (ticket 076); the place is given back when
 *   the sign-in succeeds.
 * - No composition rule on the password: an old account has one the sign-up rule would refuse
 *   (AUTH-11). The email is trimmed and lower-cased by Payload.
 * - Every refusal of the account (unknown address, wrong password, address not confirmed) gives the
 *   same code: nothing says which one it is. The Local API is called with no `req`, so Payload's
 *   own brake hook (REST door) does not count this attempt a second time.
 * - Gives back the token for the caller to put in the cookie. It never gives back the account.
 */
export async function connecter({
	ouvrir,
	headers,
	email,
	password,
	frein = freinDeConnexion,
	maintenant,
}: EntreesDeConnexion): Promise<ResultatConnexion> {
	const cle = ipClient(headers)
	const decision = frein.prendre(cle, maintenant)
	if (!decision.autorise) return { ok: false, code: 'trop-de-tentatives' }

	if (
		!estTexte(email) ||
		!estTexte(password) ||
		email.trim() === '' ||
		password === '' ||
		password.length > MOT_DE_PASSE_MAX
	)
		return { ok: false, code: 'identifiants-invalides' }

	try {
		const { token } = await ouvrir({ email, password })
		if (!token) return { ok: false, code: 'service-indisponible' }
		frein.rendre(cle, maintenant)
		return { ok: true, token }
	} catch (erreur) {
		// Every error Payload raises for a refused account is a 4xx; anything else is ours to report.
		const statut = (erreur as { status?: number }).status
		if (erreur instanceof AuthenticationError || (statut !== undefined && statut >= 400 && statut < 500))
			return { ok: false, code: 'identifiants-invalides' }
		// Not the visitor's failure: the place goes back.
		frein.rendre(cle, maintenant)
		return { ok: false, code: 'service-indisponible' }
	}
}
