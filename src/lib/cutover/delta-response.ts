import { SITE_ORIGIN } from '../env'
import { type DeltaExport, deltaAsText, deltaLog } from './export-delta'

/**
 * The answer of GET /api/cutover/delta (ticket 234): the private export of what the v3 received since the
 * switch, for an admin signed in on the site, and for nobody else. What it reads and who is asking are given
 * by the caller: the route wires the real database and the real session, a test wires its own.
 *
 * - **The site only**: `NODE_ENV=production`, `APP_ENV=prod` and `NEXT_PUBLIC_SITE_URL` the site. Anywhere
 *   else (a workstation, the test bench, a build served locally) the answer is a 403 and nothing is read.
 * - **No database opened, no SSH**: the admin downloads it with the browser she is already signed in with.
 * - **The start**: `?since=<instant ISO 8601>`, else the start (00:00 UTC) of the day `CUTOVER_DATE`.
 * - Never cached, never indexed; the file is an attachment. The log holds counts and numeric identifiers only.
 */

/** Where the process runs: the site, or anywhere else. */
export type ExportPlace = 'site' | 'autre'

export const DELTA_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

export interface PlaceVariables {
	APP_ENV?: string | undefined
	NEXT_PUBLIC_SITE_URL?: string | undefined
	NODE_ENV?: string | undefined
}

export function exportPlace(variables: PlaceVariables = process.env): ExportPlace {
	return variables.NODE_ENV === 'production' &&
		variables.APP_ENV?.trim() === 'prod' &&
		variables.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
		? 'site'
		: 'autre'
}

/** The start of the day of the switch (00:00 UTC), or nothing when `CUTOVER_DATE` is unset or not a real date. */
export function cutoverStart(basculeLe: string | undefined): Date | undefined {
	const text = basculeLe?.trim()
	if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined
	const start = new Date(`${text}T00:00:00Z`)
	return Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== text ? undefined : start
}

/** An instant written as ISO 8601 with its zone, else nothing. */
export function readInstant(texte: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(texte)) return undefined
	const date = new Date(texte)
	return Number.isNaN(date.getTime()) ? undefined : date
}

const refusal = (status: number, error: string): Response =>
	Response.json({ error }, { status, headers: DELTA_HEADERS })

export interface DeltaReading {
	place: ExportPlace
	cutoverDate: string | undefined
	/** True when the request comes from a signed-in admin. */
	isAdmin: () => Promise<boolean | 'anonyme'>
	read: (depuis: Date) => Promise<DeltaExport>
	log: (ligne: string) => void
}

export async function respondToDelta(request: Request, lecture: DeltaReading): Promise<Response> {
	if (lecture.place !== 'site')
		return refusal(403, 'L’export du delta ne se donne que sur le site en ligne. Rien n’a été lu.')
	const admin = await lecture.isAdmin()
	if (admin === 'anonyme')
		return refusal(401, 'Connecte-toi à /admin avec un compte admin, puis recharge cette adresse.')
	if (!admin) return refusal(403, 'Seul un compte admin peut télécharger cet export.')
	const sinceText = new URL(request.url).searchParams.get('since')
	const since = sinceText === null ? cutoverStart(lecture.cutoverDate) : readInstant(sinceText)
	if (!since)
		return refusal(
			400,
			sinceText === null
				? 'CUTOVER_DATE n’est pas réglée : donne le début avec ?since=<instant ISO 8601, avec son fuseau>.'
				: 'since est un instant ISO 8601 avec son fuseau, comme 2026-11-02T08:30:00Z.'
		)
	const delta = await lecture.read(since)
	for (const row of deltaLog(delta)) lecture.log(row)
	const day = delta.since.slice(0, 10)
	return new Response(deltaAsText(delta), {
		headers: {
			...DELTA_HEADERS,
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="delta-since-${day}.json"`,
		},
	})
}

/** Any other verb: 405. */
export const methodNotAllowed = (): Response =>
	Response.json({ error: 'Méthode non permise.' }, { status: 405, headers: { ...DELTA_HEADERS, Allow: 'GET' } })
