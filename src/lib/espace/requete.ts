import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { COLLECTION_PROS } from '../acces'
import type { UtilisateurDeLEspace } from './mon-profil'

/** The session of the request as a user of Payload, or nothing: for a page and an action of the space. */
export async function utilisatriceDeLaRequete(): Promise<{
	payload: Payload
	utilisateur: UtilisateurDeLEspace
} | null> {
	const payload = await getPayload({ config })
	const { user } = await payload.auth({ headers: await headers() })
	return user?.collection === COLLECTION_PROS ? { payload, utilisateur: user } : null
}
