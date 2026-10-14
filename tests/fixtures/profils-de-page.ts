/**
 * The profiles the public page of a profile is tried with (tickets 101 to 103; plan 02 E43 and E44):
 * profile types of the fictional set, under names of their own, with their whole content, their six
 * photos of the gallery and the longest texts.
 *
 * Why not the profiles of the search (./profils-de-recherche.ts): those leave the gallery out and drop the
 * type of the longest texts. All twelve types are here, with their gallery. And why not the set itself: the fake base of the import test carries the same
 * made-up names as the set, and an import into a bench that holds the set refuses their slugs. These
 * profiles have accounts, names and files of their own (« Page … »), so that they can live on the one
 * bench of a run, whatever the order the files run in.
 *
 * Loaded alone (a lock between the processes of the run) and for good: a second load creates nothing.
 */

import { lirePhotoDuJeu, poserLeProfil, profilPresent } from '../../src/jeu-fictif/chargement'
import { PROFILS_DU_JEU, type ProfilDuJeu } from '../../src/jeu-fictif/profils'
import { payloadDeTest } from '../outils/payload-test'
import { sousVerrou } from '../outils/verrou'

/** Every type of the set, and the surname each one takes after « Page » (the longest texts keep theirs). */
const NOMS: Readonly<Record<string, string>> = {
	reference: 'Alpha',
	'ville-voisine': 'Bravo',
	'ville-eloignee': 'Charlie',
	indisponible: 'Delta',
	'disponibilite-inconnue': 'Echo',
	vide: 'Foxtrot',
	'actif-non-publiable': 'Golf',
	'sans-contact-public': 'Hotel',
	'ancien-nom-accentue': 'India',
	verifiee: 'Juliet',
	masquee: 'Kilo',
	'textes-maximaux': 'Maximal',
}

function sansAncienNom<T extends { legacyUsername?: unknown }>(profil: T): T {
	const { legacyUsername: _, ...reste } = profil
	return reste as T
}

function variante(type: ProfilDuJeu): ProfilDuJeu {
	const nom = NOMS[type.cle]
	if (!nom) throw new Error(`Pas de nom de page pour le profil type « ${type.cle} ».`)
	// The longest texts keep their long names: that is what the type is for.
	const identite =
		Object.keys(type.profil).length === 0 || type.cle === 'textes-maximaux'
			? {}
			: { prenom: 'Page', nom, nomArtiste: `Page ${nom} Maquillage` }
	return {
		...type,
		cle: `page-${type.cle}`,
		compte: { email: `page-profil-${type.cle}@example.test`, nom: `Page ${nom}` },
		// The old username of the set belongs to the profile of the search: it stays unique in the bench.
		profil: sansAncienNom({ ...type.profil, ...identite }),
	}
}

/** The profile types of the page, by the key of the type of the set they come from. */
export const PROFILS_DE_PAGE: ReadonlyMap<string, ProfilDuJeu> = new Map(
	PROFILS_DU_JEU.map(type => [type.cle, variante(type)])
)

/** A profile type as it is in the bench. */
export interface ProfilDePage {
	id: number
	slug: string
	/** The type it was made from. */
	type: ProfilDuJeu
}

/** Loads the profiles that are not in the bench yet, and says where each one is. */
export async function poserLesProfilsDePage(): Promise<ReadonlyMap<string, ProfilDePage>> {
	return sousVerrou('profils-de-page', async () => {
		const payload = await payloadDeTest()
		const posees = new Map<string, ProfilDePage>()
		for (const [cle, type] of PROFILS_DE_PAGE) {
			const profil = (await profilPresent(payload, type)) ?? (await poserLeProfil(payload, type, lirePhotoDuJeu, false))
			posees.set(cle, { id: profil.profil, slug: profil.slug, type })
		}
		return posees
	})
}
