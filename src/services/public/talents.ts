/**
 * The public reading of the talents, the pages of a speciality (ticket 097): the home page lists
 * them. A talent is read by its title and its slug, nothing else. The reading keeps the access rules
 * of the collection (`overrideAccess: false`), as an anonymous visitor: a draft is not found.
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { texte } from '@/lib/profil/nom-affiche'
import { estUnSlug } from '@/lib/slug'

/** The fields of a talent a public page reads, and nothing else. */
export const CHAMPS_DU_TALENT = { slug: true, title: true } as const

/** The most talents one read gives: the site has 14. */
export const LIMITE_DES_TALENTS = 100

/** A talent as the home page lists it: its title, and the address of its page. */
export interface TalentPublic {
	slug: string
	titre: string
}

/**
 * The published talents, in the order they were published (the order of the site online), then by
 * slug. A talent without a title or with a slug that is no address is left out: its link would lead
 * nowhere.
 */
export async function listerLesTalents(payload: Payload): Promise<TalentPublic[]> {
	const { docs } = await payload.find({
		collection: 'talents',
		select: CHAMPS_DU_TALENT,
		sort: ['publishedAt', 'slug'],
		depth: 0,
		limit: LIMITE_DES_TALENTS,
		pagination: false,
		overrideAccess: false,
	})
	return docs.flatMap(talent =>
		estUnSlug(talent.slug) && texte(talent.title) ? [{ slug: talent.slug, titre: texte(talent.title) }] : []
	)
}
