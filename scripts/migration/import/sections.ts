/**
 * The sections of a profile of the old site (docs/migration/SCHEMA.md §5.2 and §6; ticket 060):
 * its skills, languages, courses, experiences, offers with their options, networks, main picture
 * and gallery.
 *
 * - **The order is a datum** (SCHEMA.md, rule 6): the rows of each list come in the order of the
 *   link table of Strapi (`order`, then the link), never in the order of their identifiers. A row
 *   two links name twice stays twice, as on the old site (§11, open question 15). A row no link
 *   names belongs to no profile and is not taken; a link that names no row is reported.
 * - **Every value is taken as it is**, the price above all: `priceText` is the text typed, byte
 *   for byte, and `priceFrom` stays empty here (ticket 062 fills it). A date of these lists is
 *   a day: the day typed, stored at 12:00 UTC as the collection stores every day
 *   (src/lib/profile/lists.ts). Empty stays empty (rule 2).
 * - **The identifier of a row** is not taken (§7): Payload gives one, and keeps it as long as the
 *   row does not change. The comparison of the import reads the rows without it.
 * - **The networks** are the five links of the profile. The phone and the email of the same row of
 *   Strapi are read into memory only, to tell whether the profile has a contact channel at the
 *   source; their place in the v3 is ticket 064.
 * - **The photos** are the media adopted for the files the profile designates (./medias.ts): a
 *   file not adopted is reported, never invented.
 *
 * No `bun` import here: the import can run under Node too.
 */

import { parsePrice } from '../../../src/lib/prix'
import type { ProfileNetworks } from '../../../src/lib/profile/completeness'
import {
	dayDate,
	DESCRIPTION_MAX_LENGTH,
	NAME_MAX_LENGTH,
	dateMessage,
	endMessage,
	textMessage,
	obtainMessage,
} from '../../../src/lib/profile/lists'
import { TYPE_PROFIL } from './medias'
import type { Requete } from './source'

export interface Competence {
	name: string | null
	description: string | null
}

export interface Langue {
	name: string | null
}

export interface Formation {
	diploma: string | null
	school: string | null
	/** « YYYY-MM-DD », the day of the old site. */
	date_graduation: string | null
	course_description: string | null
}

export interface Experience {
	company: string | null
	job_name: string | null
	city: string | null
	date_start: string | null
	date_end: string | null
	description: string | null
}

export interface OptionDePrestation {
	name: string | null
	description: string | null
	price: string | null
}

export interface Prestation {
	/** The row of Strapi: its options hang on it. */
	id: number
	name: string | null
	description: string | null
	price: string | null
	options: OptionDePrestation[]
}

/** The sections of one profile of the source, in their order, under the names of Strapi. */
export interface SectionsLues {
	competences: Competence[]
	langues: Langue[]
	formations: Formation[]
	experiences: Experience[]
	prestations: Prestation[]
	/** The single network row of the profile, phone and email included (read, never written here). */
	reseau: ProfileNetworks | null
	/** The files of its main picture and of its gallery, in order. */
	photoPrincipale: number[]
	galerie: number[]
	/** Links of its lists (or of the options of its offers) that name no row: reported. */
	liensSansLigne: number
}

export const SECTIONS_VIDES: SectionsLues = {
	competences: [],
	langues: [],
	formations: [],
	experiences: [],
	prestations: [],
	reseau: null,
	photoPrincipale: [],
	galerie: [],
	liensSansLigne: 0,
}

/** A day of the old site, as text: a `date` column read by both clients the same way. */
const jour = (colonne: string): string => `to_char(c.${colonne}, 'YYYY-MM-DD') AS ${colonne}`

/**
 * The rows of one list of the entries of `liens`, in their order, the link kept even when its row
 * is missing (`ligne` is then null). The names here are constants of this file, never a value.
 */
const lectureDUneListe = (liens: string, table: string, type: string, champ: string, colonnes: readonly string[]) =>
	`SELECT l.entity_id AS entree, c.id AS ligne, ${colonnes.join(', ')}
	FROM ${liens} l LEFT JOIN ${table} c ON c.id = l.component_id
	WHERE l.component_type = '${type}' AND l.field = '${champ}' ORDER BY l.entity_id, l."order", l.id`

const LIENS_DES_PROFILS = 'makeup_artistes_components'

const LECTURES = {
	competences: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_skills',
		'makeupartists.skills',
		'skills',
		['c.name', 'c.description']
	),
	langues: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_languages',
		'makeupartists.language',
		'language',
		['c.name']
	),
	formations: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_courses',
		'makeupartists.courses',
		'courses',
		['c.diploma', 'c.school', jour('date_graduation'), 'c.course_description']
	),
	experiences: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_experiences',
		'makeupartists.experiences',
		'experiences',
		['c.company', 'c.job_name', 'c.city', jour('date_start'), jour('date_end'), 'c.description']
	),
	prestations: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_service_offers',
		'makeupartists.service-offers',
		'service_offers',
		['c.name', 'c.description', 'c.price']
	),
	options: lectureDUneListe(
		'components_makeupartists_service_offers_components',
		'components_service_offers_options',
		'service-offers.options',
		'options',
		['c.name', 'c.description', 'c.price']
	),
	reseaux: lectureDUneListe(
		LIENS_DES_PROFILS,
		'components_makeupartists_networks',
		'makeupartists.network',
		'network',
		['c.youtube', 'c.facebook', 'c.instagram', 'c.website', 'c.linkedin', 'c.phone', 'c.email']
	),
	photos: `SELECT related_id AS entree, file_id AS fichier, field AS champ FROM files_related_morphs
		WHERE related_type = '${TYPE_PROFIL}' AND field IN ('main_picture', 'image_gallery')
		ORDER BY related_id, field, "order", id`,
} as const

type LigneLue<T> = T & { entree: number; ligne: number | null }

/** The rows of each entry, in order; a link without its row counted apart. */
function parEntree<T extends object>(lignes: readonly LigneLue<T>[], sansLigne: Map<number, number>): Map<number, T[]> {
	const parId = new Map<number, T[]>()
	for (const { entree, ligne, ...valeurs } of lignes) {
		const id = Number(entree)
		if (ligne === null) {
			sansLigne.set(id, (sansLigne.get(id) ?? 0) + 1)
			continue
		}
		parId.set(id, [...(parId.get(id) ?? []), valeurs as unknown as T])
	}
	return parId
}

/** The sections of every profile of the source that has one, by its identifier. */
export async function lireLesSections(requete: Requete): Promise<Map<number, SectionsLues>> {
	const sansLigne = new Map<number, number>()
	const sansLigneDesOffres = new Map<number, number>()
	const competences = parEntree(await requete<LigneLue<Competence>>(LECTURES.competences), sansLigne)
	const langues = parEntree(await requete<LigneLue<Langue>>(LECTURES.langues), sansLigne)
	const formations = parEntree(await requete<LigneLue<Formation>>(LECTURES.formations), sansLigne)
	const experiences = parEntree(await requete<LigneLue<Experience>>(LECTURES.experiences), sansLigne)
	const reseaux = parEntree(await requete<LigneLue<ProfileNetworks>>(LECTURES.reseaux), sansLigne)
	const prestationsLues = await requete<LigneLue<Omit<Prestation, 'id' | 'options'>>>(LECTURES.prestations)
	// The options hang on the row of their offer, by its identifier in Strapi.
	const options = parEntree(await requete<LigneLue<OptionDePrestation>>(LECTURES.options), sansLigneDesOffres)
	const prestations = parEntree(
		prestationsLues.map(lue => ({ ...lue, id: lue.ligne, options: [] as OptionDePrestation[] })),
		sansLigne
	)
	const photos = await requete<{ entree: number; fichier: number; champ: string }>(LECTURES.photos)

	const sections = new Map<number, SectionsLues>()
	const de = (id: number): SectionsLues => {
		let lues = sections.get(id)
		if (!lues) {
			lues = { ...SECTIONS_VIDES, photoPrincipale: [], galerie: [] }
			sections.set(id, lues)
		}
		return lues
	}
	for (const [id, lignes] of competences) de(id).competences = lignes
	for (const [id, lignes] of langues) de(id).langues = lignes
	for (const [id, lignes] of formations) de(id).formations = lignes
	for (const [id, lignes] of experiences) de(id).experiences = lignes
	for (const [id, [premier]] of reseaux) de(id).reseau = premier ?? null
	for (const [id, lignes] of prestations)
		de(id).prestations = lignes.map(prestation => ({
			...prestation,
			id: Number(prestation.id),
			options: options.get(Number(prestation.id)) ?? [],
		}))
	for (const { entree, fichier, champ } of photos) {
		const lues = de(Number(entree))
		if (champ === 'main_picture') lues.photoPrincipale.push(Number(fichier))
		else lues.galerie.push(Number(fichier))
	}
	for (const [id, nombre] of sansLigne) de(id).liensSansLigne += nombre
	// A link of an option without its row belongs to the profile of its offer.
	for (const [offre, nombre] of sansLigneDesOffres) {
		const profil = [...sections].find(([, lues]) => lues.prestations.some(({ id }) => id === offre))?.[0]
		if (profil !== undefined) de(profil).liensSansLigne += nombre
	}
	return sections
}

/** A list whose rows the import may leave out when one of their values is outside a bound of the v3. */
export type ListeBornee = 'competences' | 'langues' | 'formations' | 'experiences' | 'prestations' | 'options'

/**
 * A row left out of its profile, by list and rank (1 for the first row of the list, in the order of
 * the source). Never its text. For an option: `prestation` is the rank of its offer, `rang` its own
 * rank among the options of that offer.
 */
export interface LigneLaissee {
	liste: ListeBornee
	rang: number
	prestation?: number
}

const horsTexte = (valeur: string | null, maximum: number): boolean => textMessage(valeur, maximum) !== null
const horsNom = (valeur: string | null): boolean => horsTexte(valeur, NAME_MAX_LENGTH)
const horsDescription = (valeur: string | null): boolean => horsTexte(valeur, DESCRIPTION_MAX_LENGTH)

/**
 * Whether the server (src/collections/profile-lists.ts) would refuse a row, and with it the whole
 * profile: a text longer than its bound, a course obtained more than a year after `maintenant`,
 * an experience that ends before it starts. These bounds are the v3's, stricter than Strapi's.
 */
const horsBornes = {
	competences: (c: Competence) => horsNom(c.name) || horsDescription(c.description),
	langues: (l: Langue) => horsNom(l.name),
	formations: (f: Formation, maintenant: Date) =>
		horsNom(f.diploma) ||
		horsNom(f.school) ||
		horsDescription(f.course_description) ||
		obtainMessage(f.date_graduation, maintenant) !== null,
	experiences: (e: Experience) =>
		horsNom(e.company) ||
		horsNom(e.job_name) ||
		horsNom(e.city) ||
		horsDescription(e.description) ||
		dateMessage(e.date_start) !== null ||
		endMessage(e.date_end, e.date_start) !== null,
	prestations: (p: Pick<OptionDePrestation, 'name' | 'description' | 'price'>) =>
		horsNom(p.name) || horsDescription(p.description) || horsNom(p.price),
} as const

/**
 * The sections of a profile without the rows the v3 would refuse, and those rows (rule 5: counted
 * and listed, never corrected). The rest of the profile is taken. An offer left out takes its
 * options with it, and each of them is listed too.
 */
export function lignesDansLesBornes(
	sections: SectionsLues,
	maintenant: Date
): { sections: SectionsLues; laissees: LigneLaissee[] } {
	const laissees: LigneLaissee[] = []
	const garder = <T>(liste: ListeBornee, lignes: readonly T[], horsDesBornes: (ligne: T) => boolean): T[] =>
		lignes.filter((ligne, rang) => {
			const hors = horsDesBornes(ligne)
			if (hors) laissees.push({ liste, rang: rang + 1 })
			return !hors
		})
	const prestations = sections.prestations.flatMap((offre, rangDeLOffre): Prestation[] => {
		const prestation = rangDeLOffre + 1
		const options = offre.options.map((option, rang) => ({ option, rang: rang + 1 }))
		if (horsBornes.prestations(offre)) {
			laissees.push({ liste: 'prestations', rang: prestation })
			for (const { rang } of options) laissees.push({ liste: 'options', rang, prestation })
			return []
		}
		const gardees = options.filter(({ option, rang }) => {
			const hors = horsBornes.prestations(option)
			if (hors) laissees.push({ liste: 'options', rang, prestation })
			return !hors
		})
		return [{ ...offre, options: gardees.map(({ option }) => option) }]
	})
	const gardees: SectionsLues = {
		...sections,
		competences: garder('competences', sections.competences, horsBornes.competences),
		langues: garder('langues', sections.langues, horsBornes.langues),
		formations: garder('formations', sections.formations, f => horsBornes.formations(f, maintenant)),
		experiences: garder('experiences', sections.experiences, horsBornes.experiences),
		prestations,
	}
	const ordre: readonly ListeBornee[] = [
		'competences',
		'langues',
		'formations',
		'experiences',
		'prestations',
		'options',
	]
	laissees.sort(
		(a, b) =>
			ordre.indexOf(a.liste) - ordre.indexOf(b.liste) || (a.prestation ?? 0) - (b.prestation ?? 0) || a.rang - b.rang
	)
	return { sections: gardees, laissees }
}

/** A day of these lists as the collection stores it, or null. */
const leJour = (date: string | null): unknown => (date === null ? null : dayDate(date))

/**
 * A price of the source: the text byte for byte (not trimmed: rule 2), and the amount the single
 * rule reads in it, or null.
 */
const prixDeLaSource = (saisie: string | null) => ({
	priceText: saisie,
	priceFrom: parsePrice(saisie).priceFrom,
})

/**
 * The lists and the networks of a profile, under the names of Payload, in the order of the old
 * site, each value as it is. The rows carry no identifier: Payload gives one.
 */
export function valeursDesListes(sections: SectionsLues): Record<string, unknown> {
	const reseau = sections.reseau
	return {
		skills: sections.competences.map(({ name, description }) => ({ name, description })),
		languages: sections.langues.map(({ name }) => ({ name })),
		courses: sections.formations.map(({ diploma, school, date_graduation, course_description }) => ({
			diploma,
			school,
			graduatedAt: leJour(date_graduation),
			description: course_description,
		})),
		experiences: sections.experiences.map(({ company, job_name, city, date_start, date_end, description }) => ({
			company,
			jobTitle: job_name,
			city,
			startDate: leJour(date_start),
			endDate: leJour(date_end),
			description,
		})),
		serviceOffers: sections.prestations.map(({ name, description, price, options }) => ({
			name,
			description,
			...prixDeLaSource(price),
			options: options.map(option => ({
				name: option.name,
				description: option.description,
				...prixDeLaSource(option.price),
			})),
		})),
		networks: reseau
			? {
					youtube: reseau.youtube ?? null,
					facebook: reseau.facebook ?? null,
					instagram: reseau.instagram ?? null,
					website: reseau.website ?? null,
					linkedin: reseau.linkedin ?? null,
				}
			: null,
	}
}
