/**
 * The answers of GET /api/stats/weekly (ticket 149), with what they read given by the caller: the
 * route wires the real token and the real database, a test wires its own.
 */

import { jetonValide, lirePeriode, type Periode, type StatsHebdo } from '@/lib/stats-hebdo'

/** Never cached, never indexed, whatever the status. */
export const ENTETES_STATS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

const refus = (status: number, error: string, extra: Record<string, string> = {}): Response =>
	Response.json({ error }, { status, headers: { ...ENTETES_STATS, ...extra } })

export async function repondreAuxStats(
	request: Request,
	lecture: { jeton: string | undefined; lire: (periode: Periode) => Promise<StatsHebdo> }
): Promise<Response> {
	if (!jetonValide(request.headers.get('authorization'), lecture.jeton))
		return refus(401, 'Jeton de service absent ou refusé.', { 'WWW-Authenticate': 'Bearer' })
	const periode = lirePeriode(new URL(request.url).searchParams)
	if (!periode)
		return refus(400, 'Période illisible : from et to sont deux instants ISO 8601, from avant to, 92 jours au plus.')
	return Response.json(await lecture.lire(periode), { headers: ENTETES_STATS })
}

/** Any other verb: 405, with the same headers, so nothing of the answer is ever cached. */
export const methodeNonPermise = (): Response => refus(405, 'Méthode non permise.', { Allow: 'GET' })
