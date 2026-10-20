import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { COLLECTION_PROS } from '../access'
import type { DashboardUser } from './my-profile'

/** The session of the request as a user of Payload, or nothing: for a page and an action of the space. */
export async function requestUser(): Promise<{
	payload: Payload
	utilisateur: DashboardUser
} | null> {
	const payload = await getPayload({ config })
	const { user } = await payload.auth({ headers: await headers() })
	return user?.collection === COLLECTION_PROS ? { payload, utilisateur: user } : null
}
