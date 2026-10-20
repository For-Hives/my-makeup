/**
 * The rows of the fake Strapi source: every case the real database held on 13/10/2026
 * (docs/migration/SCHEMA.md §3 to §8, snapshot of the P2 tool), on a few fictional accounts.
 *
 * Everything here is made up and deterministic: names, addresses in `@example.test`, phone numbers
 * of the range reserved for fiction (06 39 98), dates, pictures. The same call gives the same rows,
 * byte for byte. The only input is the public address of the storage, which the URLs of the files
 * start with: on the bench it carries the port of the instance.
 *
 * No bcrypt hash is written here. `motsDePasse` gives the password of each account that has one;
 * the source computes its hash when it is created, in PostgreSQL (tests/outils/source-strapi.ts).
 * Three of them are the fixture passwords of COMPTES_DE_FIXTURE; nothing exports the others.
 *
 * Only Node's own modules: no API of bun.
 */

import { createHash } from 'node:crypto'
import { pngUni } from './images'
import type { NomDeTable } from './schema'

/** A value of a column, as written in an INSERT: a JSON column takes an object. */
export type Valeur = string | number | boolean | null | Readonly<Record<string, unknown>>

export type Ligne = Readonly<Record<string, Valeur>>

/** An object the source puts in the storage, under its key. */
export interface ObjetDeLaSource {
	cle: string
	type: string
	octets: Uint8Array
}

export interface DefinitionDeLaSource {
	lignes: Readonly<Record<NomDeTable, readonly Ligne[]>>
	/** Account id → password whose bcrypt hash the source stores in `up_users.password`. */
	motsDePasse: ReadonlyMap<number, string>
	objets: readonly ObjetDeLaSource[]
}

/** An account whose password is known: it signs in by the legacy path (plans/01 §2.4, M2). */
export interface CompteDeFixture {
	/** `up_users.id`, the future `pros.strapiId` */
	strapiId: number
	email: string
	provider: 'local' | 'google'
	motDePasse: string
}

/**
 * The three fixture accounts: two `local` accounts and the `google` account that also has a
 * password, as one real account has. Fictional passwords, for the bench only.
 */
export const COMPTES_DE_FIXTURE: readonly CompteDeFixture[] = [
	{ strapiId: 1, email: 'zoe.lefevre@example.test', provider: 'local', motDePasse: 'fixture-zoe-locale' },
	{ strapiId: 2, email: 'lea.martin@example.test', provider: 'local', motDePasse: 'fixture-lea-locale' },
	{ strapiId: 3, email: 'ines.morel@example.test', provider: 'google', motDePasse: 'fixture-ines-google' },
]

/** The 13 profiles left without an account by the spam of 2026 (SCHEMA.md §4.1): the same ids. */
export const PROFILS_SANS_PROPRIETAIRE = [67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108] as const

/** A profile id that no row holds any more: a deleted spam profile, still named by two file links. */
export const ENTREE_DISPARUE = 70

/** Names of a city shared by several communes: the import cannot choose alone (ticket 063). */
export const VILLES_HOMONYMES: readonly string[] = ['Saint-Julien']

export const TYPE_PROFIL = 'api::makeup-artiste.makeup-artiste'

const empreinte = (texte: string): string => createHash('sha256').update(texte).digest('hex')

// ---------------------------------------------------------------------------------------------
// Accounts

interface Compte {
	id: number
	username: string
	email: string
	provider: 'local' | 'google' | 'facebook'
	/** Has a bcrypt hash: a fixture password, or one nothing exposes. */
	motDePasse: boolean
	creeLe: string
}

/**
 * Accounts 9 to 12 share one email, as four real accounts do, and two usernames, each on two of
 * them. Account 7 has capitals and edge spaces in its email. Account 8, 10 and 12 have no profile.
 * Id 13 is missing: a deleted account leaves a gap.
 */
const COMPTES: readonly Compte[] = [
	{
		id: 1,
		username: 'Zoé Lefèvre',
		email: 'zoe.lefevre@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2023-05-12 09:14:03.211',
	},
	{
		id: 2,
		username: 'lea-martin',
		email: 'lea.martin@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2023-06-02 18:40:51.007',
	},
	{
		id: 3,
		username: 'Inès Morel',
		email: 'ines.morel@example.test',
		provider: 'google',
		motDePasse: true,
		creeLe: '2023-09-18 11:02:44.930',
	},
	{
		id: 4,
		username: 'camille_b',
		email: 'camille.bernard@example.test',
		provider: 'google',
		motDePasse: false,
		creeLe: '2024-01-07 20:31:12.554',
	},
	{
		id: 5,
		username: 'Sarah K.',
		email: 'sarah.k@example.test',
		provider: 'facebook',
		motDePasse: false,
		creeLe: '2023-07-21 07:55:09.118',
	},
	{
		id: 6,
		username: 'Nadia Roux',
		email: 'nadia.roux@example.test',
		provider: 'facebook',
		motDePasse: false,
		creeLe: '2023-08-30 14:12:37.402',
	},
	{
		id: 7,
		username: 'Manon Petit',
		email: ' Manon.Petit@Example.Test ',
		provider: 'local',
		motDePasse: true,
		creeLe: '2025-02-14 10:21:58.660',
	},
	{
		id: 8,
		username: 'julie-g',
		email: 'julie.garnier@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2026-09-03 16:48:20.031',
	},
	{
		id: 9,
		username: 'Chloé Durand',
		email: 'chloe.durand@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2023-10-05 08:09:10.111',
	},
	{
		id: 10,
		username: 'Chloé Durand',
		email: 'chloe.durand@example.test',
		provider: 'google',
		motDePasse: false,
		creeLe: '2024-03-11 12:13:14.222',
	},
	{
		id: 11,
		username: 'chloe-maquillage',
		email: 'chloe.durand@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2024-11-20 19:20:21.333',
	},
	{
		id: 12,
		username: 'chloe-maquillage',
		email: 'chloe.durand@example.test',
		provider: 'facebook',
		motDePasse: false,
		creeLe: '2025-01-09 21:22:23.444',
	},
	{
		id: 14,
		username: 'Emma Faure',
		email: 'emma.faure@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2024-04-22 13:37:42.875',
	},
	{
		id: 15,
		username: 'Lina Garcia',
		email: 'lina.garcia@example.test',
		provider: 'google',
		motDePasse: false,
		creeLe: '2024-06-15 09:00:00.001',
	},
	{
		id: 16,
		username: 'Anaïs Leroy',
		email: 'anais.leroy@example.test',
		provider: 'google',
		motDePasse: false,
		creeLe: '2025-05-03 17:45:31.290',
	},
	{
		id: 17,
		username: 'Hugo Lambert',
		email: 'hugo.lambert@example.test',
		provider: 'local',
		motDePasse: true,
		creeLe: '2025-08-19 06:30:15.744',
	},
	{
		id: 18,
		username: 'Alice Moreau',
		email: 'alice.moreau@example.test',
		provider: 'google',
		motDePasse: false,
		creeLe: '2026-10-12 22:05:49.512',
	},
]

function lignesDesComptes(): Ligne[] {
	return COMPTES.map(compte => ({
		id: compte.id,
		username: compte.username,
		email: compte.email,
		provider: compte.provider,
		// Written by PostgreSQL when the source is created, from `motsDePasse`.
		password: null,
		reset_password_token: null,
		confirmation_token: null,
		confirmed: true,
		blocked: false,
		created_at: compte.creeLe,
		updated_at: compte.creeLe,
		created_by_id: null,
		updated_by_id: null,
	}))
}

function motsDePasse(): Map<number, string> {
	const connus = new Map(COMPTES_DE_FIXTURE.map(compte => [compte.strapiId, compte.motDePasse]))
	return new Map(
		COMPTES.filter(compte => compte.motDePasse).map(compte => [
			compte.id,
			connus.get(compte.id) ?? `inconnu-${empreinte(`source-strapi-factice:${compte.id}`)}`,
		])
	)
}

// ---------------------------------------------------------------------------------------------
// Profiles

/** The text fields of a profile; whatever is left out is null. */
interface Profil {
	id: number
	compte: number
	first_name?: string
	last_name?: string
	speciality?: string
	city?: string
	action_radius?: number
	score?: number
	available: boolean | null
	description?: string
	pro?: boolean
	company_artist_name?: string
	creeLe: string
	modifieLe?: string
}

const DESCRIPTION_LONGUE =
	'Maquilleuse professionnelle depuis huit ans, je prépare les mariées, leurs proches et les équipes de tournage. ' +
	'Chaque maquillage commence par un essai, pour choisir ensemble les teintes et la tenue. ' +
	'Je me déplace avec tout mon matériel, désinfecté entre chaque séance.'

/** The profiles of an account: profile id ≠ account id, so a link read by position would be seen. */
const PROFILS: readonly Profil[] = [
	{
		id: 21,
		compte: 1,
		first_name: 'Zoé',
		last_name: 'Lefèvre',
		speciality: 'Mariage',
		city: 'Annecy',
		action_radius: 30,
		score: 12.5,
		available: true,
		description: DESCRIPTION_LONGUE,
		company_artist_name: 'Zoé Make-up',
		creeLe: '2023-05-12 09:20:00.000',
		modifieLe: '2026-09-28 10:11:12.131',
	},
	{
		id: 22,
		compte: 2,
		first_name: 'Léa',
		last_name: 'Martin',
		speciality: 'Maquillage artistique',
		city: '74000 Annecy',
		action_radius: 50,
		available: null,
		description: 'Maquillage artistique et grimage.',
		creeLe: '2023-06-02 18:45:00.000',
	},
	{
		id: 23,
		compte: 3,
		first_name: 'Inès',
		last_name: 'Morel',
		speciality: 'Mode',
		city: '3 impasse des Pinceaux, 74000 Annecy',
		action_radius: 20,
		available: true,
		description: DESCRIPTION_LONGUE,
		creeLe: '2023-09-18 11:10:00.000',
	},
	{
		id: 24,
		compte: 4,
		first_name: 'Camille',
		last_name: 'Bernard',
		speciality: 'Cinéma',
		city: 'Toulouse (31)',
		available: false,
		creeLe: '2024-01-07 20:35:00.000',
	},
	{
		id: 25,
		compte: 5,
		first_name: 'Sarah',
		last_name: 'Kaci',
		speciality: 'Effets spéciaux',
		city: '75116',
		available: null,
		pro: true,
		score: 3,
		creeLe: '2023-07-21 08:00:00.000',
	},
	{
		id: 26,
		compte: 6,
		first_name: 'Nadia',
		last_name: 'Roux',
		speciality: 'Mariage',
		city: 'France',
		action_radius: 400,
		available: true,
		creeLe: '2023-08-30 14:20:00.000',
	},
	// Entirely empty: a name alone (completude.ts).
	{ id: 27, compte: 7, first_name: 'Manon', last_name: 'Petit', available: null, creeLe: '2025-02-14 10:25:00.000' },
	{
		id: 28,
		compte: 9,
		first_name: 'Chloé',
		last_name: 'Durand',
		speciality: 'Mariage',
		city: VILLES_HOMONYMES[0] ?? '',
		available: true,
		description: 'Maquillage de mariée.',
		creeLe: '2023-10-05 08:15:00.000',
	},
	{
		id: 29,
		compte: 11,
		speciality: 'Coiffure et maquillage',
		city: '',
		available: null,
		creeLe: '2024-11-20 19:30:00.000',
	},
	{
		id: 30,
		compte: 14,
		first_name: 'Emma',
		last_name: 'Faure',
		speciality: 'Maquillage naturel',
		city: 'annecy ',
		available: true,
		creeLe: '2024-04-22 13:40:00.000',
	},
	{ id: 31, compte: 15, speciality: 'Maquillage', available: null, creeLe: '2024-06-15 09:10:00.000' },
	{
		id: 32,
		compte: 16,
		first_name: 'Anaïs',
		last_name: 'Leroy',
		city: 'Lyon',
		available: true,
		creeLe: '2025-05-03 17:50:00.000',
	},
	{
		id: 33,
		compte: 17,
		first_name: 'Hugo',
		last_name: 'Lambert',
		speciality: 'Cours de maquillage',
		city: 'Nantes',
		available: true,
		creeLe: '2025-08-19 06:40:00.000',
	},
	{
		id: 34,
		compte: 18,
		first_name: 'Alice',
		last_name: 'Moreau',
		speciality: 'Mariage',
		city: 'Annemasse',
		available: false,
		creeLe: '2026-10-12 22:10:00.000',
	},
]

const LETTRES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A spam username, as the 24 deleted accounts had: 16 letters, capitals and small letters mixed. */
function pseudoDeSpam(id: number): string {
	const octets = createHash('sha256').update(`spam:${id}`).digest()
	return Array.from(octets.subarray(0, 16), (octet, rang) => {
		const lettre = LETTRES[octet % 26] ?? 'a'
		return rang % 3 === 1 ? lettre.toUpperCase() : lettre
	}).join('')
}

function lignesDesProfils(): Ligne[] {
	const usernames = new Map(COMPTES.map(compte => [compte.id, compte.username]))
	const relies = PROFILS.map(profil => ({
		id: profil.id,
		last_name: profil.last_name ?? null,
		first_name: profil.first_name ?? null,
		speciality: profil.speciality ?? null,
		city: profil.city ?? null,
		action_radius: profil.action_radius ?? null,
		score: profil.score ?? null,
		available: profil.available,
		description: profil.description ?? null,
		username: usernames.get(profil.compte) ?? null,
		pro: profil.pro ?? false,
		company_artist_name: profil.company_artist_name ?? null,
		created_at: profil.creeLe,
		updated_at: profil.modifieLe ?? profil.creeLe,
		created_by_id: null,
		updated_by_id: null,
	}))
	// Never modified, nothing filled in: only a username and the dates.
	const sansProprietaire = PROFILS_SANS_PROPRIETAIRE.map((id, rang) => {
		const date = `2026-0${1 + (rang % 9)}-1${rang % 10} 03:0${rang % 10}:00.000`
		return {
			id,
			last_name: null,
			first_name: null,
			speciality: null,
			city: null,
			action_radius: null,
			score: null,
			available: null,
			description: null,
			username: pseudoDeSpam(id),
			pro: false,
			company_artist_name: null,
			created_at: date,
			updated_at: date,
			created_by_id: null,
			updated_by_id: null,
		}
	})
	return [...relies, ...sansProprietaire]
}

function lignesDesLiensDeComptes(): Ligne[] {
	return PROFILS.map((profil, rang) => ({ id: rang + 1, makeup_artiste_id: profil.id, user_id: profil.compte }))
}

// ---------------------------------------------------------------------------------------------
// Components and their links

type Champ = 'skills' | 'experiences' | 'courses' | 'language' | 'network' | 'service_offers'

const TYPES_DE_COMPOSANT: Readonly<Record<Champ, string>> = {
	skills: 'makeupartists.skills',
	experiences: 'makeupartists.experiences',
	courses: 'makeupartists.courses',
	language: 'makeupartists.language',
	network: 'makeupartists.network',
	service_offers: 'makeupartists.service-offers',
}

/** One component row and where it belongs: a profile, a field, a position. No profile: an orphan row. */
interface Composant {
	ligne: Ligne
	profil?: number
	ordre?: number
}

const COMPETENCES: readonly Composant[] = [
	{
		ligne: { id: 1, name: 'Maquillage mariée', description: 'Teint lumineux et tenue toute la journée.' },
		profil: 21,
		ordre: 1,
	},
	{ ligne: { id: 2, name: 'Coiffure', description: null }, profil: 21, ordre: 2 },
	// The same skill twice in one list: kept as it is (SCHEMA.md §11, open question 15).
	{
		ligne: { id: 3, name: 'Maquillage mariée', description: 'Teint lumineux et tenue toute la journée.' },
		profil: 21,
		ordre: 3,
	},
	{
		ligne: { id: 4, name: 'Effets spéciaux', description: 'Cicatrices, vieillissement, prothèses légères.' },
		profil: 25,
		ordre: 1,
	},
	{ ligne: { id: 5, name: 'Maquillage artistique', description: null }, profil: 22, ordre: 1 },
	{ ligne: { id: 6, name: 'Maquillage invitée', description: null } },
]

/** A text of 2 001 characters: one more than a description of the v3 takes (ticket 226). */
const TEXTE_DE_2001_CARACTERES = 'Une phrase de remplissage. '.repeat(75).slice(0, 2001)

const EXPERIENCES: readonly Composant[] = [
	{
		ligne: {
			id: 1,
			company: 'Studio Lumière',
			job_name: 'Maquilleuse',
			city: 'Lyon',
			date_start: '2019-09-01',
			date_end: '2022-06-30',
			description: 'Shootings de mode et catalogues.',
		},
		profil: 21,
		ordre: 1,
	},
	{
		ligne: {
			id: 2,
			company: 'Théâtre des Collines',
			job_name: 'Maquilleuse de scène',
			city: 'Annecy',
			date_start: '2022-09-01',
			date_end: null,
			description: null,
		},
		profil: 21,
		ordre: 2,
	},
	{
		ligne: {
			id: 3,
			company: 'Atelier Grimaces',
			job_name: 'Assistante maquillage',
			city: 'Toulouse',
			date_start: '2020-01-15',
			date_end: '2021-12-31',
			description: null,
		},
		profil: 24,
		ordre: 1,
	},
	// Outside a bound of the v3 (ticket 226): the end comes before the start. Left out of the profile, listed.
	{
		ligne: {
			id: 4,
			company: 'Maison Fictive',
			job_name: 'Maquilleuse',
			city: 'Nantes',
			date_start: '2023-05-01',
			date_end: '2022-05-01',
			description: null,
		},
		profil: 33,
		ordre: 1,
	},
]

const FORMATIONS: readonly Composant[] = [
	{
		ligne: {
			id: 1,
			diploma: 'CAP Esthétique',
			school: 'École de maquillage du Lac',
			date_graduation: '2018-06-30',
			course_description: 'Soins, maquillage et colorimétrie.',
		},
		profil: 21,
		ordre: 1,
	},
	{
		ligne: {
			id: 2,
			diploma: 'Formation effets spéciaux',
			school: 'Atelier des Masques',
			date_graduation: '2021-03-15',
			course_description: null,
		},
		profil: 25,
		ordre: 1,
	},
	// Outside a bound of the v3 (ticket 226): obtained more than a year after any day this runs on.
	{
		ligne: {
			id: 3,
			diploma: 'Diplôme à venir',
			school: 'École du Futur',
			date_graduation: '2099-06-30',
			course_description: null,
		},
		profil: 33,
		ordre: 1,
	},
]

const LANGUES: readonly Composant[] = [
	{ ligne: { id: 1, name: 'Français' }, profil: 21, ordre: 1 },
	{ ligne: { id: 2, name: 'Anglais' }, profil: 21, ordre: 2 },
	{ ligne: { id: 3, name: 'Espagnol' }, profil: 32, ordre: 1 },
	{ ligne: { id: 4, name: 'Italien' } },
]

const RESEAUX_REMPLIS: Readonly<Record<number, Readonly<Record<string, string>>>> = {
	21: {
		instagram: 'https://www.instagram.com/compte.fictif.zoe',
		website: 'https://zoe-makeup.example.test',
		phone: '06 39 98 12 34',
		email: 'contact.zoe@example.test',
	},
	22: { instagram: 'https://www.instagram.com/compte.fictif.lea' },
	23: { phone: '06 39 98 56 78' },
	24: { email: 'camille.contact@example.test' },
	30: { website: 'https://emma-faure.example.test' },
	33: {
		facebook: 'https://www.facebook.com/compte.fictif.hugo',
		youtube: 'https://www.youtube.com/@compte-fictif-hugo',
	},
}

/** Every profile has its network row, empty or not, as all 101 real profiles do. */
function reseaux(): Composant[] {
	const profils = [...PROFILS.map(profil => profil.id), ...PROFILS_SANS_PROPRIETAIRE]
	return profils.map((profil, rang) => {
		const rempli = RESEAUX_REMPLIS[profil] ?? {}
		return {
			ligne: {
				id: rang + 1,
				youtube: rempli.youtube ?? null,
				facebook: rempli.facebook ?? null,
				instagram: rempli.instagram ?? null,
				website: rempli.website ?? null,
				linkedin: rempli.linkedin ?? null,
				phone: rempli.phone ?? null,
				email: rempli.email ?? null,
			},
			profil,
			ordre: 1,
		}
	})
}

/** Prices as they were typed: amounts, « à partir de », free text, empty, nothing. */
const PRESTATIONS: readonly Composant[] = [
	{
		ligne: {
			id: 1,
			name: 'Maquillage mariée',
			description: 'Essai compris, retouches le jour J.',
			price: 'à partir de 120 €',
		},
		profil: 21,
		ordre: 1,
	},
	{ ligne: { id: 2, name: 'Essai maquillage', description: null, price: '80' }, profil: 21, ordre: 2 },
	{ ligne: { id: 3, name: 'Maquillage invitée', description: null, price: 'Sur devis' }, profil: 21, ordre: 3 },
	{ ligne: { id: 4, name: 'Maquillage artistique', description: null, price: '80 €' }, profil: 22, ordre: 1 },
	{ ligne: { id: 5, name: 'Shooting mode', description: null, price: 'Entre 60 et 90 €' }, profil: 23, ordre: 1 },
	{
		ligne: { id: 6, name: 'Tournage', description: 'Forfait demi-journée.', price: '2 h : 150 €' },
		profil: 24,
		ordre: 1,
	},
	{ ligne: { id: 7, name: 'Effet cicatrice', description: null, price: null }, profil: 25, ordre: 1 },
	{ ligne: { id: 8, name: 'Maquillage enfant', description: null, price: '' }, profil: 25, ordre: 2 },
	{ ligne: { id: 9, name: 'Mariage', description: null, price: '1 200 €' }, profil: 26, ordre: 1 },
	{
		ligne: { id: 10, name: 'Cours particulier', description: 'Deux heures, chez vous.', price: '50' },
		profil: 33,
		ordre: 1,
	},
	{ ligne: { id: 11, name: 'Maquillage soirée', description: null, price: '45 €' } },
	// Outside a bound of the v3 (ticket 226): a description of more than 2 000 characters.
	{
		ligne: { id: 12, name: 'Forfait détaillé', description: TEXTE_DE_2001_CARACTERES, price: null },
		profil: 33,
		ordre: 2,
	},
]

/** Options of an offer: `profil` holds the id of the offer here. */
const OPTIONS: readonly Composant[] = [
	{ ligne: { id: 1, name: 'Retouche en journée', description: null, price: '15 €' }, profil: 1, ordre: 1 },
	{
		ligne: { id: 2, name: 'Maquillage d’une demoiselle d’honneur', description: 'Par personne.', price: 'Offert' },
		profil: 1,
		ordre: 2,
	},
	{ ligne: { id: 3, name: 'Déplacement', description: null, price: '0,50 € / km' }, profil: 4, ordre: 1 },
	// Outside a bound of the v3 (ticket 226): a name of 71 characters, on the offer 10 of the profile 33.
	{
		ligne: { id: 4, name: `Option au nom trop long ${'x'.repeat(47)}`, description: null, price: null },
		profil: 10,
		ordre: 1,
	},
]

/**
 * The link rows of the profiles' components. The links of the skills of profile 21 are written in
 * another order than their position: the order of a list is `order`, never the id of the link.
 */
function liensDesComposants(): Ligne[] {
	const champs: [Champ, readonly Composant[]][] = [
		['network', reseaux()],
		['skills', [...COMPETENCES].reverse()],
		['experiences', EXPERIENCES],
		['courses', FORMATIONS],
		['language', LANGUES],
		['service_offers', PRESTATIONS],
	]
	const liens: Ligne[] = []
	for (const [champ, composants] of champs)
		for (const { ligne, profil, ordre } of composants) {
			if (profil === undefined) continue
			liens.push({
				id: liens.length + 1,
				entity_id: profil,
				component_id: ligne.id ?? null,
				component_type: TYPES_DE_COMPOSANT[champ],
				field: champ,
				order: ordre ?? 1,
			})
		}
	return liens
}

function liensDesOptions(): Ligne[] {
	return [...OPTIONS].reverse().flatMap(({ ligne, profil, ordre }, rang) =>
		profil === undefined
			? []
			: [
					{
						id: rang + 1,
						entity_id: profil,
						component_id: ligne.id ?? null,
						component_type: 'service-offers.options',
						field: 'options',
						order: ordre ?? 1,
					},
				]
	)
}

// ---------------------------------------------------------------------------------------------
// Files, their objects and their links

type Fournisseur = 'r2' | 'minio'

/** Strapi's names for its two storage providers (SCHEMA.md §8). */
const FOURNISSEURS: Readonly<Record<Fournisseur, string>> = {
	r2: 'strapi-provider-cloudflare-r2',
	minio: 'minio-for-strapi-v4',
}

interface Fichier {
	id: number
	/** The name of the file on the device it was sent from. */
	nom: string
	/** The name Strapi gives the object, before `_<10 hex>`. */
	base: string
	/** The current provider keeps its files under `1/`, the old one at the root of the bucket. */
	fournisseur: Fournisseur
	mime: string
	ext: string
	largeur?: number
	hauteur?: number
	alt?: string
	/** Derived formats, kept at the root of the bucket as Strapi does. */
	formats?: readonly ('thumbnail' | 'small')[]
	envoyePar?: number
	/** False: the row exists, its object does not (a « 404 connu »). */
	objet?: false
	creeLe: string
}

const FICHIERS: readonly Fichier[] = [
	{
		id: 101,
		nom: 'photo-profil-zoe.png',
		base: 'photo_profil_zoe',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 60,
		hauteur: 75,
		alt: 'Zoé pendant une séance de maquillage',
		formats: ['thumbnail', 'small'],
		creeLe: '2023-05-20 10:00:00.000',
	},
	{
		id: 102,
		nom: 'mariage-1.png',
		base: 'mariage_1',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 80,
		hauteur: 60,
		formats: ['thumbnail'],
		creeLe: '2023-05-20 10:01:00.000',
	},
	{
		id: 103,
		nom: 'mariage-2.png',
		base: 'mariage_2',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 80,
		hauteur: 60,
		creeLe: '2023-05-20 10:02:00.000',
	},
	{
		id: 104,
		nom: 'IMG_2041.png',
		base: 'IMG_2041',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 60,
		hauteur: 80,
		creeLe: '2023-05-20 10:03:00.000',
	},
	{
		id: 105,
		nom: 'lea portrait.png',
		base: 'lea_portrait',
		fournisseur: 'minio',
		mime: 'image/png',
		ext: '.png',
		largeur: 64,
		hauteur: 64,
		formats: ['thumbnail'],
		creeLe: '2023-06-03 09:00:00.000',
	},
	{
		id: 106,
		nom: 'atelier.png',
		base: 'atelier',
		fournisseur: 'minio',
		mime: 'image/png',
		ext: '.png',
		largeur: 72,
		hauteur: 48,
		creeLe: '2023-06-03 09:05:00.000',
	},
	{
		id: 107,
		nom: 'profil-ines.png',
		base: 'profil_ines',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 60,
		hauteur: 60,
		objet: false,
		creeLe: '2023-09-19 08:00:00.000',
	},
	{
		id: 108,
		nom: 'tarifs.pdf',
		base: 'tarifs',
		fournisseur: 'r2',
		mime: 'application/pdf',
		ext: '.pdf',
		creeLe: '2024-01-08 12:00:00.000',
	},
	{
		id: 109,
		nom: 'effet-cicatrice.png',
		base: 'effet_cicatrice',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 48,
		hauteur: 64,
		envoyePar: 5,
		creeLe: '2026-10-01 15:00:00.000',
	},
	{
		id: 110,
		nom: 'ancienne-photo.png',
		base: 'ancienne_photo',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 50,
		hauteur: 50,
		creeLe: '2025-12-01 11:00:00.000',
	},
	{
		id: 111,
		nom: 'ancienne-galerie.png',
		base: 'ancienne_galerie',
		fournisseur: 'r2',
		mime: 'image/png',
		ext: '.png',
		largeur: 50,
		hauteur: 40,
		creeLe: '2025-12-01 11:01:00.000',
	},
	{
		id: 112,
		nom: 'essai.png',
		base: 'essai',
		fournisseur: 'minio',
		mime: 'image/png',
		ext: '.png',
		largeur: 40,
		hauteur: 40,
		creeLe: '2023-11-02 14:00:00.000',
	},
	{
		id: 113,
		nom: 'video-demo.mp4',
		base: 'video_demo',
		fournisseur: 'r2',
		mime: 'video/mp4',
		ext: '.mp4',
		creeLe: '2024-02-10 16:00:00.000',
	},
]

/** Which file each link names, in which entry and field: the gallery of 21 is written out of order. */
const LIENS_DE_FICHIERS: readonly {
	fichier: number
	entree: number
	champ: 'main_picture' | 'image_gallery'
	ordre: number
}[] = [
	{ fichier: 101, entree: 21, champ: 'main_picture', ordre: 1 },
	{ fichier: 104, entree: 21, champ: 'image_gallery', ordre: 3 },
	{ fichier: 102, entree: 21, champ: 'image_gallery', ordre: 1 },
	{ fichier: 103, entree: 21, champ: 'image_gallery', ordre: 2 },
	{ fichier: 105, entree: 22, champ: 'main_picture', ordre: 1 },
	{ fichier: 106, entree: 22, champ: 'image_gallery', ordre: 1 },
	{ fichier: 107, entree: 23, champ: 'main_picture', ordre: 1 },
	{ fichier: 108, entree: 24, champ: 'image_gallery', ordre: 1 },
	{ fichier: 109, entree: 25, champ: 'image_gallery', ordre: 1 },
	{ fichier: 110, entree: ENTREE_DISPARUE, champ: 'main_picture', ordre: 1 },
	{ fichier: 111, entree: ENTREE_DISPARUE, champ: 'image_gallery', ordre: 1 },
]

/** A colour of its own for each picture: two objects never have the same content. */
const couleur = (graine: number) => ({
	rouge: (graine * 53) % 256,
	vert: (graine * 97) % 256,
	bleu: (graine * 151) % 256,
})

/** The content of a file that is not a picture: a few fictional bytes of the right kind. */
function octetsNonImage(fichier: Fichier): Uint8Array {
	if (fichier.mime === 'application/pdf')
		return new TextEncoder().encode('%PDF-1.4\n% Fichier fictif du banc de test\ntrailer\n<<>>\n%%EOF\n')
	return Uint8Array.from([
		0,
		0,
		0,
		0x18,
		...new TextEncoder().encode('ftypisom'),
		0,
		0,
		2,
		0,
		...new TextEncoder().encode('isomiso2mp41'),
	])
}

/** Size in kilobytes, as Strapi writes it: bytes divided by 1 000, two decimals. */
const kiloOctets = (octets: Uint8Array): number => Math.round((octets.length / 1000) * 100) / 100

const TAILLES_DES_FORMATS = { thumbnail: 0.33, small: 0.66 } as const

function fichiersEtObjets(medias: string): { lignes: Ligne[]; objets: ObjetDeLaSource[] } {
	const lignes: Ligne[] = []
	const objets: ObjetDeLaSource[] = []
	for (const fichier of FICHIERS) {
		const hash = `${fichier.base}_${empreinte(`fichier:${fichier.id}`).slice(0, 10)}`
		const dossier = fichier.fournisseur === 'r2' ? '1/' : ''
		const cle = `${dossier}${hash}${fichier.ext}`
		const octets =
			fichier.largeur && fichier.hauteur
				? pngUni(fichier.largeur, fichier.hauteur, couleur(fichier.id))
				: octetsNonImage(fichier)
		if (fichier.objet !== false) objets.push({ cle, type: fichier.mime, octets })

		const formats: Record<string, unknown> = {}
		for (const format of fichier.formats ?? []) {
			const largeur = Math.max(1, Math.round((fichier.largeur ?? 1) * TAILLES_DES_FORMATS[format]))
			const hauteur = Math.max(1, Math.round((fichier.hauteur ?? 1) * TAILLES_DES_FORMATS[format]))
			const octetsDuFormat = pngUni(largeur, hauteur, couleur(fichier.id + 1000))
			const hashDuFormat = `${format}_${hash}`
			objets.push({ cle: `${hashDuFormat}${fichier.ext}`, type: fichier.mime, octets: octetsDuFormat })
			formats[format] = {
				ext: fichier.ext,
				url: `${medias}/${hashDuFormat}${fichier.ext}`,
				hash: hashDuFormat,
				mime: fichier.mime,
				name: `${format}_${fichier.nom}`,
				path: null,
				size: kiloOctets(octetsDuFormat),
				width: largeur,
				height: hauteur,
				sizeInBytes: octetsDuFormat.length,
			}
		}

		lignes.push({
			id: fichier.id,
			name: fichier.nom,
			alternative_text: fichier.alt ?? null,
			caption: null,
			width: fichier.largeur ?? null,
			height: fichier.hauteur ?? null,
			formats: Object.keys(formats).length > 0 ? formats : null,
			hash,
			ext: fichier.ext,
			mime: fichier.mime,
			size: kiloOctets(octets),
			url: `${medias}/${cle}`,
			preview_url: null,
			provider: FOURNISSEURS[fichier.fournisseur],
			provider_metadata: null,
			folder_path: '/1',
			created_at: fichier.creeLe,
			updated_at: fichier.creeLe,
			created_by_id: null,
			updated_by_id: null,
			uploaded_by: fichier.envoyePar ?? null,
		})
	}
	return { lignes, objets }
}

// ---------------------------------------------------------------------------------------------
// Articles and talents

const ARTICLES: readonly Ligne[] = [
	{
		id: 1,
		title: 'Comment choisir sa maquilleuse de mariage',
		content:
			'## Commencer tôt\n\nRéservez votre maquilleuse six mois avant le mariage.\n\n- Demandez un essai.\n- Regardez son portfolio.\n\n[Trouver une maquilleuse](/search)\n',
		author: 'La rédaction',
		seo_title: 'Choisir sa maquilleuse de mariage',
		seo_description: 'Nos conseils pour choisir la maquilleuse de votre mariage : essai, portfolio, tarifs.',
		slug: 'choisir-sa-maquilleuse-de-mariage',
		excerpt: 'Essai, portfolio, tarifs : nos conseils pour bien choisir.',
		created_at: '2023-06-01 08:00:00.000',
		updated_at: '2026-10-09 00:40:00.000',
		published_at: '2023-06-01 08:00:00.000',
		created_by_id: null,
		updated_by_id: null,
	},
	{
		id: 7,
		title: 'Préparer sa peau avant un shooting',
		content: 'Hydratez votre peau la veille, et dormez bien.\n',
		author: 'La rédaction',
		seo_title: 'Préparer sa peau avant un shooting',
		seo_description: 'Trois gestes simples pour une peau prête le jour du shooting.',
		slug: 'preparer-sa-peau-avant-un-shooting',
		excerpt: null,
		created_at: '2026-10-09 00:41:00.000',
		updated_at: '2026-10-09 00:42:00.000',
		published_at: '2026-10-09 00:42:00.000',
		created_by_id: null,
		updated_by_id: null,
	},
]

const talent = (id: number, title: string, slug: string, seoDescription: string | null): Ligne => ({
	id,
	title,
	seo_title: `${title} : trouvez votre maquilleuse`,
	description: `Les maquilleuses spécialisées en ${title.toLowerCase()}.`,
	seo_description: seoDescription,
	content: `## ${title}\n\nUne page fictive du banc de test.\n`,
	slug,
	created_at: '2023-04-01 09:00:00.000',
	updated_at: '2024-05-02 10:00:00.000',
	published_at: '2023-04-01 09:00:00.000',
	created_by_id: null,
	updated_by_id: null,
})

const TALENTS: readonly Ligne[] = [
	talent(1, 'Maquillage de mariage', 'maquillage-mariage', 'Maquilleuses de mariage près de chez vous.'),
	talent(2, 'Maquillage artistique', 'maquillage-artistique', 'Maquilleuses artistiques près de chez vous.'),
	talent(3, 'Effets spéciaux', 'effets-speciaux', null),
]

// ---------------------------------------------------------------------------------------------

/**
 * The whole fake source: its rows, the passwords to hash, its objects. `medias` is the public
 * address of the storage, without a final slash.
 */
export function definitionDeLaSource(medias: string): DefinitionDeLaSource {
	if (medias.endsWith('/')) throw new Error('L’adresse des photos s’écrit sans « / » final.')
	const { lignes: fichiers, objets } = fichiersEtObjets(medias)
	const lignes: Record<NomDeTable, readonly Ligne[]> = {
		up_users: lignesDesComptes(),
		makeup_artistes: lignesDesProfils(),
		makeup_artistes_user_links: lignesDesLiensDeComptes(),
		components_makeupartists_skills: COMPETENCES.map(c => c.ligne),
		components_makeupartists_experiences: EXPERIENCES.map(c => c.ligne),
		components_makeupartists_courses: FORMATIONS.map(c => c.ligne),
		components_makeupartists_languages: LANGUES.map(c => c.ligne),
		components_makeupartists_networks: reseaux().map(c => c.ligne),
		components_service_offers_options: OPTIONS.map(c => c.ligne),
		components_makeupartists_service_offers: PRESTATIONS.map(c => c.ligne),
		components_makeupartists_service_offers_components: liensDesOptions(),
		makeup_artistes_components: liensDesComposants(),
		files: fichiers,
		files_related_morphs: LIENS_DE_FICHIERS.map((lien, rang) => ({
			id: rang + 1,
			file_id: lien.fichier,
			related_id: lien.entree,
			related_type: TYPE_PROFIL,
			field: lien.champ,
			order: lien.ordre,
		})),
		articles: ARTICLES,
		talents: TALENTS,
	}
	return { lignes, motsDePasse: motsDePasse(), objets }
}
