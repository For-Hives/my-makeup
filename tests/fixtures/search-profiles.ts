/**
 * The profiles the public pages of the search are tried with (tickets 072 and 098): the profile types
 * of the fictional set, under names of their own.
 *
 * Why not the set itself: the fake base of the import test (tests/support/source-strapi/) carries the same
 * made-up names as the set, and an import into a bench that holds the set refuses their slugs. These
 * profiles are called « Essai … », so that the two can live on the one bench of a run, whatever the
 * order the files run in. Each type keeps its commune, its availability, its status and its photo; only
 * the identity changes, and the gallery is left out (a card shows the main photo).
 *
 * Loaded alone (a lock between the processes of the run) and for good: a second load creates nothing.
 */

import { placeProfile, profilePresent, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { underLock } from '../support/lock'
import { testPayload } from '../support/payload-test'

/** The type of the set that is left out: its long names say nothing about the search. */
const EXCLUDED = 'textes-maximaux'

/**
 * The word only these profiles carry (in their speciality). A search for it, alone or with another word and a
 * city, finds exactly these profiles whatever the other tests write into the shared bench: the total of a
 * search by « mariage » or « Annecy » moves with them, and pushes a profile onto another page of 20.
 */
export const TEST_WORD = 'Quasarium'

/** The surname of each type: what its card shows after « Essai ». */
const NAMES: Readonly<Record<string, string>> = {
	reference: 'Alpha',
	'ville-voisine': 'Bravo',
	'ville-eloignee': 'Charlie',
	indisponible: 'Delta',
	'disponibilite-inconnue': 'Echo',
	vide: 'Foxtrot',
	'publiable-non-indexable': 'Golf',
	'sans-contact-public': 'Hotel',
	'ancien-nom-accentue': 'Zoé',
	verifiee: 'India',
	masquee: 'Juliet',
}

function variant(type: DemoProfile): DemoProfile {
	const name = NAMES[type.cle]
	if (!name) throw new Error(`Pas de nom d’essai pour le profil type « ${type.cle} ».`)
	const identity =
		Object.keys(type.profil).length > 0
			? { firstName: 'Essai', lastName: name, artistName: `Essai ${name} Maquillage` }
			: {}
	return {
		...type,
		cle: `essai-${type.cle}`,
		compte: { email: `essai-recherche-${type.cle}@example.test`, nom: `Essai ${name}` },
		profil: {
			...type.profil,
			...identity,
			// Only a type that has a speciality gets the word: adding one would change what the profile lacks.
			...(type.profil.specialty ? { specialty: `${type.profil.specialty} ${TEST_WORD}` } : {}),
		},
		photos: { principale: type.photos.principale, galerie: [] },
	}
}

/** The profile types of the search, by the key of the type of the set they come from. */
export const SEARCH_PROFILES: ReadonlyMap<string, DemoProfile> = new Map(
	DEMO_PROFILES.filter(({ cle: key }) => key !== EXCLUDED).map(type => [type.cle, variant(type)])
)

/** A profile type as it is in the bench: its address, and the name its card shows. */
export interface SearchProfile {
	/** The identifier of the profile, to save it through the application. */
	id: number
	slug: string
	/** The name of its card, the first and last name of the profile. */
	nom: string
	specialite: string | null
}

/** Loads the profiles that are not in the bench yet, and says where each one is. */
export async function setSearchProfiles(): Promise<ReadonlyMap<string, SearchProfile>> {
	return underLock('profils-de-recherche', async () => {
		const payload = await testPayload()
		const set = new Map<string, SearchProfile>()
		for (const [key, type] of SEARCH_PROFILES) {
			const profile = (await profilePresent(payload, type)) ?? (await placeProfile(payload, type, readDemoPhoto, false))
			set.set(key, {
				id: profile.profil,
				slug: profile.slug,
				nom: [type.profil.firstName, type.profil.lastName].filter(Boolean).join(' '),
				specialite: type.profil.specialty ?? null,
			})
		}
		return set
	})
}
