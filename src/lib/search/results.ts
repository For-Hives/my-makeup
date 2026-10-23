/**
 * What a search finds in the directory, before it is cut in pages (tickets 098 and 099): the profiles
 * the words matched, best first (src/lib/search/relevance.ts), or every listed profile when only a
 * city was typed; then placed by the city typed, in sections (src/lib/search/place.ts). The city only
 * places: it never adds a profile the words did not find.
 *
 * No `next` import: read by the page and by the tests.
 */

import { DEFAULT_FILTERS, type Filterable, type SearchFilters, sortSection } from './filters'
import { distanceKm, type GeoPoint } from './geo-distance'
import { type Search, searchByWord } from './input'
import {
	type ProfileGeometry,
	type ProfilePlace,
	type ProfilesByPlace,
	readPlace,
	sectionsByDistance,
	sectionsByPlace,
	zoneKnownFirst,
} from './place'
import { type NormalizedTexts, normalizeTexts, rankByRelevance } from './relevance'

/** A profile of the directory as the search reads it: where she works, and (for a word) what she wrote. */
export interface SearchableProfile extends ProfilePlace, ProfileGeometry, Filterable {
	/** The name a tie of a ranking by distance is broken by (ticket 294). */
	sortName?: string
	textes?: NormalizedTexts
	/** True when she goes far: a radius of 100 km or more, or several countries (ticket 295). */
	farReach?: boolean
	/** True when nothing on her profile lets a client reach her (ticket 291): she goes after the others. */
	unreachable?: boolean
}

const NO_TEXT = normalizeTexts({
	ville: '',
	specialite: '',
	description: '',
	competences: [],
	descriptionsDesCompetences: [],
	descriptionsDesPrestations: [],
	nom: '',
	prenom: '',
})

/** Reachable profiles first, the others after; each group keeps its order (ticket 291). */
function reachableFirst<T extends SearchableProfile>(profils: readonly T[]): T[] {
	return [
		...profils.filter(profil => profil.unreachable !== true),
		...profils.filter(profil => profil.unreachable === true),
	]
}

/** Where the place typed is on the map, with its name (ticket 293). */
export interface SearchOrigin {
	point: GeoPoint
	label: string
}

/**
 * The profiles a search finds, in their sections. The directory comes in its order, which breaks ties.
 * In each section, the profiles with no way to be reached go last (ticket 291), then those with no zone
 * (ticket 310): they stay listed, and the count of the title does not change.
 *
 * With `origin` (ticket 294), the place typed is a point and the profiles are ranked by distance
 * (sectionsByDistance). Without it, or when only a code of département was typed, the search keeps
 * its way of before: by the name of the place.
 *
 * With a sort other than the default (issue 1011), each section is sorted on its own, before the two rules
 * above are applied: the sections stay what they were, and a profile with no way to be reached, or with no
 * zone, is still after the others.
 */
export function find<T extends SearchableProfile>(
	annuaire: readonly T[],
	recherche: Pick<Search, 'search' | 'city'>,
	origin: SearchOrigin | null = null,
	filters: SearchFilters = DEFAULT_FILTERS
): ProfilesByPlace<T> {
	const ranked = searchByWord(recherche)
		? rankByRelevance(annuaire, profil => profil.textes ?? NO_TEXT, recherche.search)
		: null
	const found = ranked ? ranked.map(({ profil }) => profil) : annuaire
	const typed = readPlace(recherche.city)
	const places =
		origin && (typed.segments.length > 0 || typed.postalCodes.length > 0)
			? sectionsByDistance(found, recherche.city, {
					origin,
					relevance: ranked ? new Map(ranked.map(({ profil, score }) => [profil, score])) : undefined,
					name: profil => profil.sortName ?? '',
				})
			: sectionsByPlace(found, recherche.city)
	const arranged = (profils: T[]): T[] => zoneKnownFirst(reachableFirst(sortSection(profils, filters)))
	return {
		...places,
		locaux: arranged(places.locaux),
		sections: places.sections.map(section => ({ ...section, profils: arranged(section.profils) })),
	}
}

/** How many « Elles se déplacent loin » cards the empty state shows at most (ticket 295). */
export const FAR_TRAVELLERS_MAX = 4

/**
 * The profiles that go far, for the page that found nobody near the place (ticket 295; audit UX
 * improvement 21): a radius of 100 km or more, or several countries. At most `FAR_TRAVELLERS_MAX`; the
 * ones with a way to be reached first (ticket 291), then the nearest to the place when it is known, then
 * the directory order. Nobody else: never the whole directory.
 */
export function farTravellers<T extends SearchableProfile>(annuaire: readonly T[], origin: SearchOrigin | null): T[] {
	const distanceOf = (profil: T): number =>
		origin && profil.center ? distanceKm(origin.point, profil.center) : Number.POSITIVE_INFINITY
	return annuaire
		.filter(profil => profil.farReach === true)
		.map((profil, rank) => ({ profil, rank }))
		.toSorted(
			(a, b) =>
				Number(a.profil.unreachable === true) - Number(b.profil.unreachable === true) ||
				Math.round(distanceOf(a.profil) * 10) - Math.round(distanceOf(b.profil) * 10) ||
				a.rank - b.rank
		)
		.slice(0, FAR_TRAVELLERS_MAX)
		.map(({ profil }) => profil)
}
