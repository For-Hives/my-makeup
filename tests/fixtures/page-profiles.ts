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

import { placeProfile, profilePresent, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { underLock } from '../support/lock'
import { testPayload } from '../support/payload-test'

/** Every type of the set, and the surname each one takes after « Page » (the longest texts keep theirs). */
const NAMES: Readonly<Record<string, string>> = {
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

function withoutOldName<T extends { legacyUsername?: unknown }>(profil: T): T {
	const { legacyUsername: _, ...rest } = profil
	return rest as T
}

function variant(type: DemoProfile, prefixe = 'Page'): DemoProfile {
	const lowercase = prefixe.toLowerCase()
	const name = NAMES[type.cle]
	if (!name) throw new Error(`Pas de nom de page pour le profil type « ${type.cle} ».`)
	// The longest texts keep their long names: that is what the type is for.
	const identity =
		Object.keys(type.profil).length === 0 || type.cle === 'textes-maximaux'
			? {}
			: { firstName: prefixe, lastName: name, artistName: `${prefixe} ${name} Maquillage` }
	return {
		...type,
		cle: `${lowercase}-${type.cle}`,
		compte: { email: `${lowercase}-profil-${type.cle}@example.test`, nom: `${prefixe} ${name}` },
		// The old username of the set belongs to the profile of the search: it stays unique in the bench.
		profil: withoutOldName({ ...type.profil, ...identity }),
		// The profile of an availability never set has no portfolio: the section is then absent from its page.
		photos: type.cle === 'disponibilite-inconnue' ? { ...type.photos, galerie: [] } : type.photos,
	}
}

/** The profile types of the page, by the key of the type of the set they come from. */
export const PAGE_PROFILES: ReadonlyMap<string, DemoProfile> = new Map(
	DEMO_PROFILES.map(type => [type.cle, variant(type)])
)

/**
 * The same twelve types under another first name, for a spec that cannot share its profiles with the page
 * spec: each one takes its own away at its end, and the two run side by side (one per screen size).
 */
export const pageProfilesUnderPrefix = (prefixe: string): ReadonlyMap<string, DemoProfile> =>
	new Map(DEMO_PROFILES.map(type => [type.cle, variant(type, prefixe)]))

/** A profile type as it is in the bench. */
export interface PageProfile {
	id: number
	slug: string
	/** The type it was made from. */
	type: DemoProfile
}

/** Loads the profiles that are not in the bench yet, and says where each one is. */
export async function setPageProfiles(
	types: ReadonlyMap<string, DemoProfile> = PAGE_PROFILES
): Promise<ReadonlyMap<string, PageProfile>> {
	return underLock('profils-de-page', async () => {
		const payload = await testPayload()
		const set = new Map<string, PageProfile>()
		for (const [key, type] of types) {
			const profile = (await profilePresent(payload, type)) ?? (await placeProfile(payload, type, readDemoPhoto, false))
			set.set(key, { id: profile.profil, slug: profile.slug, type })
		}
		return set
	})
}
