import { DEPARTMENTS } from '../departments'
import { slugify } from '../slug'

/**
 * The pages « maquilleuse près de chez vous », one by département (ticket 1015; plan 03 SEO-23, SEO-30).
 *
 * One rule decides everything about a zone: its page, its robots tag, its line in the sitemap and in the plan of
 * the site. The sitemap and the page both count the profiles that are publishable AND listed (neither
 * unavailable nor hidden nor entirely empty), and the page shows exactly those, so a page is never indexed with
 * fewer than three of them in front of the reader.
 *
 * - 0 profiles: no page (404), never an empty one.
 * - 1 or 2 profiles: the page answers 200 in noindex, with no canonical address, and stays out of the sitemap.
 * - 3 or more: the page is indexable and in the sitemap. When a zone falls back under 3 it turns noindex and
 *   leaves the sitemap by itself, at the next refresh of the pages, with no deletion.
 *
 * A zone abroad is no zone (its profiles have no département). The profiles of the zone are the ones whose
 * commune is in the département; those who only travel there (a radius) are not counted: a wider rule would
 * count a page's profiles on a claim the page cannot show.
 *
 * No `next` import: the module is pure, and the tests read it without Next.
 */

/** The number of profiles from which a zone page is indexed. */
export const ZONE_THRESHOLD = 3

/** The base of the addresses of the zone pages. */
export const ZONE_BASE_PATH = '/maquilleuses'

/** What the rule needs of a profile, whichever read gave it. */
export interface ZoneProfile {
	slug: string
	/** The code of the département of her commune, or `null` (no commune, or a zone abroad). */
	departement: string | null
	/** The six conditions of a publishable profile (src/lib/profile/completeness.ts). */
	publishable: boolean
	/** Neither unavailable, nor hidden, nor entirely empty (src/lib/profile/visibility.ts). */
	listed: boolean
	/** The ISO date of her last change, when known. */
	misAJourLe?: string | null
}

export type ZoneStatus = 'absent' | 'below' | 'indexable'

/** What a zone with this many profiles is: no page, a page in noindex, or an indexable page. */
export function zoneStatus(count: number): ZoneStatus {
	if (count <= 0) return 'absent'
	return count < ZONE_THRESHOLD ? 'below' : 'indexable'
}

/** The profiles a zone page shows and counts. */
export function zoneMembers<T extends ZoneProfile>(profils: readonly T[], code: string): T[] {
	return profils.filter(profil => profil.publishable && profil.listed && profil.departement === code)
}

/**
 * The address segment of a département: its name written as a slug (« haute-savoie »). This is the one place
 * that decides it: an indexed address sticks, so changing it later means a permanent redirection.
 */
export function departmentSlug(code: string): string {
	return slugify(DEPARTMENTS[code] ?? '')
}

const CODE_BY_SLUG: ReadonlyMap<string, string> = new Map(
	Object.keys(DEPARTMENTS).map(code => [departmentSlug(code), code])
)

/** The code of the département an address segment names, or `null`. */
export function departmentFromSlug(segment: string): string | null {
	return CODE_BY_SLUG.get(segment) ?? null
}

/** The name of a département, or an empty text. */
export const departmentName = (code: string): string => DEPARTMENTS[code] ?? ''

/** The path of the page of a zone, with no final slash. */
export const zonePath = (code: string): string => `${ZONE_BASE_PATH}/${departmentSlug(code)}`

/** An indexable zone, as the sitemap and the plan of the site list it. */
export interface IndexableZone {
	code: string
	slug: string
	name: string
	count: number
	/** The latest change among her profiles, or `null` when none is known. */
	misAJourLe: string | null
}

const latest = (dates: readonly (string | null | undefined)[]): string | null => {
	const known = dates.filter((date): date is string => typeof date === 'string' && !Number.isNaN(Date.parse(date)))
	return known.length === 0 ? null : known.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
}

/** The zones that have the threshold, by address. */
export function indexableZones(profils: readonly ZoneProfile[]): IndexableZone[] {
	const codes = new Set(
		profils.flatMap(({ departement }) => (departement && DEPARTMENTS[departement] ? [departement] : []))
	)
	return [...codes]
		.flatMap(code => {
			const members = zoneMembers(profils, code)
			return zoneStatus(members.length) === 'indexable'
				? [
						{
							code,
							slug: departmentSlug(code),
							name: departmentName(code),
							count: members.length,
							misAJourLe: latest(members.map(({ misAJourLe }) => misAJourLe)),
						},
					]
				: []
		})
		.sort((a, b) => a.slug.localeCompare(b.slug))
}
