/**
 * The public reading of the profiles: the only way a public page reads a profile (CLAUDE.md,
 * « Un seul point de lecture publique »). The first slice of it (ticket 026): a profile by its
 * slug, with its name, its speciality and its description. Ticket 071 extends it (listed,
 * indexable, visible, contact details published by the makeup artist).
 *
 * - The fields are chosen one by one (`CHAMPS_PUBLICS_DU_PROFIL`): never the contact details,
 *   never the account, never what the import or an admin wrote.
 * - The reading keeps the access rules of the collection (`overrideAccess: false`), as an
 *   anonymous visitor: a profile that is not published is not found.
 *
 * The caller gives the Payload instance: the page gets it from the configuration, a test from the
 * bench. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { nomAffiche, texte } from '@/lib/profil/nom-affiche'
import { estUnSlug } from '@/lib/slug'

/** The fields of a profile a public page reads, and nothing else. */
export const CHAMPS_PUBLICS_DU_PROFIL = {
	slug: true,
	prenom: true,
	nom: true,
	nomArtiste: true,
	specialite: true,
	description: true,
} as const

/** A profile as a public page shows it. */
export interface ProfilPublic {
	slug: string
	/** The name of the h1 (src/lib/profil/nom-affiche.ts). */
	nom: string
	specialite: string | null
	description: string | null
}

/**
 * The published profile of this slug, or `null`: unknown, not published, or not even a slug (an
 * old address by username gets its redirection in ticket 104).
 */
export async function lireLeProfilPublic(payload: Payload, slug: string): Promise<ProfilPublic | null> {
	if (!estUnSlug(slug)) return null
	const { docs } = await payload.find({
		collection: 'profils',
		where: { slug: { equals: slug } },
		select: CHAMPS_PUBLICS_DU_PROFIL,
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: false,
	})
	const profil = docs[0]
	if (!profil) return null
	return {
		slug: profil.slug,
		nom: nomAffiche(profil),
		specialite: texte(profil.specialite) || null,
		description: texte(profil.description) || null,
	}
}
