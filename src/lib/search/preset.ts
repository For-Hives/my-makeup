/**
 * The preset of the search page when nothing was typed (« Les plus consultées en France »). Its criterion is one
 * thing, said as it is: the views of the page of each profile over the last 30 days (the counter of ticket 1001,
 * which counts neither robots, nor the owner, nor the team, and once per browser tab). It is not a measure of
 * requests, bookings or quality, and the page never says « demandées ».
 *
 * - A profile is a candidate when she is listed (it comes from the directory), publishable, reachable, and in a
 *   commune of France (`departement`): the same visibility as « Mise en avant » and the blocks under a page of text.
 * - Under a floor of views for a profile (MOST_VIEWED_MIN_VIEWS) she is not counted, and with fewer candidates than
 *   places (MOST_VIEWED_MIN_PROFILES) there is no ranking to show: the preset is then the documented order of the
 *   directory (src/lib/search/ranking.ts), under the title « Les mieux classées ». A failed read of the counts is
 *   the same case.
 * - Only the *order* of the slugs leaves the counter, never a number: the page and its cache hold slugs.
 *
 * No `next` import: read by the page and by the tests.
 */

import { VIEWS_WINDOW_DAYS } from '../views/profile-views'

/** The cards of the preset. */
export const PRESET_SIZE = 6

/** A profile with fewer views than this over the window is not counted: a handful of visits is no signal. */
export const MOST_VIEWED_MIN_VIEWS = 10

/** The fewest candidates with views for a ranking: the preset has no gap to fill with the others. */
export const MOST_VIEWED_MIN_PROFILES = PRESET_SIZE

/** The most slugs kept from the counter: room to drop those a rule of visibility removes. */
export const MOST_VIEWED_KEPT = 24

export type PresetKind = 'most-viewed' | 'best-ranked'

export interface Preset<T> {
	kind: PresetKind
	title: string
	/** The sentence that says on what the preset is ranked: the criterion, in words. */
	intro: string
	profiles: T[]
}

/** What the preset reads of a directory profile. */
export interface PresetProfile {
	carte: { slug: string }
	indexable: boolean
	unreachable: boolean
	departement: string | null
}

export const MOST_VIEWED_TITLE = 'Les plus consultées en France'
export const BEST_RANKED_TITLE = 'Les mieux classées'

const MOST_VIEWED_INTRO = `Les pages de maquilleuses les plus ouvertes ces ${VIEWS_WINDOW_DAYS} derniers jours, dans toute la France.`
const BEST_RANKED_INTRO =
	'Les profils les plus complets, dans l’ordre décrit sur la page de classement : aucune visite n’a encore établi de palmarès.'

/** The slugs the counter keeps: at least MOST_VIEWED_MIN_VIEWS views, most viewed first, alphabetical on a tie. */
export function orderMostViewed(totals: ReadonlyMap<string, number>): string[] {
	return [...totals]
		.filter(([, views]) => views >= MOST_VIEWED_MIN_VIEWS)
		.toSorted(([slugA, a], [slugB, b]) => b - a || (slugA < slugB ? -1 : slugA > slugB ? 1 : 0))
		.slice(0, MOST_VIEWED_KEPT)
		.map(([slug]) => slug)
}

const eligible = (profile: PresetProfile): boolean =>
	profile.indexable && !profile.unreachable && profile.departement !== null

/**
 * The preset: the most viewed candidates when enough of them have views, the first candidates of the directory order
 * otherwise (`viewedSlugs` is null when the counter could not be read).
 */
export function selectPreset<T extends PresetProfile>(
	directory: readonly T[],
	viewedSlugs: readonly string[] | null,
	size: number = PRESET_SIZE
): Preset<T> {
	const candidates = directory.filter(eligible)
	if (viewedSlugs !== null) {
		const bySlug = new Map(candidates.map(profile => [profile.carte.slug, profile]))
		const viewed = viewedSlugs.flatMap(slug => bySlug.get(slug) ?? [])
		if (viewed.length >= MOST_VIEWED_MIN_PROFILES)
			return {
				kind: 'most-viewed',
				title: MOST_VIEWED_TITLE,
				intro: MOST_VIEWED_INTRO,
				profiles: viewed.slice(0, size),
			}
	}
	return {
		kind: 'best-ranked',
		title: BEST_RANKED_TITLE,
		intro: BEST_RANKED_INTRO,
		profiles: candidates.slice(0, size),
	}
}
