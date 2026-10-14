import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { COLLECTION_PROS } from '../acces'
import { urlDeConnexion } from './retour'

/** What a page of the space may know about the makeup artist: never the account document. */
export interface Maquilleuse {
	id: number | string
	nom: string
	email: string
}

/**
 * The makeup artist behind the request, or nothing. The one predicate of the space: the guard of a
 * private page and the « already signed in » test of the sign-in page both use it, so that they
 * can never disagree and send the visitor back and forth. A token is valid only when Payload
 * accepts it (signature, expiry, session in the database) AND it belongs to a makeup artist: an
 * admin's token, which has the same cookie name, is no session of the space.
 */
export async function maquilleuseConnectee(): Promise<Maquilleuse | null> {
	// Headers first: reading them makes the page dynamic, so that the build never starts Payload.
	const entetes = await headers()
	const payload = await getPayload({ config })
	const { user } = await payload.auth({ headers: entetes })
	if (!user || user.collection !== COLLECTION_PROS) return null
	return { id: user.id, nom: user.nom ?? '', email: String(user.email) }
}

/**
 * The guard of a private page: the makeup artist, or one redirection to the sign-in page that
 * brings her back to `chemin` (the path of the page, with its query). Call it first in every page
 * of the space: a layout does not run again on a client-side navigation.
 */
export async function exigerMaquilleuse(chemin: string): Promise<Maquilleuse> {
	const maquilleuse = await maquilleuseConnectee()
	if (!maquilleuse) redirect(urlDeConnexion(chemin))
	return maquilleuse
}
