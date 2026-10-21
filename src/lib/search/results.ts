/**
 * What a search finds in the directory, before it is cut in pages (tickets 098 and 099): the profiles
 * the words matched, best first (src/lib/search/relevance.ts), or every listed profile when only a
 * city was typed; then placed by the city typed, in sections (src/lib/search/place.ts). The city only
 * places: it never adds a profile the words did not find.
 *
 * No `next` import: read by the page and by the tests.
 */

import { type Search, searchByWord } from './input'
import { type ProfilePlace, type ProfilesByPlace, sectionsByPlace } from './place'
import { type NormalizedTexts, normalizeTexts, rankByRelevance } from './relevance'

/** A profile of the directory as the search reads it: where she works, and (for a word) what she wrote. */
export interface SearchableProfile extends ProfilePlace {
	textes?: NormalizedTexts
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

/**
 * The profiles a search finds, in their sections. The directory comes in its order, which breaks ties.
 * In each section, the profiles with no way to be reached go last (ticket 291): they stay listed, and
 * the count of the title does not change.
 */
export function find<T extends SearchableProfile>(
	annuaire: readonly T[],
	recherche: Pick<Search, 'search' | 'city'>
): ProfilesByPlace<T> {
	const found = searchByWord(recherche)
		? rankByRelevance(annuaire, profil => profil.textes ?? NO_TEXT, recherche.search).map(({ profil }) => profil)
		: annuaire
	const places = sectionsByPlace(found, recherche.city)
	return {
		...places,
		locaux: reachableFirst(places.locaux),
		sections: places.sections.map(section => ({ ...section, profils: reachableFirst(section.profils) })),
	}
}
