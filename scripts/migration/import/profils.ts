/**
 * The profiles, `makeup_artistes` → `profils`: the first slice of their import (ticket 026).
 *
 * - Taken: the profiles linked to an account the import takes. The link (`pro`), the slug, the
 *   names, the speciality and the description (docs/migration/SCHEMA.md, §5.2). The other fields
 *   of the profile, its lists and its photos come with their own tickets (059, 060, 058…).
 * - The slug is the one of the old site: the rule ported as it is (src/lib/slug.ts), computed on
 *   every profile of the source, the oldest keeping a slug two usernames share (register,
 *   `slug-stocke`).
 * - Provisional rule of the status, until the server computes it at each save (tickets 044 and
 *   059): a profile entirely empty at the source is a draft (register, `profils-vides-brouillon`),
 *   any other one is published. « Entirely empty » is the single rule of src/lib/profil/completude.ts,
 *   read on the source as the old site reads it: main picture, city, speciality, offers, description,
 *   networks.
 * - A profile whose account the table of decisions sets aside stops the import before any write,
 *   listed by its identifier, until the table decides to leave it aside too (`profilsEcartes`,
 *   SCHEMA.md §11). Set aside, it is listed with the documents the table sets aside.
 * - A profile without a link to an account the source holds is left aside and listed. Ticket 059
 *   sets the rule of the 13 profiles of the spam, and stops the import on any other one.
 *
 * The networks hold the contact details of the profile: they are read into memory to tell whether
 * a contact channel exists, and nothing else of them is kept.
 */

import { type ChampsDuProfil, estEntierementVide, type ReseauxDuProfil } from '../../../src/lib/profil/completude'
import type { StatutDuProfil } from '../../../src/lib/profil/statut'
import { attribuerSlugs } from '../../../src/lib/slug'
import { REFERENCES } from './ecarts'
import type { Adaptateur, Attendu, Ecart } from './moteur'
import { iso, type Requete } from './source'

/** A row of `makeup_artistes`, as this slice reads it. */
export interface LigneProfil {
	id: number
	first_name: string | null
	last_name: string | null
	company_artist_name: string | null
	speciality: string | null
	description: string | null
	city: string | null
	username: string | null
	created_at: string
}

/** What a profile of the source holds besides its row: its account, and what tells whether it is empty. */
export interface ProfilLu extends LigneProfil {
	/** The account it is linked to (`makeup_artistes_user_links`), or none. */
	compte: number | null
	aPhotoPrincipale: boolean
	prix: (string | null)[]
	reseaux: ReseauxDuProfil | null
}

/** The type Strapi gives a profile in the links of its files. */
const TYPE_PROFIL = 'api::makeup-artiste.makeup-artiste'

const LECTURE_DES_PROFILS = `SELECT id, first_name, last_name, company_artist_name, speciality, description, city, username,
	${iso('created_at')} AS created_at
	FROM makeup_artistes ORDER BY id`

const LECTURE_DES_LIENS =
	'SELECT makeup_artiste_id AS profil, user_id AS compte FROM makeup_artistes_user_links ORDER BY id'

const LECTURE_DES_RESEAUX = `SELECT l.entity_id AS profil, n.youtube, n.facebook, n.instagram, n.website, n.linkedin, n.phone, n.email
	FROM makeup_artistes_components l JOIN components_makeupartists_networks n ON n.id = l.component_id
	WHERE l.component_type = 'makeupartists.network' AND l.field = 'network' ORDER BY l."order", l.id`

const LECTURE_DES_PRIX = `SELECT l.entity_id AS profil, o.price
	FROM makeup_artistes_components l JOIN components_makeupartists_service_offers o ON o.id = l.component_id
	WHERE l.component_type = 'makeupartists.service-offers' AND l.field = 'service_offers' ORDER BY l."order", l.id`

const LECTURE_DES_PHOTOS_PRINCIPALES = `SELECT DISTINCT related_id AS profil FROM files_related_morphs
	WHERE related_type = '${TYPE_PROFIL}' AND field = 'main_picture'`

/** The profiles of the source, each one with its account and what tells whether it is empty. */
export async function lireLesProfils(requete: Requete): Promise<ProfilLu[]> {
	const lignes = await requete<LigneProfil>(LECTURE_DES_PROFILS)
	const liens = await requete<{ profil: number; compte: number }>(LECTURE_DES_LIENS)
	const reseaux = await requete<ReseauxDuProfil & { profil: number }>(LECTURE_DES_RESEAUX)
	const prix = await requete<{ profil: number; price: string | null }>(LECTURE_DES_PRIX)
	const photos = new Set(
		(await requete<{ profil: number }>(LECTURE_DES_PHOTOS_PRINCIPALES)).map(({ profil }) => Number(profil))
	)
	const compteDe = new Map(liens.map(({ profil, compte }) => [Number(profil), Number(compte)]))
	const reseauxDe = new Map(reseaux.map(({ profil, ...reseau }) => [Number(profil), reseau]))
	return lignes.map(ligne => ({
		...ligne,
		compte: compteDe.get(ligne.id) ?? null,
		aPhotoPrincipale: photos.has(ligne.id),
		prix: prix.filter(({ profil }) => Number(profil) === ligne.id).map(({ price }) => price),
		reseaux: reseauxDe.get(ligne.id) ?? null,
	}))
}

/** What the single rule of completeness reads of a profile of the source, under the names of the old site. */
export const champsDuProfil = (profil: ProfilLu): ChampsDuProfil => ({
	first_name: profil.first_name,
	last_name: profil.last_name,
	company_artist_name: profil.company_artist_name,
	speciality: profil.speciality,
	city: profil.city,
	description: profil.description,
	main_picture: profil.aPhotoPrincipale ? {} : null,
	service_offers: profil.prix.map(price => ({ price })),
	network: profil.reseaux,
})

/** Provisional rule of the status (tickets 044 and 059): entirely empty, a draft; otherwise published. */
export const statutProvisoire = (profil: ProfilLu): StatutDuProfil =>
	estEntierementVide(champsDuProfil(profil)) ? 'brouillon' : 'publie'

export const ADAPTATEUR_PROFILS: Adaptateur = {
	collection: 'profils',
	champs: {
		pro: 'relation',
		slug: 'texte',
		prenom: 'texte',
		nom: 'texte',
		nomArtiste: 'texte',
		specialite: 'texte',
		description: 'texte',
		statut: 'texte',
	},
}

/** What the table of decisions makes of the profiles whose account it sets aside (SCHEMA.md §11). */
export interface ProfilsDesComptesEcartes {
	/** Profiles a decision leaves aside with their account: not taken, listed. */
	ecartes: number[]
	/** Profiles of an account set aside that no decision names: they stop the import before any write. */
	sansDecision: number[]
	/** Decisions that name no profile of an account set aside: without effect. */
	sansObjet: number
}

/** The profiles linked to an account the decisions set aside, split by what the table says of them. */
export function profilsDesComptesEcartes(
	profils: readonly ProfilLu[],
	comptesEcartes: readonly number[],
	profilsEcartes: readonly number[]
): ProfilsDesComptesEcartes {
	const comptes = new Set(comptesEcartes)
	const decides = new Set(profilsEcartes)
	const concernes = profils
		.filter(({ compte }) => compte !== null && comptes.has(compte))
		.map(({ id }) => id)
		.sort((a, b) => a - b)
	return {
		ecartes: concernes.filter(id => decides.has(id)),
		sansDecision: concernes.filter(id => !decides.has(id)),
		sansObjet: [...decides].filter(id => !concernes.includes(id)).length,
	}
}

export interface ProfilsAttendus {
	attendus: Attendu[]
	/** Profiles the table of decisions sets aside with their account: not taken, listed. */
	ecartes: number[]
	/** Profiles without an account the import takes, and no decision: left aside, listed (ticket 059). */
	sansCompte: number[]
	/** How many profiles the run takes per status. */
	statuts: Record<string, number>
}

/**
 * The profiles the target must hold. `comptes` gives, for each account the import takes, its
 * identifier in Payload, or `null` while it is still to be created (a dry run). `ecartes` names
 * the profiles the table of decisions sets aside.
 */
export function profilsAttendus(
	profils: readonly ProfilLu[],
	comptes: ReadonlyMap<number, number | null>,
	ecartes: readonly number[] = []
): ProfilsAttendus {
	const decides = new Set(ecartes)
	// The slugs of the old site, computed on every profile of the source, as the old site did.
	const slugs = new Map(
		attribuerSlugs(profils.map(({ id, username, created_at }) => ({ id, username, createdAt: created_at }))).map(
			({ id, slug }) => [Number(id), slug]
		)
	)
	const attendus: Attendu[] = []
	const sansCompte: number[] = []
	const statuts: Record<string, number> = {}
	for (const profil of profils) {
		if (decides.has(profil.id)) continue
		if (profil.compte === null || !comptes.has(profil.compte)) {
			sansCompte.push(profil.id)
			continue
		}
		const slug = slugs.get(profil.id) ?? null
		const statut = statutProvisoire(profil)
		statuts[statut] = (statuts[statut] ?? 0) + 1
		const ecarts: Ecart[] = []
		if (slug !== profil.username) ecarts.push({ champ: 'slug', reference: REFERENCES.slugStocke })
		if (statut === 'brouillon') ecarts.push({ champ: 'statut', reference: REFERENCES.profilVideEnBrouillon })
		attendus.push({
			strapiId: profil.id,
			valeurs: {
				strapiId: profil.id,
				pro: comptes.get(profil.compte) ?? null,
				slug,
				prenom: profil.first_name,
				nom: profil.last_name,
				nomArtiste: profil.company_artist_name,
				specialite: profil.speciality,
				description: profil.description,
				statut,
			},
			ecarts,
		})
	}
	return {
		attendus,
		ecartes: profils
			.filter(({ id }) => decides.has(id))
			.map(({ id }) => id)
			.sort((a, b) => a - b),
		sansCompte,
		statuts,
	}
}
