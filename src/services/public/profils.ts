/**
 * The public reading of the profiles: the only way a public page reads a profile (CLAUDE.md,
 * « Un seul point de lecture publique »). The first slice of it (ticket 026): a profile by its
 * slug, with its name, its speciality and its description. Ticket 071 extends it: the list of the
 * profiles that are listed, whether a profile is indexable, and the contact details its owner
 * published. The pages of the talents and of the articles add their own reading in their own
 * tickets, in this folder.
 *
 * - The fields are chosen one by one (`CHAMPS_PUBLICS_DU_PROFIL`, `CHAMPS_DE_LA_CARTE`): never the
 *   account, never what the import or an admin wrote.
 * - The reading keeps the access rules of the collection (`overrideAccess: false`), as an
 *   anonymous visitor: a profile that is not published is not found. The three rules (listed,
 *   indexable, visible) are src/lib/profil/visibilite.ts; none is written again here.
 * - The contact details are the one thing read without the access rules, by the identifier of a
 *   profile the access rules already gave, and only when its owner published them
 *   (`contactPublic`). A hidden profile gives nothing.
 * - Every read of a list gives its `limit`: the REST bound of ticket 071 does not reach the local
 *   API, so the code bounds itself (tests/unit/lecture-publique.test.ts checks it).
 *
 * The caller gives the Payload instance: the page gets it from the configuration, a test from the
 * bench. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { formatZone } from '@/lib/format-zone'
import { nomAffiche, texte } from '@/lib/profil/nom-affiche'
import { estIndexable, estVisible, FILTRE_LISTE } from '@/lib/profil/visibilite'
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

/** What a card of a list reads: the identity, the badge and the zone. */
export const CHAMPS_DE_LA_CARTE = {
	slug: true,
	prenom: true,
	nom: true,
	nomArtiste: true,
	specialite: true,
	commune: true,
	rayonKm: true,
	superMaquilleuse: true,
} as const

/** The most profiles one read of a list gives, and the size of a page when none is asked. */
export const LIMITE_MAX_DE_LA_LISTE = 100
export const LIMITE_PAR_DEFAUT = 20

/** The contact details a makeup artist chose to publish. */
export interface CoordonneesPubliques {
	telephone: string | null
	email: string | null
}

/** A profile as a public page shows it. */
export interface ProfilPublic {
	slug: string
	/** The name of the h1 (src/lib/profil/nom-affiche.ts). */
	nom: string
	specialite: string | null
	description: string | null
	/** Publishable: the page may be indexed. Otherwise it is shown in noindex. */
	indexable: boolean
	/** Her telephone and email, only when she published them, else `null`. */
	coordonnees: CoordonneesPubliques | null
}

/** A card of the list: the keys are frozen by the unit test (U22), never a contact detail. */
export interface CarteDeProfil {
	slug: string
	nom: string
	specialite: string | null
	/** « Annecy », « Annecy et 30 km autour », or `null`. */
	lieu: string | null
	superMaquilleuse: boolean
}

/** One page of the listed profiles. */
export interface PageDeProfils {
	cartes: CarteDeProfil[]
	page: number
	totalDocs: number
	hasNextPage: boolean
}

/** The contact details of this profile if its owner published them, else `null`. */
async function lireLesCoordonneesPubliees(payload: Payload, id: number): Promise<CoordonneesPubliques | null> {
	const { docs } = await payload.find({
		collection: 'profils',
		where: { id: { equals: id } },
		select: { contactPublic: true, coordonnees: true },
		depth: 0,
		limit: 1,
		pagination: false,
		// The contact details are closed to the public by the access rules: only this read lifts them,
		// by the identifier of a profile the public already reads, and keeps them if she chose so.
		overrideAccess: true,
	})
	const profil = docs[0]
	if (profil?.contactPublic !== true) return null
	const telephone = texte(profil.coordonnees?.telephone) || null
	const email = texte(profil.coordonnees?.email) || null
	return telephone || email ? { telephone, email } : null
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
		select: { ...CHAMPS_PUBLICS_DU_PROFIL, id: true, statut: true, publiable: true },
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: false,
	})
	const profil = docs[0]
	if (!profil || !estVisible(profil)) return null
	return {
		slug: profil.slug,
		nom: nomAffiche(profil),
		specialite: texte(profil.specialite) || null,
		description: texte(profil.description) || null,
		indexable: estIndexable(profil),
		coordonnees: await lireLesCoordonneesPubliees(payload, profil.id),
	}
}

/**
 * One page of the listed profiles (neither hidden, nor unavailable, nor entirely empty), 20 by
 * default and 100 at most. A page past the end is empty. The order is the slug, stable from one
 * page to the next; the search of ticket 098 sorts by relevance on top of this read.
 */
export async function listerLesProfils(
	payload: Payload,
	{ page = 1, limite = LIMITE_PAR_DEFAUT }: { page?: number; limite?: number } = {}
): Promise<PageDeProfils> {
	const resultat = await payload.find({
		collection: 'profils',
		where: FILTRE_LISTE,
		select: CHAMPS_DE_LA_CARTE,
		sort: 'slug',
		depth: 0,
		limit: Math.min(Math.max(Math.trunc(limite) || LIMITE_PAR_DEFAUT, 1), LIMITE_MAX_DE_LA_LISTE),
		page: Math.max(Math.trunc(page) || 1, 1),
		pagination: true,
		overrideAccess: false,
	})
	return {
		cartes: resultat.docs.map(profil => ({
			slug: profil.slug,
			nom: nomAffiche(profil),
			specialite: texte(profil.specialite) || null,
			lieu: formatZone({ city: profil.commune?.nom, radius: profil.rayonKm }) || null,
			superMaquilleuse: profil.superMaquilleuse === true,
		})),
		page: resultat.page ?? 1,
		totalDocs: resultat.totalDocs,
		hasNextPage: resultat.hasNextPage,
	}
}
