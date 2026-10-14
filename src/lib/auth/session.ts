import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { COLLECTION_PROS } from '../acces'
import { COOKIE_DE_SESSION } from './espace-ferme'
import { classerLaSession, type EtatDeSession, etatDuJeton, type Verification } from './etat-session'
import { urlDeConnexion, urlSessionExpiree } from './retour'

/** What a page of the space may know about the makeup artist: never the account document. */
export interface Maquilleuse {
	id: number | string
	nom: string
	email: string
}

/** Thrown by the guard when the session cannot be checked: the error page of the space answers it. */
export class VerificationImpossible extends Error {
	constructor() {
		super('La session ne peut pas être vérifiée pour le moment.')
		this.name = 'VerificationImpossible'
	}
}

/** The state of the session and, when it is valid, who she is. */
export type SessionLue = { etat: 'connectee'; maquilleuse: Maquilleuse } | { etat: Exclude<EtatDeSession, 'connectee'> }

/**
 * Asks Payload about a token that has not ended. A refusal (signature, session removed from the
 * database, an admin's token) is told apart from a failure: Payload's own strategy swallows every
 * error into « no user », so a refusal is only believed when the database answers a small query
 * right after. Otherwise the check could not be made, and nobody is signed out (U70).
 */
async function verifier(): Promise<
	{ verification: 'acceptee'; maquilleuse: Maquilleuse } | { verification: Exclude<Verification, 'acceptee'> }
> {
	try {
		const entetes = await headers()
		const payload = await getPayload({ config })
		const { user } = await payload.auth({ headers: entetes })
		if (user) {
			if (user.collection !== COLLECTION_PROS) return { verification: 'refusee' }
			return { verification: 'acceptee', maquilleuse: { id: user.id, nom: user.nom ?? '', email: String(user.email) } }
		}
		await payload.find({ collection: COLLECTION_PROS, depth: 0, limit: 1, pagination: false, select: {} })
		return { verification: 'refusee' }
	} catch {
		return { verification: 'panne' }
	}
}

/**
 * The session of the request, told apart (see `etat-session.ts`). The cookie's end date answers
 * `expiree` without any database; a token that has not ended is checked by Payload.
 */
export async function lireLaSession(): Promise<SessionLue> {
	// Headers first: reading them makes the page dynamic, so that the build never starts Payload.
	const jeton = (await cookies()).get(COOKIE_DE_SESSION)?.value
	const etatDuToken = etatDuJeton(jeton, Math.floor(Date.now() / 1000))
	if (etatDuToken !== 'en-cours') return { etat: classerLaSession(etatDuToken) as Exclude<EtatDeSession, 'connectee'> }
	const verifie = await verifier()
	if (verifie.verification === 'acceptee') return { etat: 'connectee', maquilleuse: verifie.maquilleuse }
	return { etat: classerLaSession(etatDuToken, verifie.verification) as Exclude<EtatDeSession, 'connectee'> }
}

/**
 * The makeup artist behind the request, or nothing. The one predicate of the space: the guard of a
 * private page and the « already signed in » test of the sign-in page both use it, so that they
 * can never disagree and send the visitor back and forth. A token is valid only when Payload
 * accepts it (signature, expiry, session in the database) AND it belongs to a makeup artist: an
 * admin's token, which has the same cookie name, is no session of the space.
 */
export async function maquilleuseConnectee(): Promise<Maquilleuse | null> {
	const session = await lireLaSession()
	return session.etat === 'connectee' ? session.maquilleuse : null
}

/**
 * The guard of a private page: the makeup artist, or one redirection to the sign-in page that
 * brings her back to `chemin` (the path of the page, with its query), with the « session expirée »
 * message when her session ended. When the session cannot be checked, nothing is redirected and
 * nobody is signed out: the error page of the space answers. Call it first in every page of the
 * space: a layout does not run again on a client-side navigation.
 */
export async function exigerMaquilleuse(chemin: string): Promise<Maquilleuse> {
	const session = await lireLaSession()
	switch (session.etat) {
		case 'connectee':
			return session.maquilleuse
		case 'expiree':
			return redirect(urlSessionExpiree(chemin))
		case 'indisponible':
			throw new VerificationImpossible()
		default:
			return redirect(urlDeConnexion(chemin))
	}
}
