import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { COLLECTION_PROS } from '../access'
import { SESSION_COOKIE } from './closed-dashboard'
import { expiredSessionUrl, signInUrl } from './return-to'
import { tokenExpiration } from './session-duration'
import { classifySession, type SessionState, tokenState, type Verification, verifySession } from './session-state'

/** What a page of the space may know about the makeup artist: never the account document. */
export interface Artist {
	id: number | string
	nom: string
	email: string
	/** When her session ends (Unix seconds), read from the cookie; nothing if the token did not come by the cookie. */
	expire: number | null
}

/** Thrown by the guard when the session cannot be checked: the error page of the space answers it. */
export class VerificationImpossible extends Error {
	constructor() {
		super('La session ne peut pas être vérifiée pour le moment.')
		this.name = 'VerificationImpossible'
	}
}

/** The state of the session and, when it is valid, who she is. */
export type ReadSession = { etat: 'connectee'; maquilleuse: Artist } | { etat: Exclude<SessionState, 'connectee'> }

/**
 * Asks Payload about a token that has not ended. A refusal (signature, session removed from the
 * database, an admin's token) is told apart from a failure: Payload's own strategy swallows every
 * error into « no user », so a refusal is only believed when the database answers a small query
 * right after. Otherwise the check could not be made, and nobody is signed out (U70).
 */
async function verify(): Promise<
	{ verification: 'acceptee'; maquilleuse: Artist } | { verification: Exclude<Verification, 'acceptee'> }
> {
	const result = await verifySession({
		authentifier: async () => {
			const requestHeaders = await headers()
			const payload = await getPayload({ config })
			return (await payload.auth({ headers: requestHeaders })).user
		},
		convient: user => user.collection === COLLECTION_PROS,
		sonder: async () => {
			const payload = await getPayload({ config })
			await payload.find({ collection: COLLECTION_PROS, depth: 0, limit: 1, pagination: false, select: {} })
		},
	})
	if (result.verification !== 'acceptee') return result
	const user = result.utilisateur as { id: number | string; nom?: string | null; email: unknown }
	return {
		verification: 'acceptee',
		maquilleuse: { id: user.id, nom: user.nom ?? '', email: String(user.email), expire: null },
	}
}

/**
 * The session of the request, told apart (see `session-state.ts`). The cookie's end date answers
 * `expiree` without any database; a token that has not ended is checked by Payload.
 */
export async function readSession(): Promise<ReadSession> {
	// Headers first: reading them makes the page dynamic, so that the build never starts Payload.
	const token = (await cookies()).get(SESSION_COOKIE)?.value
	const tokenStateOf = tokenState(token, Math.floor(Date.now() / 1000))
	if (tokenStateOf !== 'en-cours') return { etat: classifySession(tokenStateOf) as Exclude<SessionState, 'connectee'> }
	const verified = await verify()
	if (verified.verification === 'acceptee')
		return { etat: 'connectee', maquilleuse: { ...verified.maquilleuse, expire: tokenExpiration(token) } }
	return { etat: classifySession(tokenStateOf, verified.verification) as Exclude<SessionState, 'connectee'> }
}

/**
 * The makeup artist behind the request, or nothing. The one predicate of the space: the guard of a
 * private page and the « already signed in » test of the sign-in page both use it, so that they
 * can never disagree and send the visitor back and forth. A token is valid only when Payload
 * accepts it (signature, expiry, session in the database) AND it belongs to a makeup artist: an
 * admin's token, which has the same cookie name, is no session of the space.
 */
export async function signedInArtist(): Promise<Artist | null> {
	const session = await readSession()
	return session.etat === 'connectee' ? session.maquilleuse : null
}

/**
 * The guard of a private page: the makeup artist, or one redirection to the sign-in page that
 * brings her back to `chemin` (the path of the page, with its query), with the « session expirée »
 * message when her session ended. When the session cannot be checked, nothing is redirected and
 * nobody is signed out: the error page of the space answers. Call it first in every page of the
 * space: a layout does not run again on a client-side navigation.
 */
export async function requireArtist(chemin: string): Promise<Artist> {
	const session = await readSession()
	switch (session.etat) {
		case 'connectee':
			return session.maquilleuse
		case 'expiree':
			return redirect(expiredSessionUrl(chemin))
		case 'indisponible':
			throw new VerificationImpossible()
		default:
			return redirect(signInUrl(chemin))
	}
}
