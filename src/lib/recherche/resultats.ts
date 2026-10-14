/**
 * What a search finds in the directory, before it is cut in pages (tickets 098 and 099): the profiles
 * the words matched, best first (src/lib/recherche/pertinence.ts), or every listed profile when only a
 * city was typed; then placed by the city typed, in sections (src/lib/recherche/lieu.ts). The city only
 * places: it never adds a profile the words did not find.
 *
 * No `next` import: read by the page and by the tests.
 */

import { type PlaceDuProfil, type ProfilsParLieu, sectionsParLieu } from './lieu'
import { classerParPertinence, normaliserLesTextes, type TextesNormalises } from './pertinence'
import { type Recherche, rechercheParMot } from './saisie'

/** A profile of the directory as the search reads it: where she works, and (for a word) what she wrote. */
export interface ProfilCherchable extends PlaceDuProfil {
	textes?: TextesNormalises
}

const SANS_TEXTE = normaliserLesTextes({
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
export function chercher<T extends ProfilCherchable>(
	annuaire: readonly T[],
	recherche: Pick<Recherche, 'search' | 'city'>
): ProfilsParLieu<T> {
	const trouves = rechercheParMot(recherche)
		? classerParPertinence(annuaire, profil => profil.textes ?? SANS_TEXTE, recherche.search).map(
				({ profil }) => profil
			)
		: annuaire
	return sectionsParLieu(trouves, recherche.city)
}
