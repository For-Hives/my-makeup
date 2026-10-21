/**
 * The profiles the search by postal code and by country is tried with (ticket 263): the zone types of the
 * fictional set (two communes that share a postal code, a zone of Belgium, a zone of France and Italy), under
 * names of their own and carrying a word of their own, so that no count of another test moves.
 *
 * Why not the profiles of ./search-profiles.ts: a zone of countries, and a commune of the département 74, would
 * join the lists of Annecy and of Haute-Savoie those tests count. These carry another word, and a search for it
 * finds only them. Loaded alone (a lock between the processes of the run) and for good: a second load creates
 * nothing.
 */

import type { APIRequestContext } from '@playwright/test'
import { placeProfile, profilePresent, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_ZONE_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { underLock } from '../support/lock'
import { testPayload } from '../support/payload-test'

/** The word only these profiles carry, in their speciality. */
export const ZONE_WORD = 'Zephyrium'

/** The surname of each type, after « Essai Zone ». */
const NAMES: Readonly<Record<string, string>> = {
	'code-postal-partage-a': 'Sierra',
	'code-postal-partage-b': 'Tango',
	'zone-belgique': 'Uniform',
	'zone-france-italie': 'Victor',
}

function variant(type: DemoProfile): DemoProfile {
	const name = NAMES[type.cle]
	if (!name) throw new Error(`Pas de nom d’essai pour le profil type « ${type.cle} ».`)
	return {
		...type,
		cle: `essai-zone-${type.cle}`,
		compte: { email: `essai-zone-${type.cle}@example.test`, nom: `Essai Zone ${name}` },
		profil: {
			...type.profil,
			firstName: 'Essai',
			lastName: `Zone ${name}`,
			artistName: `Essai Zone ${name} Maquillage`,
			specialty: `${type.profil.specialty} ${ZONE_WORD}`,
		},
		photos: { principale: type.photos.principale, galerie: [] },
	}
}

export const ZONE_SEARCH_PROFILES: ReadonlyMap<string, DemoProfile> = new Map(
	DEMO_ZONE_PROFILES.filter(({ cle: key }) => key in NAMES).map(type => [type.cle, variant(type)])
)

export interface ZoneSearchProfile {
	id: number
	slug: string
	nom: string
	specialite: string
}

/** Loads the profiles that are not in the bench yet, and says where each one is. */
export async function setZoneSearchProfiles(): Promise<ReadonlyMap<string, ZoneSearchProfile>> {
	return underLock('profils-de-recherche-zones', async () => {
		const payload = await testPayload()
		const set = new Map<string, ZoneSearchProfile>()
		for (const [key, type] of ZONE_SEARCH_PROFILES) {
			const profile = (await profilePresent(payload, type)) ?? (await placeProfile(payload, type, readDemoPhoto, false))
			set.set(key, {
				id: profile.profil,
				slug: profile.slug,
				nom: `${type.profil.firstName} ${type.profil.lastName}`,
				specialite: type.profil.specialty ?? '',
			})
		}
		return set
	})
}

/**
 * Has the application refresh the pages that list the profiles: a save of a published profile through the
 * application does it, and the directory the search ranks is kept in the cache of Next until then. The profile
 * is saved with the specialty it has, so nothing changes.
 */
export async function refreshDirectory(request: APIRequestContext, profile: ZoneSearchProfile): Promise<void> {
	const { session } = await createAccount('admin')
	const response = await request.patch(`/api/profiles/${profile.id}`, {
		headers: session.enTetes,
		data: { specialty: profile.specialite },
	})
	if (!response.ok()) throw new Error(`Le rafraîchissement a répondu ${response.status()} : ${await response.text()}`)
}
