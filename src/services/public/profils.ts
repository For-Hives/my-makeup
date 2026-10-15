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
 * - The lists keep the access rules of the collection (`overrideAccess: false`), as an anonymous
 *   visitor. The page of a profile lifts them (`lireLAdresseDeProfil`): a draft answers in noindex
 *   (ticket 104). The three rules (listed, indexable, visible) are src/lib/profil/visibilite.ts;
 *   none is written again here.
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
import { type Pid, pidDuProfil } from '@/lib/analytics/pid'
import { formatZone, rayonKm, villeAffichee } from '@/lib/format-zone'
import { estMontantDePrix, prixMinimal } from '@/lib/prix'
import { cibleDeLAdresse, valeursARechercher } from '@/lib/profil/adresse'
import { nomAffiche, texte } from '@/lib/profil/nom-affiche'
import { pidDuProfil as pidDeLaPage } from '@/lib/profil/pid'
import { STATUT_PUBLIE } from '@/lib/profil/statut'
import { estIndexable, FILTRE_LISTE } from '@/lib/profil/visibilite'
import {
	contacts,
	type ExperiencePublique,
	experiences,
	type FormationPublique,
	formations,
	type LienDeContact,
	lignes,
	nomDArtisteAffiche,
	noms,
	type PrestationPublique,
	prestations,
} from '@/lib/profil/vue-publique'
import type { PlaceDuProfil } from '@/lib/recherche/lieu'
import { normaliserLesTextes, type TextesNormalises } from '@/lib/recherche/pertinence'
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
	// Only to make the `pid` of the audience measure (src/lib/profil/pid.ts); the page shows none of it.
	strapiId: true,
	commune: { nom: true },
	rayonKm: true,
	disponible: true,
	photoPrincipale: true,
	galerie: true,
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
	/** The id the audience measure counts the profile under (src/lib/profil/pid.ts), or `null` when unknown. */
	pid: Pid | null
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
	/** The photos of her portfolio, in the order she gave, a photo that is gone left out. */
	galerie: PhotoDeCarte[]
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
	/** The offers with a name, with their amount in euros (what the structured data prices; no option). */
	offres: OffreChiffree[]
	/** The lowest amount of her offers (src/lib/prix.ts, `prixMinimal`, U37), or `null`. */
	prixMinimal: number | null
}

/** An offer as the structured data says it: its name, its text, and its amount in euros when it has a usable one. */
export interface OffreChiffree {
	nom: string
	description: string
	montant: number | null
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
	/** The id the measure counts the profile under (src/lib/analytics/pid.ts): public, no personal data. */
	pid: Pid
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
	| 'id'
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

/**
 * The measure id of profiles the public reads (`pid`, plan 04 §3.2). The old id lives in a field the
 * public does not read, so it is read here, by the identifiers the public read of the profiles gave,
 * and nothing else is read of those profiles.
 */
async function lireLesPid(payload: Payload, profils: readonly { id: number }[]): Promise<ReadonlyMap<number, Pid>> {
	const pid = new Map<number, Pid>()
	if (profils.length === 0) return pid
	const { docs } = await payload.find({
		collection: 'profils',
		where: { id: { in: profils.map(({ id }) => id) } },
		select: { strapiId: true },
		depth: 0,
		limit: LIMITE_MAX_DE_LA_LISTE,
		pagination: false,
		overrideAccess: true,
	})
	for (const { id, strapiId } of docs) pid.set(id, pidDuProfil({ id, strapiId }))
	return pid
}

/** A profile read for a list, as a card: the keys are frozen (U22), no coordinates and no contact. */
function carteDe(profil: ProfilDeLaCarte, photos: PhotosParIdentifiant, pids: ReadonlyMap<number, Pid>): CarteDeProfil {
	const identifiant = identifiantDeLaPhoto(profil.photoPrincipale)
	return {
		slug: profil.slug,
		pid: pids.get(profil.id) ?? pidDuProfil({ id: profil.id }),
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
 * The photos a profile names (her main photo and her portfolio), by identifier, in one read; a photo that
 * is gone, or has no address, is not in the map. Read by identifier, as `lireLesPhotos` does for the
 * cards: the access rule of the media opens a photo to the public when it is asked by its identifier,
 * and a profile the public reads names only its own photos.
 */
async function lireLesPhotosDuProfil(
	payload: Payload,
	identifiants: readonly (number | string | undefined)[]
): Promise<PhotosParIdentifiant> {
	const demandes = [...new Set(identifiants)].filter(
		(identifiant): identifiant is number | string => identifiant !== undefined
	)
	const photos = new Map<number | string, PhotoDeCarte>()
	if (demandes.length === 0) return photos
	const { docs } = await payload.find({
		collection: 'media',
		where: { id: { in: demandes } },
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

/** What the address of a profile leads to: the profile, a redirection to its slug, or nothing. */
export type AdresseDeProfil =
	| { type: 'profil'; profil: ProfilPublic; publie: boolean }
	| { type: 'redirection'; slug: string }
	| { type: 'inconnue' }

/**
 * What the address `/profil/<segment>` leads to (ticket 104): the profile itself, a redirection to its
 * slug (an old username, or a variant of the slug), or nothing (unknown, or hidden). The rule is
 * src/lib/profil/adresse.ts.
 *
 * The read lifts the access rules of the collection, which keep the published profiles only, for two
 * reasons: a profile that is visible but not published (a draft) answers its page in noindex, as on the
 * site today, and the old username (`legacyUsername`) is closed to the public. Nothing else is lifted:
 * the fields are chosen one by one, a hidden profile is dropped by the rule (`estVisible`), and the
 * contact details are read apart.
 */
export async function lireLAdresseDeProfil(payload: Payload, segment: string): Promise<AdresseDeProfil> {
	const valeurs = valeursARechercher(segment)
	if (!valeurs) return { type: 'inconnue' }
	const { docs } = await payload.find({
		collection: 'profils',
		where: {
			or: [
				{ slug: { equals: valeurs.segment } },
				{ slug: { equals: valeurs.slugifie } },
				{ legacyUsername: { equals: valeurs.segment } },
			],
		},
		select: {
			...CHAMPS_DE_LA_PAGE_DU_PROFIL,
			id: true,
			statut: true,
			publiable: true,
			legacyUsername: true,
			createdAt: true,
		},
		sort: ['createdAt', 'id'],
		depth: 0,
		// Two usernames can be the same, a slug is unique: a handful of candidates at most.
		limit: LIMITE_DES_CANDIDATS,
		pagination: false,
		overrideAccess: true,
	})
	const cible = cibleDeLAdresse(segment, docs)
	if (cible.type !== 'profil') return cible
	return {
		type: 'profil',
		// Only a published profile is refreshed by a save (src/lib/revalidation.ts): the page keeps it in the cache.
		publie: cible.profil.statut === STATUT_PUBLIE,
		profil: await profilPublicLu(payload, cible.profil),
	}
}

/** A profile read with `CHAMPS_DE_LA_PAGE_DU_PROFIL` and its id, as a public page shows it: photos and published contact included. */
async function profilPublicLu(payload: Payload, profil: ProfilDeLaPage & { id: number }): Promise<ProfilPublic> {
	const principale = identifiantDeLaPhoto(profil.photoPrincipale)
	// The portfolio, in the order she gave; a photo named twice is shown twice.
	const rangee = (profil.galerie ?? []).map(photo => identifiantDeLaPhoto(photo))
	const photos = await lireLesPhotosDuProfil(payload, [principale, ...rangee])
	return profilPublicDe(profil, {
		photo: (principale !== undefined && photos.get(principale)) || null,
		galerie: rangee.flatMap(identifiant => (identifiant !== undefined && photos.get(identifiant)) || []),
		coordonnees: await lireLesCoordonneesPubliees(payload, profil.id),
	})
}

/** Where her profile stands, as the preview banner says it (src/lib/espace/apercu.ts). */
export type EtatDuProfilApercu = Pick<Profil, 'statut' | 'disponible' | 'entierementVide' | 'publiable'>

/**
 * Her own page as a visitor sees it (ticket 139): the same `ProfilPublic` as `lireLAdresseDeProfil`,
 * built by the same code, for the profile with this identifier whether it is listed, a draft or even
 * hidden. The identifier is the one the server found by her session (`identifiantDuProfil`), never one
 * a request gave. The contact details are the ones she published, exactly as the public sees them.
 * `null` when the profile does not exist.
 */
export async function lireLApercuDuProfil(
	payload: Payload,
	id: number
): Promise<{ profil: ProfilPublic; etat: EtatDuProfilApercu } | null> {
	const { docs } = await payload.find({
		collection: 'profils',
		where: { id: { equals: id } },
		select: { ...CHAMPS_DE_LA_PAGE_DU_PROFIL, id: true, statut: true, publiable: true, entierementVide: true },
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
	})
	const doc = docs[0]
	if (!doc) return null
	return {
		profil: await profilPublicLu(payload, doc),
		etat: {
			statut: doc.statut,
			disponible: doc.disponible,
			entierementVide: doc.entierementVide,
			publiable: doc.publiable,
		},
	}
}

/** How many profiles one address can match: the slug, its variant, and the profiles sharing an old username. */
const LIMITE_DES_CANDIDATS = 20

/** The profile at this slug, or `null`: unknown, hidden, or a slug that is not the profile's own. */
export async function lireLeProfilPublic(payload: Payload, slug: string): Promise<ProfilPublic | null> {
	if (!estUnSlug(slug)) return null
	const cible = await lireLAdresseDeProfil(payload, slug)
	return cible.type === 'profil' ? cible.profil : null
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
	| 'galerie'
	| 'reseaux'
	| 'prestations'
	| 'competences'
	| 'langues'
	| 'formations'
	| 'experiences'
	| 'statut'
	| 'publiable'
	| 'strapiId'
>

/**
 * The page of a profile from what was read: pure, so that a test gives it the profiles of the set
 * without a database. The photos and the contact details are read apart (they are read by their own
 * rules) and given here.
 */
export function profilPublicDe(
	profil: ProfilDeLaPage & { id?: number },
	lu: { photo: PhotoDeCarte | null; galerie: PhotoDeCarte[]; coordonnees: CoordonneesPubliques | null }
): ProfilPublic {
	const nom = nomAffiche(profil)
	return {
		slug: profil.slug,
		pid: pidDeLaPage(profil),
		nom,
		nomArtiste: nomDArtisteAffiche(profil, nom),
		specialite: texte(profil.specialite) || null,
		zone: formatZone({ city: profil.commune?.nom, radius: profil.rayonKm }) || null,
		disponible: profil.disponible !== false,
		photo: lu.photo,
		galerie: lu.galerie,
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
		offres: offresChiffrees(profil.prestations),
		prixMinimal: prixMinimal(profil.prestations),
	}
}

/** The offers with a name, each with its amount when it is one the site counts as a price. */
function offresChiffrees(stockees: ProfilDeLaPage['prestations']): OffreChiffree[] {
	return (stockees ?? []).flatMap(ligne => {
		const nom = texte(ligne?.nom)
		if (nom === '') return []
		const montant = ligne?.prixAPartirDe
		return [
			{
				nom,
				description: lignes(ligne?.description).join(' '),
				montant: estMontantDePrix(montant) ? montant : null,
			},
		]
	})
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
	const pids = await lireLesPid(payload, resultat.docs)
	return {
		cartes: resultat.docs.map(profil => carteDe(profil, photos, pids)),
		page: resultat.page ?? 1,
		totalDocs: resultat.totalDocs,
		hasNextPage: resultat.hasNextPage,
	}
}

/** A listed profile with where she works: what the search by city ranks by. */
export interface ProfilDeLAnnuaire extends PlaceDuProfil {
	carte: CarteDeProfil
	/**
	 * What she wrote that a search by a word looks into (ticket 099). Beside the card, never in it: a card
	 * is what a page renders, and carries none of this. Read only when asked (`avecLesTextes`).
	 */
	textes?: TextesNormalises
}

/** The fields a search by a word reads on top of a card: her texts, and no price, no contact, no link. */
const CHAMPS_DE_LA_RECHERCHE = {
	...CHAMPS_DE_LA_CARTE,
	description: true,
	competences: true,
	prestations: true,
} as const

type ProfilCherche = ProfilDeLaCarte & Pick<Profil, 'description' | 'competences' | 'prestations'>

/** The texts a search by a word looks into (the commune, the speciality, the description, the skills and the offers), normalised. */
function textesDe(profil: ProfilCherche): TextesNormalises {
	const noms = <T extends { nom?: string | null }>(liste: readonly T[] | null | undefined): string[] =>
		(liste ?? []).map(element => texte(element.nom)).filter(nom => nom !== '')
	const descriptions = <T extends { description?: string | null }>(liste: readonly T[] | null | undefined): string[] =>
		(liste ?? []).map(element => texte(element.description)).filter(description => description !== '')
	return normaliserLesTextes({
		ville: texte(profil.commune?.nom),
		specialite: texte(profil.specialite),
		description: texte(profil.description),
		competences: noms(profil.competences),
		descriptionsDesCompetences: descriptions(profil.competences),
		descriptionsDesPrestations: descriptions(profil.prestations),
		nom: texte(profil.nom),
		prenom: texte(profil.prenom),
	})
}

/** The most pages of the directory one read goes through: 1 000 profiles, ten times the site today. */
const PAGES_MAX_DE_L_ANNUAIRE = 10

/**
 * Every listed profile, most complete first, then most recently changed (ticket 098): what a search by
 * city places in its sections. Read in pages of 100, ten at most; the place of a profile is its
 * commune and the département the server computed from its INSEE code. A card carries no coordinate:
 * the centre of the commune stays here. With `avecLesTextes` (ticket 099) each profile also carries the
 * texts a search by a word looks into, beside its card.
 */
export async function lireLAnnuaire(
	payload: Payload,
	{ avecLesTextes = false }: { avecLesTextes?: boolean } = {}
): Promise<ProfilDeLAnnuaire[]> {
	const annuaire: ProfilDeLAnnuaire[] = []
	for (let page = 1; page <= PAGES_MAX_DE_L_ANNUAIRE; page += 1) {
		const resultat = await payload.find({
			collection: 'profils',
			where: FILTRE_LISTE,
			select: avecLesTextes ? CHAMPS_DE_LA_RECHERCHE : CHAMPS_DE_LA_CARTE,
			sort: ['-completude', '-updatedAt', 'slug'],
			depth: 0,
			limit: LIMITE_MAX_DE_LA_LISTE,
			page,
			pagination: true,
			overrideAccess: false,
		})
		const photos = await lireLesPhotos(payload, resultat.docs)
		const pids = await lireLesPid(payload, resultat.docs)
		for (const profil of resultat.docs)
			annuaire.push({
				carte: carteDe(profil, photos, pids),
				ville: texte(profil.commune?.nom) || null,
				departement: texte(profil.commune?.departement) || null,
				seDeplace: texte(profil.commune?.nom) !== '' && rayonKm(profil.rayonKm) !== null,
				...(avecLesTextes && { textes: textesDe(profil) }),
			})
		if (!resultat.hasNextPage) break
	}
	return annuaire
}
