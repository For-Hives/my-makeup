/**
 * The profiles the public pages of the search are tried with (tickets 072 and 098): the profile types
 * of the fictional set, under names of their own.
 *
 * Why not the set itself: the fake base of the import test (tests/outils/source-strapi/) carries the same
 * made-up names as the set, and an import into a bench that holds the set refuses their slugs. These
 * profiles are called « Essai … », so that the two can live on the one bench of a run, whatever the
 * order the files run in. Each type keeps its commune, its availability, its status and its photo; only
 * the identity changes, and the gallery is left out (a card shows the main photo).
 *
 * Loaded alone (a lock between the processes of the run) and for good: a second load creates nothing.
 */

import { placeProfile, profilePresent, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { payloadDeTest } from '../outils/payload-test'
import { sousVerrou } from '../outils/verrou'

/** The type of the set that is left out: its long names say nothing about the search. */
const ECARTE = 'textes-maximaux'

/**
 * The word only these profiles carry (in their speciality). A search for it, alone or with another word and a
 * city, finds exactly these profiles whatever the other tests write into the shared bench: the total of a
 * search by « mariage » or « Annecy » moves with them, and pushes a profile onto another page of 20.
 */
export const MOT_DES_ESSAIS = 'Quasarium'

/** The surname of each type: what its card shows after « Essai ». */
const NOMS: Readonly<Record<string, string>> = {
	reference: 'Alpha',
	'ville-voisine': 'Bravo',
	'ville-eloignee': 'Charlie',
	indisponible: 'Delta',
	'disponibilite-inconnue': 'Echo',
	vide: 'Foxtrot',
	'actif-non-publiable': 'Golf',
	'sans-contact-public': 'Hotel',
	'ancien-nom-accentue': 'Zoé',
	verifiee: 'India',
	masquee: 'Juliet',
}

function variante(type: DemoProfile): DemoProfile {
	const nom = NOMS[type.cle]
	if (!nom) throw new Error(`Pas de nom d’essai pour le profil type « ${type.cle} ».`)
	const identite =
		Object.keys(type.profil).length > 0
			? { firstName: 'Essai', lastName: nom, artistName: `Essai ${nom} Maquillage` }
			: {}
	return {
		...type,
		cle: `essai-${type.cle}`,
		compte: { email: `essai-recherche-${type.cle}@example.test`, nom: `Essai ${nom}` },
		profil: {
			...type.profil,
			...identite,
			// Only a type that has a speciality gets the word: adding one would change what the profile lacks.
			...(type.profil.specialty ? { specialty: `${type.profil.specialty} ${MOT_DES_ESSAIS}` } : {}),
		},
		photos: { principale: type.photos.principale, galerie: [] },
	}
}

/** The profile types of the search, by the key of the type of the set they come from. */
export const PROFILS_DE_RECHERCHE: ReadonlyMap<string, DemoProfile> = new Map(
	DEMO_PROFILES.filter(({ cle }) => cle !== ECARTE).map(type => [type.cle, variante(type)])
)

/** A profile type as it is in the bench: its address, and the name its card shows. */
export interface ProfilDeRecherche {
	/** The identifier of the profile, to save it through the application. */
	id: number
	slug: string
	/** The name of its card, the first and last name of the profile. */
	nom: string
	specialite: string | null
}

/** Loads the profiles that are not in the bench yet, and says where each one is. */
export async function poserLesProfilsDeRecherche(): Promise<ReadonlyMap<string, ProfilDeRecherche>> {
	return sousVerrou('profils-de-recherche', async () => {
		const payload = await payloadDeTest()
		const posees = new Map<string, ProfilDeRecherche>()
		for (const [cle, type] of PROFILS_DE_RECHERCHE) {
			const profil = (await profilePresent(payload, type)) ?? (await placeProfile(payload, type, readDemoPhoto, false))
			posees.set(cle, {
				id: profil.profil,
				slug: profil.slug,
				nom: [type.profil.firstName, type.profil.lastName].filter(Boolean).join(' '),
				specialite: type.profil.specialty ?? null,
			})
		}
		return posees
	})
}
