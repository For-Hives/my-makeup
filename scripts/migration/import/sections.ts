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
 * - **The photos** are the media adopted for the files the profile designates (./media.ts): a
 *   file not adopted is reported, never invented.
 *
 * No `bun` import here: the import can run under Node too.
 */

import { parsePrice } from '../../../src/lib/price'
import type { ProfileNetworks } from '../../../src/lib/profile/completeness'
import {
	DESCRIPTION_MAX_LENGTH,
	dateMessage,
	dayDate,
	endMessage,
	NAME_MAX_LENGTH,
	obtainMessage,
	textMessage,
} from '../../../src/lib/profile/lists'
import { PROFILE_TYPE } from './media'
import type { Query } from './source'

export interface Skill {
	name: string | null
	description: string | null
}

export interface Language {
	name: string | null
}

export interface Course {
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

export interface ServiceOfferOption {
	name: string | null
	description: string | null
	price: string | null
}

export interface ServiceOffer {
	/** The row of Strapi: its options hang on it. */
	id: number
	name: string | null
	description: string | null
	price: string | null
	options: ServiceOfferOption[]
}

/** The sections of one profile of the source, in their order, under the names of Strapi. */
export interface ReadSections {
	competences: Skill[]
	langues: Language[]
	formations: Course[]
	experiences: Experience[]
	prestations: ServiceOffer[]
	/** The single network row of the profile, phone and email included (read, never written here). */
	reseau: ProfileNetworks | null
	/** The files of its main picture and of its gallery, in order. */
	photoPrincipale: number[]
	galerie: number[]
	/** Links of its lists (or of the options of its offers) that name no row: reported. */
	liensSansLigne: number
}

export const EMPTY_SECTIONS: ReadSections = {
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
const dayColumn = (colonne: string): string => `to_char(c.${colonne}, 'YYYY-MM-DD') AS ${colonne}`

/**
 * The rows of one list of the entries of `liens`, in their order, the link kept even when its row
 * is missing (`ligne` is then null). The names here are constants of this file, never a value.
 */
const listQuery = (liens: string, table: string, type: string, champ: string, colonnes: readonly string[]) =>
	`SELECT l.entity_id AS entree, c.id AS ligne, ${colonnes.join(', ')}
	FROM ${liens} l LEFT JOIN ${table} c ON c.id = l.component_id
	WHERE l.component_type = '${type}' AND l.field = '${champ}' ORDER BY l.entity_id, l."order", l.id`

const PROFILES_LINKS = 'makeup_artistes_components'

const QUERIES = {
	competences: listQuery(PROFILES_LINKS, 'components_makeupartists_skills', 'makeupartists.skills', 'skills', [
		'c.name',
		'c.description',
	]),
	langues: listQuery(PROFILES_LINKS, 'components_makeupartists_languages', 'makeupartists.language', 'language', [
		'c.name',
	]),
	formations: listQuery(PROFILES_LINKS, 'components_makeupartists_courses', 'makeupartists.courses', 'courses', [
		'c.diploma',
		'c.school',
		dayColumn('date_graduation'),
		'c.course_description',
	]),
	experiences: listQuery(
		PROFILES_LINKS,
		'components_makeupartists_experiences',
		'makeupartists.experiences',
		'experiences',
		['c.company', 'c.job_name', 'c.city', dayColumn('date_start'), dayColumn('date_end'), 'c.description']
	),
	prestations: listQuery(
		PROFILES_LINKS,
		'components_makeupartists_service_offers',
		'makeupartists.service-offers',
		'service_offers',
		['c.name', 'c.description', 'c.price']
	),
	options: listQuery(
		'components_makeupartists_service_offers_components',
		'components_service_offers_options',
		'service-offers.options',
		'options',
		['c.name', 'c.description', 'c.price']
	),
	reseaux: listQuery(PROFILES_LINKS, 'components_makeupartists_networks', 'makeupartists.network', 'network', [
		'c.youtube',
		'c.facebook',
		'c.instagram',
		'c.website',
		'c.linkedin',
		'c.phone',
		'c.email',
	]),
	photos: `SELECT related_id AS entree, file_id AS fichier, field AS champ FROM files_related_morphs
		WHERE related_type = '${PROFILE_TYPE}' AND field IN ('main_picture', 'image_gallery')
		ORDER BY related_id, field, "order", id`,
} as const

type ReadRow<T> = T & { entree: number; ligne: number | null }

/** The rows of each entry, in order; a link without its row counted apart. */
function byEntry<T extends object>(lignes: readonly ReadRow<T>[], sansLigne: Map<number, number>): Map<number, T[]> {
	const byId = new Map<number, T[]>()
	for (const { entree: entry, ligne: row, ...values } of lignes) {
		const id = Number(entry)
		if (row === null) {
			sansLigne.set(id, (sansLigne.get(id) ?? 0) + 1)
			continue
		}
		byId.set(id, [...(byId.get(id) ?? []), values as unknown as T])
	}
	return byId
}

/** The sections of every profile of the source that has one, by its identifier. */
export async function readSections(requete: Query): Promise<Map<number, ReadSections>> {
	const withoutRow = new Map<number, number>()
	const withoutOffersRow = new Map<number, number>()
	const skills = byEntry(await requete<ReadRow<Skill>>(QUERIES.competences), withoutRow)
	const languages = byEntry(await requete<ReadRow<Language>>(QUERIES.langues), withoutRow)
	const courses = byEntry(await requete<ReadRow<Course>>(QUERIES.formations), withoutRow)
	const experiences = byEntry(await requete<ReadRow<Experience>>(QUERIES.experiences), withoutRow)
	const networks = byEntry(await requete<ReadRow<ProfileNetworks>>(QUERIES.reseaux), withoutRow)
	const readServiceOffers = await requete<ReadRow<Omit<ServiceOffer, 'id' | 'options'>>>(QUERIES.prestations)
	// The options hang on the row of their offer, by its identifier in Strapi.
	const options = byEntry(await requete<ReadRow<ServiceOfferOption>>(QUERIES.options), withoutOffersRow)
	const serviceOffers = byEntry(
		readServiceOffers.map(lue => ({ ...lue, id: lue.ligne, options: [] as ServiceOfferOption[] })),
		withoutRow
	)
	const photos = await requete<{ entree: number; fichier: number; champ: string }>(QUERIES.photos)

	const sections = new Map<number, ReadSections>()
	const sectionsOf = (id: number): ReadSections => {
		let read = sections.get(id)
		if (!read) {
			read = { ...EMPTY_SECTIONS, photoPrincipale: [], galerie: [] }
			sections.set(id, read)
		}
		return read
	}
	for (const [id, rows] of skills) sectionsOf(id).competences = rows
	for (const [id, rows] of languages) sectionsOf(id).langues = rows
	for (const [id, rows] of courses) sectionsOf(id).formations = rows
	for (const [id, rows] of experiences) sectionsOf(id).experiences = rows
	for (const [id, [first]] of networks) sectionsOf(id).reseau = first ?? null
	for (const [id, rows] of serviceOffers)
		sectionsOf(id).prestations = rows.map(prestation => ({
			...prestation,
			id: Number(prestation.id),
			options: options.get(Number(prestation.id)) ?? [],
		}))
	for (const { entree: entry, fichier: file, champ: field } of photos) {
		const read = sectionsOf(Number(entry))
		if (field === 'main_picture') read.photoPrincipale.push(Number(file))
		else read.galerie.push(Number(file))
	}
	for (const [id, count] of withoutRow) sectionsOf(id).liensSansLigne += count
	// A link of an option without its row belongs to the profile of its offer.
	for (const [offer, count] of withoutOffersRow) {
		const profile = [...sections].find(([, read]) => read.prestations.some(({ id }) => id === offer))?.[0]
		if (profile !== undefined) sectionsOf(profile).liensSansLigne += count
	}
	return sections
}

/** A list whose rows the import may leave out when one of their values is outside a bound of the v3. */
export type BoundedList = 'competences' | 'langues' | 'formations' | 'experiences' | 'prestations' | 'options'

/**
 * A row left out of its profile, by list and rank (1 for the first row of the list, in the order of
 * the source). Never its text. For an option: `prestation` is the rank of its offer, `rang` its own
 * rank among the options of that offer.
 */
export interface SkippedRow {
	liste: BoundedList
	rang: number
	prestation?: number
}

const outsideText = (valeur: string | null, maximum: number): boolean => textMessage(valeur, maximum) !== null
const outsideName = (valeur: string | null): boolean => outsideText(valeur, NAME_MAX_LENGTH)
const outsideDescription = (valeur: string | null): boolean => outsideText(valeur, DESCRIPTION_MAX_LENGTH)

/**
 * Whether the server (src/collections/profile-lists.ts) would refuse a row, and with it the whole
 * profile: a text longer than its bound, a course obtained more than a year after `maintenant`,
 * an experience that ends before it starts. These bounds are the v3's, stricter than Strapi's.
 */
const outsideBounds = {
	competences: (c: Skill) => outsideName(c.name) || outsideDescription(c.description),
	langues: (l: Language) => outsideName(l.name),
	formations: (f: Course, maintenant: Date) =>
		outsideName(f.diploma) ||
		outsideName(f.school) ||
		outsideDescription(f.course_description) ||
		obtainMessage(f.date_graduation, maintenant) !== null,
	experiences: (e: Experience) =>
		outsideName(e.company) ||
		outsideName(e.job_name) ||
		outsideName(e.city) ||
		outsideDescription(e.description) ||
		dateMessage(e.date_start) !== null ||
		endMessage(e.date_end, e.date_start) !== null,
	prestations: (p: Pick<ServiceOfferOption, 'name' | 'description' | 'price'>) =>
		outsideName(p.name) || outsideDescription(p.description) || outsideName(p.price),
} as const

/**
 * The sections of a profile without the rows the v3 would refuse, and those rows (rule 5: counted
 * and listed, never corrected). The rest of the profile is taken. An offer left out takes its
 * options with it, and each of them is listed too.
 */
export function rowsInBounds(
	sections: ReadSections,
	maintenant: Date
): { sections: ReadSections; laissees: SkippedRow[] } {
	const skipped: SkippedRow[] = []
	const keep = <T>(liste: BoundedList, lignes: readonly T[], horsDesBornes: (ligne: T) => boolean): T[] =>
		lignes.filter((ligne, rang) => {
			const outside = horsDesBornes(ligne)
			if (outside) skipped.push({ liste, rang: rang + 1 })
			return !outside
		})
	const serviceOffers = sections.prestations.flatMap((offre, rangDeLOffre): ServiceOffer[] => {
		const serviceOffer = rangDeLOffre + 1
		const options = offre.options.map((option, rang) => ({ option, rang: rang + 1 }))
		if (outsideBounds.prestations(offre)) {
			skipped.push({ liste: 'prestations', rang: serviceOffer })
			for (const { rang: position } of options)
				skipped.push({ liste: 'options', rang: position, prestation: serviceOffer })
			return []
		}
		const keptItems = options.filter(({ option, rang: position }) => {
			const outside = outsideBounds.prestations(option)
			if (outside) skipped.push({ liste: 'options', rang: position, prestation: serviceOffer })
			return !outside
		})
		return [{ ...offre, options: keptItems.map(({ option }) => option) }]
	})
	const keptItems: ReadSections = {
		...sections,
		competences: keep('competences', sections.competences, outsideBounds.competences),
		langues: keep('langues', sections.langues, outsideBounds.langues),
		formations: keep('formations', sections.formations, f => outsideBounds.formations(f, maintenant)),
		experiences: keep('experiences', sections.experiences, outsideBounds.experiences),
		prestations: serviceOffers,
	}
	const order: readonly BoundedList[] = [
		'competences',
		'langues',
		'formations',
		'experiences',
		'prestations',
		'options',
	]
	skipped.sort(
		(a, b) =>
			order.indexOf(a.liste) - order.indexOf(b.liste) || (a.prestation ?? 0) - (b.prestation ?? 0) || a.rang - b.rang
	)
	return { sections: keptItems, laissees: skipped }
}

/** A day of these lists as the collection stores it, or null. */
const toDay = (date: string | null): unknown => (date === null ? null : dayDate(date))

/**
 * A price of the source: the text byte for byte (not trimmed: rule 2), and the amount the single
 * rule reads in it, or null.
 */
const sourcePrice = (saisie: string | null) => ({
	priceText: saisie,
	priceFrom: parsePrice(saisie).priceFrom,
})

/**
 * The lists and the networks of a profile, under the names of Payload, in the order of the old
 * site, each value as it is. The rows carry no identifier: Payload gives one.
 */
export function listsValues(sections: ReadSections): Record<string, unknown> {
	const network = sections.reseau
	return {
		skills: sections.competences.map(({ name, description }) => ({ name, description })),
		languages: sections.langues.map(({ name }) => ({ name })),
		courses: sections.formations.map(({ diploma, school, date_graduation, course_description }) => ({
			diploma,
			school,
			graduatedAt: toDay(date_graduation),
			description: course_description,
		})),
		experiences: sections.experiences.map(({ company, job_name, city, date_start, date_end, description }) => ({
			company,
			jobTitle: job_name,
			city,
			startDate: toDay(date_start),
			endDate: toDay(date_end),
			description,
		})),
		serviceOffers: sections.prestations.map(({ name, description, price, options }) => ({
			name,
			description,
			...sourcePrice(price),
			options: options.map(option => ({
				name: option.name,
				description: option.description,
				...sourcePrice(option.price),
			})),
		})),
		networks: network
			? {
					youtube: network.youtube ?? null,
					facebook: network.facebook ?? null,
					instagram: network.instagram ?? null,
					website: network.website ?? null,
					linkedin: network.linkedin ?? null,
				}
			: null,
	}
}
