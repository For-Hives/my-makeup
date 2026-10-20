import config from '@payload-config'
import { getPayload } from 'payload'
import { isAdmin } from '@/lib/access'
import { exportPlace, methodNotAllowed, respondToDelta } from '@/lib/cutover/delta-response'
import { readDelta } from '@/lib/cutover/export-delta'

// Never prerendered, never cached: each request reads the database again.
export const dynamic = 'force-dynamic'

const RIEN_A_LIRE = {
	cutoverDate: undefined,
	isAdmin: async () => false,
	read: async () => {
		throw new Error('unreachable')
	},
	log: () => undefined,
} as const

/**
 * The private export of what the v3 received since the switch (ticket 234; docs/migration/RETOUR-ARRIERE.md):
 * `GET /api/cutover/delta[?since=<instant>]`, for an admin signed in on the site. 403 anywhere else than the
 * site. This static segment wins over the catch-all REST route of Payload.
 */
export async function GET(request: Request): Promise<Response> {
	const lieu = exportPlace()
	// Anywhere else than the site: refused before Payload is even started, nothing is read.
	if (lieu !== 'site') return respondToDelta(request, { ...RIEN_A_LIRE, place: lieu })
	const payload = await getPayload({ config })
	return respondToDelta(request, {
		place: lieu,
		cutoverDate: process.env.CUTOVER_DATE,
		isAdmin: async () => {
			const { user } = await payload.auth({ headers: request.headers })
			return user ? isAdmin(user) : 'anonyme'
		},
		read: depuis => readDelta(payload, depuis),
		log: ligne => payload.logger.info(ligne),
	})
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
