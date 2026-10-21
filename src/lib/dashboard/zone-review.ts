/**
 * The review of a zone, as her space shows it (ticket 265; PLAN-ZONES.md §3.3). The import leaves it
 * on a profile whose zone it could not decide (`zoneReview`): the postal code that several communes
 * share, and those communes. The banner of her space offers them; the server empties the review as
 * soon as a zone is saved (ticket 259).
 *
 * The review is private (the owner and an admin read it) and is a JSON column: it is read here
 * without trusting its shape, and what reaches the browser is a postal code and the communes as
 * « Annequin (62) » with their INSEE code, nothing else. Whatever text the old site held is never in it.
 */

import { z } from 'zod'
import { departmentOfInseeCode } from '../profile/zone'
import { cityLabel } from './location'

/** A commune the banner proposes: its code (what a tap sends) and its label. */
export interface ReviewCandidate {
	readonly codeInsee: string
	readonly libelle: string
}

/** What the banner needs: the postal code when it is the reason, and the communes it can offer. */
export interface ZoneReviewView {
	readonly codePostal: string | null
	readonly communes: readonly ReviewCandidate[]
}

/** The most communes a banner offers: a postal code covers a handful. */
export const REVIEW_CANDIDATES_MAX = 12

const CANDIDATE = z.object({
	inseeCode: z.string(),
	name: z.string().trim().min(1),
	department: z.string().nullish(),
})

/** The review of a stored profile, or null when it has none (no reason written, or emptied by a save). */
export function zoneReviewView(review: unknown): ZoneReviewView | null {
	if (typeof review !== 'object' || review === null) return null
	const { reason, postalCode, candidates } = review as Record<string, unknown>
	if (typeof reason !== 'string' || reason === '') return null
	const rows = Array.isArray(candidates) ? candidates : []
	const seen = new Set<string>()
	const found: ReviewCandidate[] = []
	for (const row of rows) {
		const parsed = CANDIDATE.safeParse(row)
		if (!parsed.success || seen.has(parsed.data.inseeCode)) continue
		const department = departmentOfInseeCode(parsed.data.inseeCode)
		// A code the collection would refuse is not a commune we can send back.
		if (department === null) continue
		seen.add(parsed.data.inseeCode)
		found.push({
			codeInsee: parsed.data.inseeCode,
			libelle: cityLabel({ nom: parsed.data.name, departement: department }),
		})
		if (found.length === REVIEW_CANDIDATES_MAX) break
	}
	return {
		codePostal: typeof postalCode === 'string' && /^\d{5}$/.test(postalCode) ? postalCode : null,
		communes: found,
	}
}

/** The sentence at the top of the banner. */
export function reviewMessage({ codePostal, communes }: ZoneReviewView): string {
	return codePostal !== null && communes.length > 0
		? `Ta commune reste à préciser : le code postal ${codePostal} couvre ${communes.length} commune${communes.length > 1 ? 's' : ''}. Choisis la tienne.`
		: 'Ta zone n’a pas pu être reprise de l’ancien site : écris ta commune, ou indique le pays où tu travailles.'
}

/** The communes the banner shows as buttons: only next to a postal code they share. */
export function reviewButtons({ codePostal, communes }: ZoneReviewView): readonly ReviewCandidate[] {
	return codePostal !== null ? communes : []
}
