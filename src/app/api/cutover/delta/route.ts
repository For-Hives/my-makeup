import config from '@payload-config'
import { getPayload } from 'payload'
import { isAdmin } from '@/lib/access'
import { lireLeDelta } from '@/lib/bascule/export-delta'
import { lieuDeLExport, methodeNonPermise, repondreAuDelta } from '@/lib/bascule/reponse-delta'

// Never prerendered, never cached: each request reads the database again.
export const dynamic = 'force-dynamic'

const RIEN_A_LIRE = {
	basculeLe: undefined,
	estAdmin: async () => false,
	lire: async () => {
		throw new Error('unreachable')
	},
	journal: () => undefined,
} as const

/**
 * The private export of what the v3 received since the switch (ticket 234; docs/migration/RETOUR-ARRIERE.md):
 * `GET /api/cutover/delta[?since=<instant>]`, for an admin signed in on the site. 403 anywhere else than the
 * site. This static segment wins over the catch-all REST route of Payload.
 */
export async function GET(request: Request): Promise<Response> {
	const lieu = lieuDeLExport()
	// Anywhere else than the site: refused before Payload is even started, nothing is read.
	if (lieu !== 'site') return repondreAuDelta(request, { ...RIEN_A_LIRE, lieu })
	const payload = await getPayload({ config })
	return repondreAuDelta(request, {
		lieu,
		basculeLe: process.env.BASCULE_LE,
		estAdmin: async () => {
			const { user } = await payload.auth({ headers: request.headers })
			return user ? isAdmin(user) : 'anonyme'
		},
		lire: depuis => lireLeDelta(payload, depuis),
		journal: ligne => payload.logger.info(ligne),
	})
}

export const POST = methodeNonPermise
export const PUT = methodeNonPermise
export const PATCH = methodeNonPermise
export const DELETE = methodeNonPermise
