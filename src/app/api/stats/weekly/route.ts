import config from '@payload-config'
import { getPayload } from 'payload'
import { statsTokenFromEnv } from '@/lib/env'
import { methodNotAllowed, respondToStats } from '@/services/analytics/stats-response'
import { readWeeklyStats } from '@/services/analytics/weekly-stats'

// Never prerendered, never cached: each request reads the database again.
export const dynamic = 'force-dynamic'

/**
 * The weekly statistics of the report of the owner (ticket 149; plan 04 §3.6): aggregates only,
 * behind a service token. `GET /api/stats/weekly?from=<instant>&to=<instant>`, the token in
 * `Authorization: Bearer`. 401 without it (also when the server has no token set), 400 for a
 * period that cannot be read. This static segment wins over the catch-all REST route of Payload.
 */
export function GET(request: Request): Promise<Response> {
	return respondToStats(request, {
		jeton: statsTokenFromEnv(),
		lire: async periode => readWeeklyStats(await getPayload({ config }), periode),
	})
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
