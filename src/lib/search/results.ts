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

/** The profiles a search finds, in their sections. The directory comes in its order, which breaks ties. */
export function find<T extends SearchableProfile>(
	annuaire: readonly T[],
	recherche: Pick<Search, 'search' | 'city'>
): ProfilesByPlace<T> {
	const found = searchByWord(recherche)
		? rankByRelevance(annuaire, profil => profil.textes ?? NO_TEXT, recherche.search).map(({ profil }) => profil)
		: annuaire
	return sectionsByPlace(found, recherche.city)
}
