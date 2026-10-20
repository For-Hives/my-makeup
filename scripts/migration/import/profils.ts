/**
 * The profiles, `makeup_artistes` → `profils` (docs/migration/SCHEMA.md, §5.2): their identity
 * (tickets 026 and 059), their lists, networks and photos (ticket 060, ./sections.ts).
 *
 * - Taken: the profiles linked to an account the import takes. The link (`pro`), the slug, the
 *   username of the old site (`legacyUsername`, as it is), the names, the speciality, the
 *   description, the availability, the score, the « Super maquilleuse » badge and the dates.
 * - The slug is the one of the old site: the rule ported as it is (src/lib/slug.ts), computed on
 *   every profile of the source, the oldest keeping a slug two usernames share (register,
 *   `slug-stocke`).
 * - An availability never set (`null`) is « available » (register, `disponibilite-par-defaut`):
 *   the only exception to « null stays null » (SCHEMA.md, rule 2).
 * - The city typed becomes a commune of the official list, with its INSEE code, never an address
 *   (./communes.ts, ticket 063; register, `ville-en-commune`): the text typed is never copied.
 * - The status is never written: the server computes it at every save from what the import writes
 *   (ticket 044). An entirely empty profile is a draft (register, `profils-vides-brouillon`), any
 *   other is published. The import leaves the choice of the status to the rule (`automatique`): a
 *   choice fixed by an earlier run, which wrote the status, goes back to the rule. It compares the
 *   status the server stored with the one the rule gives, and lists the profiles whose status is
 *   not the one the source itself gives (`statutsDifferentsDeLaSource`): a section not taken yet,
 *   or a city that gives no commune.
 * - The 13 empty profiles the spam of 10/10/2026 left without an account (SCHEMA.md §4.1) are set
 *   aside and counted, never taken (register, `profils-spam-non-repris`). Any other profile without
 *   an account in the source stops the import before any write, until the table of decisions
 *   leaves it aside (`profilsEcartes`).
 * - A profile whose account the table of decisions sets aside stops the import too, until the
 *   table leaves it aside with its account (SCHEMA.md §11).
 *
 * - Its lists, its networks and its photos are those of the old site, in their order
 *   (./sections.ts, ticket 060): a photo whose file is not adopted (./medias.ts) is reported, never
 *   invented.
 *
 * - Its prices keep the text typed and gain the amount the single rule reads in it (src/lib/prix.ts,
 *   ticket 062): `bilanDesPrix` counts them, and lists the profiles that would lose their priced
 *   offer or hold digits the rule does not read.
 *
 * - The network row of Strapi also holds the phone and the email of contact (ticket 064). They go
 *   into the closed group `coordonnees`, trimmed; a value that is only blanks, `null` or `undefined` is no value (as on the old site), and one the server would refuse is left out and listed for review. A
 *   profile with one of them shows it on the old site: it gets `contactPublic` true, `consentiLe`
 *   the date of the switch (a parameter of the run, never the clock) and the source `import`
 *   (« publié par la maquilleuse », register `coordonnees-consentement`). Without either: false,
 *   no date, no source. The report counts them, never shows them.
 */

import { estMontantDePrix, parsePrice, prixMinimal } from '../../../src/lib/prix'
import { type ChampsDuProfil, estEntierementVide, type ReseauxDuProfil } from '../../../src/lib/profile/completude'
import { validerEmailDeContact, validerTelephone } from '../../../src/lib/profile/coordonnees'
import { type DocumentDuProfil, etatDuProfil, statutApres } from '../../../src/lib/profile/etat'
import { CHOIX_INITIAL, type StatutDuProfil } from '../../../src/lib/profile/statut'
import { BORNES_DU_RAYON_KM } from '../../../src/lib/profile/zone'
import { attribuerSlugs } from '../../../src/lib/slug'
import type { CommuneAttendue } from './communes'
import { REFERENCES } from './ecarts'
import { type PhotoNonReprise, photosDeLEntree } from './medias'
import { type Adaptateur, type Attendu, type Ecart, normaliser } from './moteur'
import {
	type LigneLaissee,
	lignesDansLesBornes,
	lireLesSections,
	SECTIONS_VIDES,
	type SectionsLues,
	valeursDesListes,
} from './sections'
import { iso, type Requete } from './source'

/**
 * The profiles the spam of 10/10/2026 left without an account, empty, never modified
 * (docs/migration/SCHEMA.md §4.1; decision of 13/10/2026): set aside by the import itself. The
 * list never grows on its own: any other profile without an account stops the import.
 */
export const PROFILS_DU_SPAM: readonly number[] = [67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108]

/** A row of `makeup_artistes`, as the import reads it. */
export interface LigneProfil {
	id: number
	first_name: string | null
	last_name: string | null
	company_artist_name: string | null
	speciality: string | null
	description: string | null
	city: string | null
	/** The radius in km, an `integer` of Strapi (0 to 2 147 483 647): the v3 takes 0 to 200 (`rayonDeLaSource`). */
	action_radius?: number | null
	username: string | null
	/** A `decimal` of Strapi: the driver gives it as text. */
	score: string | number | null
	available: boolean | null
	/** The « Super maquilleuse » badge, not the account. */
	pro: boolean | null
	created_at: string
	updated_at: string
}

/** What a profile of the source holds besides its row: its account, its sections, and what tells whether it is empty. */
export interface ProfilLu extends LigneProfil {
	/** The account it is linked to (`makeup_artistes_user_links`), or none. */
	compte: number | null
	aPhotoPrincipale: boolean
	prix: (string | null)[]
	reseaux: ReseauxDuProfil | null
	/** Its lists, its networks and its photos, in their order (./sections.ts). */
	sections: SectionsLues
}

const LECTURE_DES_PROFILS = `SELECT id, first_name, last_name, company_artist_name, speciality, description, city, action_radius, username,
	score, available, pro, ${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at
	FROM makeup_artistes ORDER BY id`

const LECTURE_DES_LIENS =
	'SELECT makeup_artiste_id AS profil, user_id AS compte FROM makeup_artistes_user_links ORDER BY id'

/**
 * The profiles of the source, each one with its account, its sections, and what tells whether it is
 * empty: the main picture, the prices and the networks are read in its sections.
 */
export async function lireLesProfils(requete: Requete): Promise<ProfilLu[]> {
	const lignes = await requete<LigneProfil>(LECTURE_DES_PROFILS)
	const liens = await requete<{ profil: number; compte: number }>(LECTURE_DES_LIENS)
	const sections = await lireLesSections(requete)
	const compteDe = new Map(liens.map(({ profil, compte }) => [Number(profil), Number(compte)]))
	return lignes.map(ligne => {
		const lues = sections.get(ligne.id) ?? SECTIONS_VIDES
		return {
			...ligne,
			compte: compteDe.get(ligne.id) ?? null,
			aPhotoPrincipale: lues.photoPrincipale.length > 0,
			prix: lues.prestations.map(({ price }) => price),
			reseaux: lues.reseau,
			sections: lues,
		}
	})
}

/**
 * What the single rule of completeness reads of a profile of the source, under the names of the
 * old site, as the old site reads it: main picture, city, speciality, offers, description, networks.
 */
export const champsDeLaSource = (profil: ProfilLu): ChampsDuProfil => ({
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

/** Whether the source itself says a profile is entirely empty: none of the six conditions. */
export const videALaSource = (profil: ProfilLu): boolean => estEntierementVide(champsDeLaSource(profil))

/**
 * The status the server computes for a profile from what the import writes, by its own rule
 * (src/lib/profil/etat.ts), the choice of the status left to the rule: a draft when entirely empty,
 * published otherwise.
 */
export function statutCalcule(valeurs: Readonly<Record<string, unknown>>): StatutDuProfil {
	const { fullyEmpty } = etatDuProfil(valeurs as DocumentDuProfil)
	return statutApres({ apres: { chosenStatus: CHOIX_INITIAL }, fullyEmpty }).status
}

/** A `decimal` of Strapi as a number, or `null`. */
const nombre = (valeur: string | number | null | undefined): number | null =>
	valeur === null || valeur === undefined ? null : Number(valeur)

/** A radius of the source that the v3 does not take: the profile, and the value (a distance, nothing personal). */
export type RayonARevoir = { profil: number; rayonKm: number }

/**
 * The radius of action of a profile of the source (register, `rayon-200-km`): a whole number of
 * kilometres from 0 to 200 is taken as it is, nothing is empty. A radius the server would refuse
 * (above 200 km: the old site accepted up to 1 000, and the real base held 400) is never brought
 * back to 200 in silence: the field stays empty and `rayonsARevoir` lists the profile.
 */
export function rayonDeLaSource(profil: Pick<LigneProfil, 'action_radius'>): number | null {
	const rayon = nombre(profil.action_radius)
	if (rayon === null) return null
	return Number.isInteger(rayon) && rayon >= BORNES_DU_RAYON_KM.min && rayon <= BORNES_DU_RAYON_KM.max ? rayon : null
}

/** The radius of the source that `rayonDeLaSource` leaves out, for the report. */
export function rayonARevoir(profil: Pick<LigneProfil, 'id' | 'action_radius'>): RayonARevoir | null {
	const rayon = nombre(profil.action_radius)
	return rayon !== null && rayonDeLaSource(profil) === null ? { profil: profil.id, rayonKm: rayon } : null
}

/** The words the old site reads as no value (`texte()`, src/lib/profil/vue-publique.js). */
const MOTS_VIDES = new Set(['null', 'undefined'])

/**
 * A contact detail as the old site reads it: trimmed, and nothing when it is blank or only the word
 * `null` or `undefined`, in any case. Such a value shows nothing on the old site, so it is no value.
 */
const coordonnee = (valeur: string | null | undefined): string | null => {
	const texte = valeur?.trim() ?? ''
	return texte === '' || MOTS_VIDES.has(texte.toLowerCase()) ? null : texte
}

/** A contact detail the old site showed and the server would refuse (padding aside): which one, never its value. */
export type CoordonneeARevoir = { profil: number; champ: 'telephone' | 'email' }

/**
 * The phone and the email of contact of a profile of the source, under the names of Payload. A value
 * the validators of the profile refuse (a free text in the email field, a phone longer than 20
 * characters) is left out, so that the whole profile is not refused for it: it is listed by
 * `coordonneesARevoir`, and it does not open the contact details.
 */
export function coordonneesDeLaSource(profil: ProfilLu): { telephone: string | null; email: string | null } {
	const telephone = coordonnee(profil.reseaux?.phone)
	const email = coordonnee(profil.reseaux?.email)
	return {
		telephone: validerTelephone(telephone) === true ? telephone : null,
		email: validerEmailDeContact(email) === true ? email : null,
	}
}

/** The contact details of a profile that are left out because the server would refuse them. */
export function coordonneesARevoir(profil: ProfilLu): CoordonneeARevoir[] {
	const lues = { telephone: coordonnee(profil.reseaux?.phone), email: coordonnee(profil.reseaux?.email) }
	const gardees = coordonneesDeLaSource(profil)
	return (['telephone', 'email'] as const)
		.filter(champ => lues[champ] !== null && gardees[champ] === null)
		.map(champ => ({ profil: profil.id, champ }))
}

/** The contact details as the collection stores them (`contactDetails`): the phone, the email. */
export function detailsDeContactDeLaSource(profil: ProfilLu): { phone: string | null; email: string | null } {
	const { telephone, email } = coordonneesDeLaSource(profil)
	return { phone: telephone, email }
}

/** Whether the old site shows a phone or an email for this profile. */
export const affichesALaSource = (profil: ProfilLu): boolean => {
	const { telephone, email } = coordonneesDeLaSource(profil)
	return telephone !== null || email !== null
}

/**
 * The date of the switch, as the parameter of the run gives it: a day (`2026-11-02`, midnight UTC)
 * or an instant with its zone (`2026-11-02T08:00:00Z`), as an ISO string. `null` when it is
 * neither, or not a real date.
 */
export function dateDeBascule(texte: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(texte)) return null
	// `Date` lets 30 February through (it reads 2 March): the day must exist in its month.
	const [annee = 0, mois = 0, jour = 0] = texte.slice(0, 10).split('-').map(Number)
	if (new Date(Date.UTC(annee, mois - 1, jour)).getUTCDate() !== jour) return null
	const date = new Date(texte)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const ADAPTATEUR_PROFILS: Adaptateur = {
	collection: 'profiles',
	champs: {
		pro: 'relation',
		slug: 'texte',
		legacyUsername: 'texte',
		firstName: 'texte',
		lastName: 'texte',
		artistName: 'texte',
		specialty: 'texte',
		description: 'texte',
		city: 'objet',
		radiusKm: 'nombre',
		available: 'booleen',
		score: 'nombre',
		superArtist: 'booleen',
		mainPicture: 'relation',
		gallery: 'relations',
		networks: 'objet',
		contactDetails: 'objet',
		publicContact: 'booleen',
		consentedAt: 'date',
		consentSource: 'texte',
		skills: 'liste',
		languages: 'liste',
		courses: 'liste',
		experiences: 'liste',
		serviceOffers: 'liste',
		chosenStatus: 'texte',
		status: 'texte',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// Computed by the server at every save (ticket 044): compared, never sent.
	calcules: ['status'],
	// The date of the consent is the one of the first run that gave it: a later run with another date of
	// the switch keeps it (ticket 227). The server dates it again when the contact details are closed
	// then opened (src/lib/profil/coordonnees.ts), and the field is empty then, so the run fills it in.
	amorces: ['consentedAt'],
}

/**
 * The profiles on a target the v3 already uses (`--cible-en-service`, ticket 227): a profile the target
 * holds is left exactly as it is, every field of it. A makeup artist who closed her phone or her email,
 * moved her commune or changed her lists and photos in the v3 would otherwise get the old site back,
 * with a public phone and the consent of the import. Only a profile the target misses is created.
 */
export const ADAPTATEUR_PROFILS_EN_SERVICE: Adaptateur = {
	...ADAPTATEUR_PROFILS,
	figes: Object.keys(ADAPTATEUR_PROFILS.champs),
}

/**
 * The profiles whose date of consent differs from the date this run asks for: the target keeps the
 * date it holds (`amorces`), the run counts the difference. Identifiers only.
 */
export function consentementsGardes(
	attendus: readonly Attendu[],
	existants: readonly { valeurs: Readonly<Record<string, unknown>> }[]
): number[] {
	const gardees = new Map(
		existants.map(({ valeurs }) => [Number(valeurs.strapiId), normaliser('date', valeurs.consentedAt)] as const)
	)
	return attendus
		.filter(({ strapiId, valeurs }) => {
			const demandee = normaliser('date', valeurs.consentedAt)
			const gardee = gardees.get(strapiId)
			return demandee !== null && gardee !== undefined && gardee !== null && gardee !== demandee
		})
		.map(({ strapiId }) => strapiId)
		.sort((a, b) => a - b)
}

/** The profiles the import does not take, and those that stop it, split by what the table says of them. */
export interface ProfilsLaisses {
	/** Profiles a decision leaves aside (`profilsEcartes`): with their account set aside, or without an account. */
	ecartes: number[]
	/** The profiles of the spam (`PROFILS_DU_SPAM`) the source holds without an account: set aside, counted. */
	spam: number[]
	/** Profiles of an account a decision sets aside, that no decision names: they stop the import (SCHEMA.md §11). */
	deComptesEcartes: number[]
	/** Profiles without an account in the source, out of the list of the spam, that no decision names: they stop it. */
	sansCompte: number[]
	/** Decisions that name none of these profiles: without effect. */
	sansObjet: number
}

/**
 * The profiles left aside or stopping the import, given the accounts the source holds, the
 * accounts a decision sets aside, and the profiles a decision leaves aside.
 *
 * - A profile without an account in the source (no link, or a link to an account the source no
 *   longer holds) is set aside when it is in the list of the spam; otherwise it needs a decision.
 * - A profile of an account a decision sets aside needs a decision.
 * - A decision is without effect when it names none of these cases: a profile of the spam, of an
 *   account that is taken, or that the source no longer holds.
 */
export function profilsLaisses(
	profils: readonly ProfilLu[],
	{
		comptesDeLaSource,
		comptesEcartes,
		profilsEcartes,
	}: {
		comptesDeLaSource: ReadonlySet<number>
		comptesEcartes: readonly number[]
		profilsEcartes: readonly number[]
	}
): ProfilsLaisses {
	const ecartesParDecision = new Set(comptesEcartes)
	const decides = new Set(profilsEcartes)
	const spamListe = new Set(PROFILS_DU_SPAM)
	const laisses: ProfilsLaisses = { ecartes: [], spam: [], deComptesEcartes: [], sansCompte: [], sansObjet: 0 }
	const concernes = new Set<number>()
	for (const { id, compte } of [...profils].sort((a, b) => a.id - b.id)) {
		const sansCompte = compte === null || !comptesDeLaSource.has(compte)
		if (sansCompte && spamListe.has(id)) laisses.spam.push(id)
		else if (sansCompte || (compte !== null && ecartesParDecision.has(compte))) {
			concernes.add(id)
			if (decides.has(id)) laisses.ecartes.push(id)
			else laisses[sansCompte ? 'sansCompte' : 'deComptesEcartes'].push(id)
		}
	}
	laisses.sansObjet = [...decides].filter(id => !concernes.has(id)).length
	return laisses
}

/** What the prices of a run give, in numbers and identifiers (ticket 062). */
export interface BilanDesPrix {
	/** Prices of the profiles taken: one per offer and one per option. */
	prix: number
	/** Among them, the prices that give an amount. */
	avecMontant: number
	/** The prices in free text: the text is kept, the amount is empty. */
	textesLibres: number
	/** The prices with nothing typed. */
	sansTexte: number
	/** Profiles taken whose offers hold an amount at the source, by the rule of the old site. */
	profilsAvecOffreChiffree: number
	/** Profiles that hold an amount at the source and have none in the target: the gaps, listed. */
	offresChiffreesPerdues: number[]
	/** Profiles with a text that holds digits and gives no amount (« 2 h : 150 € »): the text is kept, listed. */
	chiffresNonLus: number[]
}

type PrixEcrit = { priceText?: string | null; priceFrom?: number | null }

/** The prices written for one profile: its offers, then their options. */
function prixDesPrestations(prestations: unknown): PrixEcrit[] {
	return ((prestations ?? []) as (PrixEcrit & { options?: PrixEcrit[] })[]).flatMap(offre => [
		offre,
		...(offre.options ?? []),
	])
}

/**
 * Whether the source gives a priced offer to a profile and the target holds none: the smallest
 * price of a card counts the offers only, never their options (`prixMinimal`, ticket 032). So an
 * option with an amount does not hide an offer that lost its own.
 */
export function offreChiffreePerdue(prixDuSource: readonly (string | null)[], ecrites: readonly PrixEcrit[]): boolean {
	const chiffreeALaSource = prixDuSource.some(price => parsePrice(price).priceFrom !== null)
	return chiffreeALaSource && prixMinimal(ecrites) === null
}

export interface ProfilsAttendus {
	attendus: Attendu[]
	/** How many profiles the run takes per status, as the server computes it. */
	statuts: Record<string, number>
	/**
	 * Profiles whose status, as the server computes it from what the import writes, is not the one
	 * the source gives (a draft when entirely empty at the source, published otherwise): a section
	 * the import does not take yet, or a city that gives no commune.
	 */
	statutsDifferentsDeLaSource: number[]
	/** Photos of the profiles taken whose file is not adopted. */
	photosNonReprises: PhotoNonReprise[]
	/** Profiles taken with a link of a list that names no row. */
	liensSansLigne: number[]
	/** The prices, in numbers and identifiers. */
	prix: BilanDesPrix
	/** Contact details left out because the server would refuse them: by profile and field, never the value. */
	coordonneesARevoir: CoordonneeARevoir[]
	/** Radii above the 200 km of the v3: the field is empty, the profile is taken (register, `rayon-200-km`). */
	rayonsARevoir: RayonARevoir[]
	/** Rows of a list outside a bound of the v3, left out of their profile: by profile, list and rank, never the text. */
	lignesLaissees: LigneLaisseeDUnProfil[]
}

/** A row of a profile left out because the server would refuse the whole profile for it. */
export type LigneLaisseeDUnProfil = LigneLaissee & { profil: number }

/**
 * The profiles the target must hold. `comptes` gives, for each account the import takes, its
 * identifier in Payload, or `null` while it is still to be created (a dry run). `laisses` names
 * the profiles the import does not take (`profilsLaisses`): a profile out of both is linked to an
 * account the import takes, or the import stopped before. `communes` gives the commune of each
 * profile taken (./communes.ts); a profile it does not name has none. `medias` gives, for each
 * file adopted (./medias.ts), its identifier in Payload, or `null` while it is still to be
 * created; a file it does not name is not adopted. `consentiLe` is the date of the switch, an ISO
 * string (`dateDeBascule`): given whenever a profile shows contact details at the source.
 */
export function profilsAttendus(
	profils: readonly ProfilLu[],
	comptes: ReadonlyMap<number, number | null>,
	laisses: Pick<ProfilsLaisses, 'ecartes' | 'spam'> = { ecartes: [], spam: [] },
	communes: ReadonlyMap<number, CommuneAttendue | null> = new Map(),
	medias: ReadonlyMap<number, number | null> = new Map(),
	consentiLe: string | null = null,
	maintenant: Date = new Date()
): ProfilsAttendus {
	const nonPris = new Set([...laisses.ecartes, ...laisses.spam])
	// The slugs of the old site, computed on every profile of the source, as the old site did.
	const slugs = new Map(
		attribuerSlugs(profils.map(({ id, username, created_at }) => ({ id, username, createdAt: created_at }))).map(
			({ id, slug }) => [Number(id), slug]
		)
	)
	const attendus: Attendu[] = []
	const statuts: Record<string, number> = {}
	const statutsDifferentsDeLaSource: number[] = []
	const photosNonReprises: PhotoNonReprise[] = []
	const liensSansLigne: number[] = []
	const prix: BilanDesPrix = {
		prix: 0,
		avecMontant: 0,
		textesLibres: 0,
		sansTexte: 0,
		profilsAvecOffreChiffree: 0,
		offresChiffreesPerdues: [],
		chiffresNonLus: [],
	}
	const aRevoir: CoordonneeARevoir[] = []
	const rayonsARevoir: RayonARevoir[] = []
	const lignesLaissees: LigneLaisseeDUnProfil[] = []
	for (const profil of profils) {
		if (nonPris.has(profil.id)) continue
		if (profil.compte === null || !comptes.has(profil.compte))
			throw new Error(`Le profil ${profil.id} n’a pas de compte repris : l’import aurait dû s’arrêter avant.`)
		const slug = slugs.get(profil.id) ?? null
		const { sections } = profil
		// The main picture is the first file of its field; Strapi holds one.
		const principale = photosDeLEntree(sections.photoPrincipale.slice(0, 1), medias)
		const galerie = photosDeLEntree(sections.galerie, medias)
		for (const fichier of [...principale.nonReprises, ...galerie.nonReprises])
			photosNonReprises.push({ entree: profil.id, fichier })
		if (sections.liensSansLigne > 0) liensSansLigne.push(profil.id)
		aRevoir.push(...coordonneesARevoir(profil))
		const rayon = rayonARevoir(profil)
		if (rayon) rayonsARevoir.push(rayon)
		// A row outside a bound of the v3 is left out and listed: kept, it would make the server refuse the whole profile.
		const bornees = lignesDansLesBornes(sections, maintenant)
		lignesLaissees.push(...bornees.laissees.map(ligne => ({ profil: profil.id, ...ligne })))
		const affiche = affichesALaSource(profil)
		if (affiche && consentiLe === null)
			throw new Error(
				`Le profil ${profil.id} affiche des coordonnées : la date de bascule manquait, l’import aurait dû s’arrêter avant.`
			)
		const valeurs: Record<string, unknown> = {
			strapiId: profil.id,
			pro: comptes.get(profil.compte) ?? null,
			slug,
			legacyUsername: profil.username,
			firstName: profil.first_name,
			lastName: profil.last_name,
			artistName: profil.company_artist_name,
			specialty: profil.speciality,
			description: profil.description,
			city: communes.get(profil.id) ?? null,
			radiusKm: rayonDeLaSource(profil),
			available: profil.available ?? true,
			score: nombre(profil.score),
			superArtist: profil.pro,
			mainPicture: principale.ids[0] ?? null,
			gallery: galerie.ids,
			...valeursDesListes(bornees.sections),
			contactDetails: detailsDeContactDeLaSource(profil),
			publicContact: affiche,
			consentedAt: affiche ? consentiLe : null,
			consentSource: affiche ? 'import' : null,
			chosenStatus: CHOIX_INITIAL,
			createdAt: profil.created_at,
			updatedAt: profil.updated_at,
		}
		// The status reads whether the main picture is adopted, even before its media exists (a dry run).
		const statut = statutCalcule({ ...valeurs, mainPicture: principale.adoptees > 0 ? true : null })
		valeurs.status = statut
		statuts[statut] = (statuts[statut] ?? 0) + 1
		if ((statut === 'draft') !== videALaSource(profil)) statutsDifferentsDeLaSource.push(profil.id)
		const ecarts: Ecart[] = []
		const ecrits = prixDesPrestations(valeurs.serviceOffers)
		for (const { priceText, priceFrom } of ecrits) {
			prix.prix += 1
			if (priceFrom !== null && priceFrom !== undefined) prix.avecMontant += 1
			else if ((priceText?.trim() ?? '') === '') prix.sansTexte += 1
			else prix.textesLibres += 1
		}
		if (ecrits.some(({ priceFrom }) => estMontantDePrix(priceFrom)))
			ecarts.push({ champ: 'serviceOffers', reference: REFERENCES.prixNumerique })
		const prixDesOffres = sections.prestations.map(({ price }) => price)
		if (prixDesOffres.some(price => parsePrice(price).priceFrom !== null)) prix.profilsAvecOffreChiffree += 1
		if (offreChiffreePerdue(prixDesOffres, (valeurs.serviceOffers ?? []) as PrixEcrit[]))
			prix.offresChiffreesPerdues.push(profil.id)
		if (ecrits.some(({ priceText, priceFrom }) => priceFrom === null && /\d/.test(priceText ?? '')))
			prix.chiffresNonLus.push(profil.id)
		if (rayon) ecarts.push({ champ: 'radiusKm', reference: REFERENCES.rayon200Km })
		if (slug !== profil.username) ecarts.push({ champ: 'slug', reference: REFERENCES.slugStocke })
		if ((profil.city?.trim() ?? '') !== '') ecarts.push({ champ: 'city', reference: REFERENCES.villeEnCommune })
		if (profil.available === null) ecarts.push({ champ: 'available', reference: REFERENCES.disponibiliteParDefaut })
		if (statut === 'draft')
			ecarts.push({
				champ: 'status',
				reference: videALaSource(profil) ? REFERENCES.profilVideEnBrouillon : REFERENCES.profilNonVideEnBrouillon,
			})
		if (affiche) ecarts.push({ champ: 'publicContact', reference: REFERENCES.coordonneesConsenties })
		attendus.push({ strapiId: profil.id, valeurs, ecarts })
	}
	return {
		attendus,
		statuts,
		statutsDifferentsDeLaSource,
		photosNonReprises,
		liensSansLigne,
		prix,
		coordonneesARevoir: aRevoir,
		rayonsARevoir,
		lignesLaissees,
	}
}
