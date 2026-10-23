/**
 * The answers of GET /api/stats/weekly (ticket 149), with what they read given by the caller: the
 * route wires the real token and the real database, a test wires its own.
 */

import { type Period, readPeriod, tokenValid, type WeeklyStats } from '@/lib/weekly-stats'

/** Never cached, never indexed, whatever the status. */
export const STATS_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

const refusal = (status: number, error: string, extra: Record<string, string> = {}): Response =>
	Response.json({ error }, { status, headers: { ...STATS_HEADERS, ...extra } })

export async function respondToStats(
	request: Request,
	lecture: { jeton: string | undefined; lire: (periode: Period) => Promise<WeeklyStats> }
): Promise<Response> {
	if (!tokenValid(request.headers.get('authorization'), lecture.jeton))
		return refusal(401, 'Jeton de service absent ou refusé.', { 'WWW-Authenticate': 'Bearer' })
	const period = readPeriod(new URL(request.url).searchParams)
	if (!period)
		return refusal(400, 'Période illisible : from et to sont deux instants ISO 8601, from avant to, 92 jours au plus.')
	return Response.json(await lecture.lire(period), { headers: STATS_HEADERS })
}

/** Any other verb: 405, with the same headers, so nothing of the answer is ever cached. */
export const methodNotAllowed = (): Response => refusal(405, 'Méthode non permise.', { Allow: 'GET' })
