/**
 * The shared cases of the completeness rule (tests/unit/fixtures/completude-cas.json, written in
 * the fields of the old site), as the v3 holds them (ticket 044): what the import makes of each
 * (tickets 059 to 064), so that the state the server stores can be compared with the single rule
 * (I20, U01-U08) and with the answers of the old site (tests/unit/fixtures/completude-ancien-site.json).
 *
 * Every value is made up, but for the commune, which is public reference data.
 */

import { parsePrice } from '@/lib/prix'
import { aMedia, type ChampsDuProfil, type Completude, completude } from '@/lib/profil/completude'
import ancienSite from '../unit/fixtures/completude-ancien-site.json'
import casPartages from '../unit/fixtures/completude-cas.json'

/** A commune of the official list, with its INSEE code. */
export const ANNECY = { nom: 'Annecy', codeInsee: '74010' } as const

/**
 * The commune each city of the shared cases becomes, as the import chooses it (ticket 063): the
 * commune of a postal address that names one; nothing for a text that is no commune, nor a
 * usable city for the old site (the zone stays empty, the profile goes to review). A city of a
 * new case has to be added here: the translation refuses a city it does not know.
 */
export const COMMUNE_DE_LA_VILLE: Readonly<Record<string, typeof ANNECY | null>> = {
	Annecy: ANNECY,
	'12 rue des Lilas 74000 Annecy': ANNECY,
	France: null,
	'3 avenue des Essais': null,
	'Annecy,rue des Essais': null,
	'74 et alentours': null,
}

export interface CasPartage {
	nom: string
	profil: ChampsDuProfil
	options?: { formulaireDevis?: boolean }
}

/** The shared cases, in their order. */
export const CAS_PARTAGES = casPartages.cas as CasPartage[]

/** What the old site answers on each shared case, in the same order: its front and its API. */
export const REPONSES_DE_L_ANCIEN_SITE = ancienSite.partages.cas as {
	nom: string
	front: { score: number; actif: boolean; publiable: boolean }
	api: { entirelyEmpty: boolean }
}[]

/** The commune a city of a shared case becomes, or nothing. */
export function communeDeLaVille(ville: string | null | undefined): typeof ANNECY | null {
	if (ville === null || ville === undefined || ville === '') return null
	const commune = COMMUNE_DE_LA_VILLE[ville]
	if (commune === undefined) throw new Error(`Ville d’un cas partagé sans commune choisie : « ${ville} ».`)
	return commune
}

/** True when the v3 keeps nothing of the city typed in this case: a text that is no commune. */
export const villeEcartee = (profil: ChampsDuProfil): boolean =>
	typeof profil.city === 'string' && profil.city !== '' && communeDeLaVille(profil.city) === null

/**
 * A shared case as the data of a save of `profils`. `photo` gives the identifier of a media of the
 * account, one per call: the main photo, then the gallery.
 */
export async function documentDuCas(
	profil: ChampsDuProfil,
	photo: () => number | Promise<number>
): Promise<Record<string, unknown>> {
	const network = profil.network ?? {}
	const telephone = network.phone ?? null
	const email = network.email ?? null
	const lignes = (liste: readonly unknown[] | null | undefined, ligne: Record<string, string>) =>
		(liste ?? []).map(() => ({ ...ligne }))
	return {
		prenom: profil.first_name ?? null,
		nom: profil.last_name ?? null,
		specialite: profil.speciality ?? null,
		nomArtiste: profil.company_artist_name ?? null,
		description: profil.description ?? null,
		commune: communeDeLaVille(profil.city),
		photoPrincipale: aMedia(profil.main_picture) ? await photo() : null,
		galerie: aMedia(profil.image_gallery) ? [await photo()] : [],
		competences: lignes(profil.skills, { nom: 'Compétence fictive' }),
		experiences: lignes(profil.experiences, { poste: 'Poste fictif' }),
		formations: lignes(profil.courses, { diplome: 'Diplôme fictif' }),
		langues: lignes(profil.language, { nom: 'Langue fictive' }),
		// The price typed is kept, with the amount the single price rule reads in it (ticket 062).
		prestations: (profil.service_offers ?? []).map(offre => ({
			nom: 'Prestation fictive',
			...parsePrice(offre?.price),
		})),
		reseaux: {
			youtube: network.youtube ?? null,
			facebook: network.facebook ?? null,
			instagram: network.instagram ?? null,
			siteWeb: network.website ?? null,
			linkedin: network.linkedin ?? null,
		},
		// A phone or an email the old site showed stays shown (ticket 064).
		coordonnees: { telephone, email },
		contactPublic: Boolean(telephone || email),
	}
}

/**
 * What the single rule says of a shared case as the v3 holds it: its city is the name of its
 * commune, or nothing. Never with the quote form, which nothing turns on.
 */
export function completudeEnV3(profil: ChampsDuProfil): Completude {
	return completude({ ...profil, city: communeDeLaVille(profil.city)?.nom ?? null })
}
