import config from '@payload-config'
import { getPayload } from 'payload'
import { statsTokenFromEnv } from '@/lib/env'
import { methodeNonPermise, repondreAuxStats } from '@/services/mesure/reponse-stats'
import { lireLesStatsHebdo } from '@/services/mesure/stats-hebdo'

// Never prerendered, never cached: each request reads the database again.
export const dynamic = 'force-dynamic'

/**
 * The weekly statistics of the report of the owner (ticket 149; plan 04 §3.6): aggregates only,
 * behind a service token. `GET /api/stats/weekly?from=<instant>&to=<instant>`, the token in
 * `Authorization: Bearer`. 401 without it (also when the server has no token set), 400 for a
 * period that cannot be read. This static segment wins over the catch-all REST route of Payload.
 */
export function GET(request: Request): Promise<Response> {
	return repondreAuxStats(request, {
		jeton: statsTokenFromEnv(),
		lire: async periode => lireLesStatsHebdo(await getPayload({ config }), periode),
	})
}

export const POST = methodeNonPermise
export const PUT = methodeNonPermise
export const PATCH = methodeNonPermise
export const DELETE = methodeNonPermise
