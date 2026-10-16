import { SITE_ORIGIN } from '../env'
import { deltaEnTexte, type ExportDuDelta, journalDuDelta } from './export-delta'

/**
 * The answer of GET /api/bascule/delta (ticket 234): the private export of what the v3 received since the
 * switch, for an admin signed in on the site, and for nobody else. What it reads and who is asking are given
 * by the caller: the route wires the real database and the real session, a test wires its own.
 *
 * - **The site only**: `NODE_ENV=production`, `APP_ENV=prod` and `NEXT_PUBLIC_SITE_URL` the site. Anywhere
 *   else (a workstation, the test bench, a build served locally) the answer is a 403 and nothing is read.
 * - **No database opened, no SSH**: the admin downloads it with the browser she is already signed in with.
 * - **The start**: `?depuis=<instant ISO 8601>`, else the start (00:00 UTC) of the day `BASCULE_LE`.
 * - Never cached, never indexed; the file is an attachment. The log holds counts and numeric identifiers only.
 */

/** Where the process runs: the site, or anywhere else. */
export type LieuDeLExport = 'site' | 'autre'

export const ENTETES_DU_DELTA = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

export interface VariablesDuLieu {
	APP_ENV?: string | undefined
	NEXT_PUBLIC_SITE_URL?: string | undefined
	NODE_ENV?: string | undefined
}

export function lieuDeLExport(variables: VariablesDuLieu = process.env): LieuDeLExport {
	return variables.NODE_ENV === 'production' &&
		variables.APP_ENV?.trim() === 'prod' &&
		variables.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
		? 'site'
		: 'autre'
}

/** The start of the day of the switch (00:00 UTC), or nothing when `BASCULE_LE` is unset or not a real date. */
export function debutDeLaBascule(basculeLe: string | undefined): Date | undefined {
	const texte = basculeLe?.trim()
	if (!texte || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return undefined
	const debut = new Date(`${texte}T00:00:00Z`)
	return Number.isNaN(debut.getTime()) || debut.toISOString().slice(0, 10) !== texte ? undefined : debut
}

/** An instant written as ISO 8601 with its zone, else nothing. */
export function lireLInstant(texte: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(texte)) return undefined
	const date = new Date(texte)
	return Number.isNaN(date.getTime()) ? undefined : date
}

const refus = (status: number, error: string): Response =>
	Response.json({ error }, { status, headers: ENTETES_DU_DELTA })

export interface LectureDuDelta {
	lieu: LieuDeLExport
	basculeLe: string | undefined
	/** True when the request comes from a signed-in admin. */
	estAdmin: () => Promise<boolean | 'anonyme'>
	lire: (depuis: Date) => Promise<ExportDuDelta>
	journal: (ligne: string) => void
}

export async function repondreAuDelta(request: Request, lecture: LectureDuDelta): Promise<Response> {
	if (lecture.lieu !== 'site')
		return refus(403, 'L’export du delta ne se donne que sur le site en ligne. Rien n’a été lu.')
	const admin = await lecture.estAdmin()
	if (admin === 'anonyme') return refus(401, 'Connecte-toi à /admin avec un compte admin, puis recharge cette adresse.')
	if (!admin) return refus(403, 'Seul un compte admin peut télécharger cet export.')
	const demande = new URL(request.url).searchParams.get('depuis')
	const depuis = demande === null ? debutDeLaBascule(lecture.basculeLe) : lireLInstant(demande)
	if (!depuis)
		return refus(
			400,
			demande === null
				? 'BASCULE_LE n’est pas réglée : donne le début avec ?depuis=<instant ISO 8601, avec son fuseau>.'
				: 'depuis est un instant ISO 8601 avec son fuseau, comme 2026-11-02T08:30:00Z.'
		)
	const delta = await lecture.lire(depuis)
	for (const ligne of journalDuDelta(delta)) lecture.journal(ligne)
	const jour = delta.depuis.slice(0, 10)
	return new Response(deltaEnTexte(delta), {
		headers: {
			...ENTETES_DU_DELTA,
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="delta-depuis-${jour}.json"`,
		},
	})
}

/** Any other verb: 405. */
export const methodeNonPermise = (): Response =>
	Response.json({ error: 'Méthode non permise.' }, { status: 405, headers: { ...ENTETES_DU_DELTA, Allow: 'GET' } })
