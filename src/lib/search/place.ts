/**
 * Where the profiles of a search by city are (ticket 098; plan 02 U17; decisions of 09/10/2026 and
 * 13/10/2026): first the artists of the city or of the département typed, the only ones the title
 * counts, then the others in sections.
 *
 * Ported from src/lib/lieu.js of the old site (branch main), with one change: a profile's place was
 * free text there, and is now its commune, with the département the server computed from its INSEE
 * code. What the visitor typed is still read as text: a city, a postal code (74000), a code of
 * département (« 74 », « (74) », 2A, 974) or a name (Haute-Savoie), never geocoded. « France » says
 * nothing of where; a country or a region only counts when nothing more precise was typed.
 */

import { DEPARTMENTS, departmentOfPostalCode, normalizePlace } from '../departments'
import { distanceKm, type GeoPoint, validPoint } from './geo-distance'

const DEPARTMENT_NAMES = new Map<string, string[]>([
	...Object.entries(DEPARTMENTS).map(([code, nom]): [string, string[]] => [normalizePlace(nom), [code]]),
	['corse', ['2A', '2B']],
	['reunion', ['974']],
])

const startsWith = (texte: string, mots: string): boolean => `${texte} `.startsWith(`${mots} `)
const contains = (texte: string, mots: string): boolean => ` ${texte} `.includes(` ${mots} `)

/** A name of département → the longer names that begin with it: « loire » → « loire atlantique ». */
const LONGEST_NAMES = new Map(
	[...DEPARTMENT_NAMES.keys()].map(nom => [
		nom,
		[...DEPARTMENT_NAMES.keys()].filter(autre => autre !== nom && startsWith(autre, nom)),
	])
)

/** The whole country: not a place to rank by. */
const EVERYWHERE = new Set([
	'france',
	'toute la france',
	'france entiere',
	'partout en france',
	'france metropolitaine',
])

/** Countries and regions (those of 2016, the former ones still written): wider than a city or a département. */
const LARGES = new Set([
	'suisse',
	'belgique',
	'luxembourg',
	'monaco',
	'allemagne',
	'italie',
	'espagne',
	'andorre',
	'europe',
	'auvergne rhone alpes',
	'bourgogne franche comte',
	'bretagne',
	'centre val de loire',
	'grand est',
	'hauts de france',
	'ile de france',
	'idf',
	'normandie',
	'nouvelle aquitaine',
	'occitanie',
	'pays de la loire',
	'provence alpes cote d azur',
	'paca',
	'cote d azur',
	'provence',
	'rhone alpes',
	'auvergne',
	'alsace',
	'lorraine',
	'champagne ardenne',
	'picardie',
	'nord pas de calais',
	'aquitaine',
	'limousin',
	'poitou charentes',
	'midi pyrenees',
	'languedoc roussillon',
	'bourgogne',
	'franche comte',
	'haute normandie',
	'basse normandie',
	'centre',
])

/** Numbers in a place (postal code, arrondissement) are not part of its name: « Paris 15e » is in Paris. */
const NUMBER = /^\d+(e|er|eme|ieme|re)?$/
/** Places in one field: « Annecy / Genève », « Annecy (74) », « Lyon - Rhône ». */
const SEPARATORS = /[,;/|+()[\]]|\s[-–—]\s/
const DEPARTMENT_CODE = /^(\d{2}|2A|2B|97\d)$/

export interface PlaceSegment {
	/** The place written, normalised, without its numbers. */
	mots: string
	/** True when the place is the name of a département. */
	departement: boolean
	/** True when it is a country or a region. */
	large: boolean
}

export interface Place {
	segments: PlaceSegment[]
	/** Codes of département found in the text. */
	departements: string[]
	/**
	 * The postal codes found in the text (ticket 263), once each. For a profile: the postal codes of her
	 * commune, as the referential gave them.
	 */
	postalCodes: string[]
}

/** A segment that is a code of département: « 74 », « 2a », « 974 », « 20 ». */
function segmentCodes(segment: string): string[] {
	if (segment === '20') return ['2A', '2B']
	const code = segment.toUpperCase()
	return DEPARTMENT_CODE.test(code) && DEPARTMENTS[code] ? [code] : []
}

/** What a city field says of where: the places written and the départements named. */
export function readPlace(valeur: unknown): Place {
	const raw = typeof valeur === 'string' ? valeur : ''
	const departments = new Set<string>()
	const postalCodes = new Set<string>()
	for (const [code] of raw.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
		postalCodes.add(code)
		const department = departmentOfPostalCode(code)
		if (department) departments.add(department)
	}
	const segments: PlaceSegment[] = []
	for (const chunk of raw.split(SEPARATORS)) {
		const segment = normalizePlace(chunk)
		const codes = segmentCodes(segment)
		for (const code of codes) departments.add(code)
		const words = codes.length
			? ''
			: segment
					.split(' ')
					.filter(mot => mot && !NUMBER.test(mot))
					.join(' ')
		if (!words || EVERYWHERE.has(words)) continue
		const byName = DEPARTMENT_NAMES.get(words)
		for (const code of byName ?? []) departments.add(code)
		segments.push({ mots: words, departement: byName !== undefined, large: LARGES.has(words) })
	}
	return { segments, departements: [...departments], postalCodes: [...postalCodes] }
}

const emptyPlace = (lieu: Place): boolean =>
	lieu.segments.length === 0 && lieu.departements.length === 0 && lieu.postalCodes.length === 0

/** A place that starts with this name of département, and not with a longer one that begins the same. */
const startsWithDepartment = (texte: string, nom: string): boolean =>
	startsWith(texte, nom) && !(LONGEST_NAMES.get(nom) ?? []).some(long => startsWith(texte, long))

/** Where a profile works, as the search reads it: its commune, and the département of its INSEE code. */
export interface ProfilePlace {
	ville: string | null
	departement: string | null
	/** True when she gives a city and a radius: she travels. */
	seDeplace: boolean
	/**
	 * The postal codes of her commune (ticket 263), when the referential gave them. A commune without
	 * any is found by its département, as before.
	 */
	postalCodes?: readonly string[]
}

/** The place of a profile, in the shape of what was typed. */
export function profilePlace({
	ville: city,
	departement: department,
	postalCodes = [],
}: Pick<ProfilePlace, 'ville' | 'departement' | 'postalCodes'>): Place {
	const read = readPlace(city)
	return { segments: read.segments, departements: department ? [department] : [], postalCodes: [...postalCodes] }
}

/**
 * How the place of a profile matches what was typed:
 * - 'ville': the words typed, whole and in order, are in her commune (« annecy » in « Annecy-le-Vieux »,
 *   not in « Annemasse »); a name of département only at the start of a place and never inside a longer
 *   one (« Savoie » is not « Haute-Savoie »); a country or a region only when it holds nothing else
 *   (« Annecy, Suisse » is Annecy);
 * - 'ville' also when a postal code typed is one of the postal codes of her commune (ticket 263): a code
 *   shared by several communes finds the profiles of every one of them;
 * - 'departement': a département in common (postal code, code or name);
 * - null otherwise, and always for a profile without a commune.
 */
export function placeMatch(profil: Place, cherche: Place): 'ville' | 'departement' | null {
	const precise = cherche.segments.filter(segment => !segment.large)
	const segments = precise.length || cherche.departements.length ? precise : cherche.segments
	for (const { mots: words, departement: department } of segments) {
		if (profil.segments.some(p => (department ? startsWithDepartment(p.mots, words) : contains(p.mots, words))))
			return 'ville'
	}
	if (cherche.postalCodes.some(code => profil.postalCodes.includes(code))) return 'ville'
	if (cherche.departements.some(code => profil.departements.includes(code))) return 'departement'
	return null
}

/**
 * The communes the postal codes typed found, taken from the profiles listed (ticket 263): each name once,
 * in the order of the profiles. No call to the referential: a search reads nothing outside the directory.
 */
export function municipalitiesOfPostalCodes(profils: readonly ProfilePlace[], city: string): string[] {
	const typed = readPlace(city).postalCodes
	if (typed.length === 0) return []
	const names = new Set<string>()
	for (const { ville: municipality, postalCodes = [] } of profils)
		if (municipality && postalCodes.some(code => typed.includes(code))) names.add(municipality)
	return [...names]
}

/** « Dans la commune de Cambrin. », « Dans les communes de Cambrin et Cuinchy. »; '' without a commune. */
export function municipalitiesPhrase(names: readonly string[]): string {
	if (names.length === 0) return ''
	if (names.length === 1) return `Dans la commune de ${names[0]}.`
	return `Dans les communes de ${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}.`
}

/**
 * The département of a search by city: the one typed (postal code, code or name), else the one the
 * profiles of that city are in, the most frequent, the first in their order on a tie; none without
 * either (no geocoding: « Annecy » alone says nothing).
 */
export function searchDepartments(locaux: readonly ProfilePlace[], city: string): string[] {
	const tapes = readPlace(city).departements
	if (tapes.length) return tapes
	const count = new Map<string, number>()
	for (const profile of locaux)
		if (profile.departement) count.set(profile.departement, (count.get(profile.departement) ?? 0) + 1)
	let best: string | null = null
	for (const [code, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = code
	return best === null ? [] : [best]
}

/** « du 74 (Haute-Savoie) », « du 2A (Corse-du-Sud) et du 2B (Haute-Corse) ». */
export const inDepartment = (codes: readonly string[]): string =>
	codes.map(code => `du ${code}${DEPARTMENTS[code] ? ` (${DEPARTMENTS[code]})` : ''}`).join(' et ')

export interface OthersSection<T> {
	cle: 'departement' | 'deplacent' | 'autres' | 'covering' | 'nearby'
	/** Its h2. */
	titre: string
	profils: T[]
}

export interface ProfilesByPlace<T> {
	/** The profiles of the place typed: the city, then the département. The only ones the title counts. */
	locaux: T[]
	/** False without a usable place (no city, « France »): one list. */
	parLieu: boolean
	departements: string[]
	sections: OthersSection<T>[]
	/** Its h2 « À <place> », only for a search ranked by distance (ticket 294). */
	localTitle?: string
}

/**
 * A search by city in sections, every profile once: first those of the place typed, city then
 * département (the only ones counted in the title); then all the others, in three sections:
 * - the other profiles of the département of the search, when one is known;
 * - those of elsewhere that go to the client (a city and a radius);
 * - the rest, « Zone non renseignée » included.
 * Each list keeps the order given.
 */
export function sectionsByPlace<T extends ProfilePlace>(profils: readonly T[], city: string): ProfilesByPlace<T> {
	const searched = readPlace(city)
	if (emptyPlace(searched)) return { locaux: [...profils], parLieu: false, departements: [], sections: [] }

	const cityProfiles: T[] = []
	const department: T[] = []
	const others: T[] = []
	for (const profile of profils) {
		const match = placeMatch(profilePlace(profile), searched)
		if (match === 'ville') cityProfiles.push(profile)
		else if (match === 'departement') department.push(profile)
		else others.push(profile)
	}
	const localProfiles = [...cityProfiles, ...department]
	const departments = searchDepartments(localProfiles, city)
	const inSearchedDepartment = others.filter(profil => profil.departement && departments.includes(profil.departement))
	const elsewhere = others.filter(profil => !inSearchedDepartment.includes(profil))
	const section = (cle: OthersSection<T>['cle'], titre: string, liste: T[]): OthersSection<T>[] =>
		liste.length ? [{ cle, titre, profils: liste }] : []
	return {
		locaux: localProfiles,
		parLieu: true,
		departements: departments,
		sections: [
			...section('departement', `Autres maquilleuses ${inDepartment(departments)}`, inSearchedDepartment),
			...section(
				'deplacent',
				'Autres maquilleuses qui se déplacent',
				elsewhere.filter(profil => profil.seDeplace)
			),
			...section(
				'autres',
				'Autres maquilleuses',
				elsewhere.filter(profil => !profil.seDeplace)
			),
		],
	}
}

/** Where the centre of a profile's commune is and how far she goes: what the ranking by distance reads (ticket 294). */
export interface ProfileGeometry {
	/** The centre of her commune, or none (a commune without coordinates, a zone abroad). */
	center?: GeoPoint | null
	/** Her radius in km around her commune, or none. */
	radiusKm?: number | null
}

/** The farthest a profile that does not cover the client is still shown, in km. */
export const NEARBY_MAX_KM = 50

/** What a ranking by distance needs besides the profiles. */
export interface DistanceOptions<T> {
	/** Where the place typed is, and its name. */
	origin: { point: GeoPoint; label: string }
	/** How well a profile matched the words typed (lower is better); equal for all when none. */
	relevance?: ReadonlyMap<T, number>
	/** The name a tie is broken by. */
	name?: (profil: T) => string
}

/**
 * A search by city ranked by distance (ticket 294; audit UX improvement 3), every profile at most once:
 * - `locaux`: the profiles whose commune is the place typed (« À <place> »), the nearest first; then,
 *   as before, those without coordinates that share its département. The only ones the title counts;
 * - `covering` (« Se déplacent jusqu’à vous »): her radius reaches the place;
 * - `nearby` (« Plus loin, à moins de 50 km »): her centre is within 50 km but her radius does not reach.
 * A profile farther than that is in no section. One whose commune has no coordinates is found by its
 * name only: it is never put « farther ». Inside a list: distance, then relevance, then name.
 */
export function sectionsByDistance<T extends ProfilePlace & ProfileGeometry>(
	profils: readonly T[],
	city: string,
	{ origin, relevance, name }: DistanceOptions<T>
): ProfilesByPlace<T> {
	const searched = readPlace(city)
	if (emptyPlace(searched)) return { locaux: [...profils], parLieu: false, departements: [], sections: [] }

	const distances = new Map<T, number>()
	const distanceOf = (profil: T): number => distances.get(profil) ?? Number.POSITIVE_INFINITY
	const cityProfiles: T[] = []
	const withoutCenter: T[] = []
	const covering: T[] = []
	const nearby: T[] = []
	for (const profile of profils) {
		const match = placeMatch(profilePlace(profile), searched)
		const known = profile.center != null && validPoint(profile.center)
		if (known && profile.center) distances.set(profile, distanceKm(origin.point, profile.center))
		if (match === 'ville') cityProfiles.push(profile)
		else if (!known) {
			if (match === 'departement') withoutCenter.push(profile)
		} else {
			const distance = distanceOf(profile)
			const radius = profile.radiusKm ?? null
			if (profile.seDeplace && radius !== null && distance <= radius) covering.push(profile)
			else if (distance <= NEARBY_MAX_KM) nearby.push(profile)
		}
	}
	// Distance to the tenth of a km (the profiles of one commune are at the very same distance), then the words, then the name.
	const byDistance = (a: T, b: T): number =>
		Math.round(distanceOf(a) * 10) - Math.round(distanceOf(b) * 10) ||
		(relevance?.get(a) ?? 0) - (relevance?.get(b) ?? 0) ||
		(name?.(a) ?? '').localeCompare(name?.(b) ?? '', 'fr')
	const ranked = (liste: T[]): T[] => liste.toSorted(byDistance)
	const localProfiles = [...ranked(cityProfiles), ...withoutCenter]
	const section = (cle: OthersSection<T>['cle'], titre: string, liste: T[]): OthersSection<T>[] =>
		liste.length ? [{ cle, titre, profils: ranked(liste) }] : []
	return {
		locaux: localProfiles,
		parLieu: true,
		departements: searchDepartments(localProfiles, city),
		localTitle: `À ${origin.label}`,
		sections: [
			...section('covering', 'Se déplacent jusqu’à vous', covering),
			...section('nearby', `Plus loin, à moins de ${NEARBY_MAX_KM} km`, nearby),
		],
	}
}
