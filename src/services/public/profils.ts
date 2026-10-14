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
import { formatZone, rayonKm, villeAffichee } from '@/lib/format-zone'
import { nomAffiche, texte } from '@/lib/profil/nom-affiche'
import { estIndexable, estVisible, FILTRE_LISTE } from '@/lib/profil/visibilite'
import {
	contacts,
	type ExperiencePublique,
	experiences,
	type FormationPublique,
	formations,
	type LienDeContact,
	nomDArtisteAffiche,
	noms,
	type PrestationPublique,
	prestations,
} from '@/lib/profil/vue-publique'
import type { PlaceDuProfil } from '@/lib/recherche/lieu'
import { estUnSlug } from '@/lib/slug'
import type { Profil } from '@/payload-types'

/** The fields of a profile a public page reads, and nothing else. */
export const CHAMPS_PUBLICS_DU_PROFIL = {
	slug: true,
	prenom: true,
	nom: true,
	nomArtiste: true,
	specialite: true,
	description: true,
} as const

/** What a card of a list reads: the identity, the badge, the zone and the main photo. */
export const CHAMPS_DE_LA_CARTE = {
	slug: true,
	prenom: true,
	nom: true,
	nomArtiste: true,
	specialite: true,
	commune: true,
	rayonKm: true,
	superMaquilleuse: true,
	photoPrincipale: true,
} as const

/**
 * What a card reads of a photo: its public address and its size. The address is made from the file name
 * and the prefix of the object (`generateFileURL`, src/payload.config.ts), so those two are read to make
 * it, and a card keeps neither.
 */
export const CHAMPS_DE_LA_PHOTO = { url: true, width: true, height: true, filename: true, prefix: true } as const

/**
 * What the page of a profile reads (tickets 101 to 103): the fields above, her zone, her
 * availability and her photos. The commune is chosen down to its name: its code and its centre
 * stay in the database. The contact details are not here: they are read apart, and only when she
 * published them (`lireLesCoordonneesPubliees`).
 */
export const CHAMPS_DE_LA_PAGE_DU_PROFIL = {
	...CHAMPS_PUBLICS_DU_PROFIL,
	commune: { nom: true },
	rayonKm: true,
	disponible: true,
	photoPrincipale: true,
	reseaux: true,
	prestations: true,
	competences: true,
	langues: true,
	formations: true,
	experiences: true,
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
	/** The artist name under the h1, only when it adds something to the name (`nomDArtisteAffiche`). */
	nomArtiste: string | null
	specialite: string | null
	/** « Annecy », « Annecy et 30 km autour », or `null` (src/lib/format-zone.ts). */
	zone: string | null
	/** False only when she said so: an availability never set counts as available, as on the old site. */
	disponible: boolean
	/** Her main photo, or `null`: the page then shows the picture of the site. */
	photo: PhotoDeCarte | null
	/** Her commune, or `null`. */
	lieu: string | null
	/** True when she gave a radius around her commune. */
	seDeplace: boolean
	/** The sections below hold only rows that say something, in the order she gave them. */
	prestations: PrestationPublique[]
	competences: string[]
	langues: string[]
	formations: FormationPublique[]
	experiences: ExperiencePublique[]
	/** Her networks, and her telephone and email only when she published them. */
	liens: LienDeContact[]
	description: string | null
	/** Publishable: the page may be indexed. Otherwise it is shown in noindex. */
	indexable: boolean
	/** Her telephone and email, only when she published them, else `null`. */
	coordonnees: CoordonneesPubliques | null
}

/** The main photo of a card: where it is and how big, never the file's owner or its other fields. */
export interface PhotoDeCarte {
	url: string
	width: number | null
	height: number | null
}

/** A card of the list: the keys are frozen by the unit test (U22), never a contact detail. */
export interface CarteDeProfil {
	slug: string
	nom: string
	specialite: string | null
	/** « Annecy », « Annecy et 30 km autour », or `null`. */
	lieu: string | null
	superMaquilleuse: boolean
	photo: PhotoDeCarte | null
}

/** One page of the listed profiles. */
export interface PageDeProfils {
	cartes: CarteDeProfil[]
	page: number
	totalDocs: number
	hasNextPage: boolean
}

type ProfilDeLaCarte = Pick<
	Profil,
	| 'slug'
	| 'prenom'
	| 'nom'
	| 'nomArtiste'
	| 'specialite'
	| 'commune'
	| 'rayonKm'
	| 'superMaquilleuse'
	| 'photoPrincipale'
>

/** The photos of the cards, by the identifier of the media. */
type PhotosParIdentifiant = ReadonlyMap<number | string, PhotoDeCarte>

/** The identifier a relationship to a photo holds, populated or not. */
const identifiantDeLaPhoto = (photo: ProfilDeLaCarte['photoPrincipale']): number | string | undefined =>
	typeof photo === 'object' && photo !== null ? photo.id : (photo ?? undefined)

/**
 * The main photos of profiles the public reads, by identifier. Payload fills a media in a profile for no
 * one but its owner: the access rule of the media opens one when it is read by its identifier. The
 * photos are read here in one request, by the identifiers the public read of the profiles gave, which is
 * the same rule: a photo of a profile the public reads is public, and nothing else is read.
 */
async function lireLesPhotos(payload: Payload, profils: readonly ProfilDeLaCarte[]): Promise<PhotosParIdentifiant> {
	const identifiants = [...new Set(profils.map(({ photoPrincipale }) => identifiantDeLaPhoto(photoPrincipale)))].filter(
		(identifiant): identifiant is number | string => identifiant !== undefined
	)
	const photos = new Map<number | string, PhotoDeCarte>()
	if (identifiants.length === 0) return photos
	const { docs } = await payload.find({
		collection: 'media',
		where: { id: { in: identifiants } },
		select: CHAMPS_DE_LA_PHOTO,
		depth: 0,
		limit: LIMITE_MAX_DE_LA_LISTE,
		pagination: false,
		overrideAccess: true,
	})
	for (const media of docs)
		if (typeof media.url === 'string' && media.url !== '')
			photos.set(media.id, { url: media.url, width: media.width ?? null, height: media.height ?? null })
	return photos
}

/** A profile read for a list, as a card: the keys are frozen (U22), no coordinates and no contact. */
function carteDe(profil: ProfilDeLaCarte, photos: PhotosParIdentifiant): CarteDeProfil {
	const identifiant = identifiantDeLaPhoto(profil.photoPrincipale)
	return {
		slug: profil.slug,
		nom: nomAffiche(profil),
		specialite: texte(profil.specialite) || null,
		lieu: formatZone({ city: profil.commune?.nom, radius: profil.rayonKm }) || null,
		superMaquilleuse: profil.superMaquilleuse === true,
		photo: (identifiant !== undefined && photos.get(identifiant)) || null,
	}
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
 * The photos of one profile, in the order asked, a photo that is gone (or has no address) left out.
 * Read by identifier, as `lireLesPhotos` does for the cards: the access rule of the media opens a
 * photo to the public when it is asked by its identifier, and a profile the public reads names only
 * its own photos. An identifier named twice gives the photo twice.
 */
async function lireLesPhotosDuProfil(
	payload: Payload,
	identifiants: readonly (number | string | undefined)[]
): Promise<PhotoDeCarte[]> {
	const demandes = identifiants.filter((identifiant): identifiant is number | string => identifiant !== undefined)
	if (demandes.length === 0) return []
	const { docs } = await payload.find({
		collection: 'media',
		where: { id: { in: [...new Set(demandes)] } },
		select: CHAMPS_DE_LA_PHOTO,
		depth: 0,
		limit: LIMITE_MAX_DE_LA_LISTE,
		pagination: false,
		overrideAccess: true,
	})
	const parIdentifiant = new Map<number | string, PhotoDeCarte>()
	for (const media of docs)
		if (typeof media.url === 'string' && media.url !== '')
			parIdentifiant.set(media.id, { url: media.url, width: media.width ?? null, height: media.height ?? null })
	return demandes.flatMap(identifiant => parIdentifiant.get(identifiant) ?? [])
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
		select: { ...CHAMPS_DE_LA_PAGE_DU_PROFIL, id: true, statut: true, publiable: true },
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: false,
	})
	const profil = docs[0]
	if (!profil || !estVisible(profil)) return null
	const [photo] = await lireLesPhotosDuProfil(payload, [identifiantDeLaPhoto(profil.photoPrincipale)])
	return profilPublicDe(profil, {
		photo: photo ?? null,
		coordonnees: await lireLesCoordonneesPubliees(payload, profil.id),
	})
}

/** What a profile read for its page holds: the fields of `CHAMPS_DE_LA_PAGE_DU_PROFIL` and the state. */
export type ProfilDeLaPage = Pick<
	Profil,
	| 'slug'
	| 'prenom'
	| 'nom'
	| 'nomArtiste'
	| 'specialite'
	| 'description'
	| 'commune'
	| 'rayonKm'
	| 'disponible'
	| 'photoPrincipale'
	| 'reseaux'
	| 'prestations'
	| 'competences'
	| 'langues'
	| 'formations'
	| 'experiences'
	| 'statut'
	| 'publiable'
>

/**
 * The page of a profile from what was read: pure, so that a test gives it the profiles of the set
 * without a database. The photos and the contact details are read apart (they are read by their own
 * rules) and given here.
 */
export function profilPublicDe(
	profil: ProfilDeLaPage,
	lu: { photo: PhotoDeCarte | null; coordonnees: CoordonneesPubliques | null }
): ProfilPublic {
	const nom = nomAffiche(profil)
	return {
		slug: profil.slug,
		nom,
		nomArtiste: nomDArtisteAffiche(profil, nom),
		specialite: texte(profil.specialite) || null,
		zone: formatZone({ city: profil.commune?.nom, radius: profil.rayonKm }) || null,
		disponible: profil.disponible !== false,
		photo: lu.photo,
		lieu: villeAffichee(profil.commune?.nom) || null,
		seDeplace: villeAffichee(profil.commune?.nom) !== '' && rayonKm(profil.rayonKm) !== null,
		prestations: prestations(profil.prestations),
		competences: noms(profil.competences),
		langues: noms(profil.langues),
		formations: formations(profil.formations),
		experiences: experiences(profil.experiences),
		liens: contacts({
			reseaux: profil.reseaux,
			telephone: lu.coordonnees?.telephone,
			email: lu.coordonnees?.email,
		}),
		description: texte(profil.description) || null,
		indexable: estIndexable(profil),
		coordonnees: lu.coordonnees,
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
	const photos = await lireLesPhotos(payload, resultat.docs)
	return {
		cartes: resultat.docs.map(profil => carteDe(profil, photos)),
		page: resultat.page ?? 1,
		totalDocs: resultat.totalDocs,
		hasNextPage: resultat.hasNextPage,
	}
}

/** A listed profile with where she works: what the search by city ranks by. */
export interface ProfilDeLAnnuaire extends PlaceDuProfil {
	carte: CarteDeProfil
}

/** The most pages of the directory one read goes through: 1 000 profiles, ten times the site today. */
const PAGES_MAX_DE_L_ANNUAIRE = 10

/**
 * Every listed profile, most complete first, then most recently changed (ticket 098): what a search by
 * city places in its sections. Read in pages of 100, ten at most; the place of a profile is its
 * commune and the département the server computed from its INSEE code. A card carries no coordinate:
 * the centre of the commune stays here.
 */
export async function lireLAnnuaire(payload: Payload): Promise<ProfilDeLAnnuaire[]> {
	const annuaire: ProfilDeLAnnuaire[] = []
	for (let page = 1; page <= PAGES_MAX_DE_L_ANNUAIRE; page += 1) {
		const resultat = await payload.find({
			collection: 'profils',
			where: FILTRE_LISTE,
			select: CHAMPS_DE_LA_CARTE,
			sort: ['-completude', '-updatedAt', 'slug'],
			depth: 0,
			limit: LIMITE_MAX_DE_LA_LISTE,
			page,
			pagination: true,
			overrideAccess: false,
		})
		const photos = await lireLesPhotos(payload, resultat.docs)
		for (const profil of resultat.docs)
			annuaire.push({
				carte: carteDe(profil, photos),
				ville: texte(profil.commune?.nom) || null,
				departement: texte(profil.commune?.departement) || null,
				seDeplace: texte(profil.commune?.nom) !== '' && rayonKm(profil.rayonKm) !== null,
			})
		if (!resultat.hasNextPage) break
	}
	return annuaire
}
