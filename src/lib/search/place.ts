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

import { DEPARTEMENTS, departementDuCodePostal, normaliserLieu } from '../departements'

const DEPARTMENT_NAMES = new Map<string, string[]>([
	...Object.entries(DEPARTEMENTS).map(([code, nom]): [string, string[]] => [normaliserLieu(nom), [code]]),
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
const EVERYWHERE = new Set(['france', 'toute la france', 'france entiere', 'partout en france', 'france metropolitaine'])

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
}

/** A segment that is a code of département: « 74 », « 2a », « 974 », « 20 ». */
function segmentCodes(segment: string): string[] {
	if (segment === '20') return ['2A', '2B']
	const code = segment.toUpperCase()
	return DEPARTMENT_CODE.test(code) && DEPARTEMENTS[code] ? [code] : []
}

/** What a city field says of where: the places written and the départements named. */
export function readPlace(valeur: unknown): Place {
	const raw = typeof valeur === 'string' ? valeur : ''
	const departments = new Set<string>()
	for (const [code] of raw.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
		const department = departementDuCodePostal(code)
		if (department) departments.add(department)
	}
	const segments: PlaceSegment[] = []
	for (const chunk of raw.split(SEPARATORS)) {
		const segment = normaliserLieu(chunk)
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
	return { segments, departements: [...departments] }
}

const emptyPlace = (lieu: Place): boolean => lieu.segments.length === 0 && lieu.departements.length === 0

/** A place that starts with this name of département, and not with a longer one that begins the same. */
const startsWithDepartment = (texte: string, nom: string): boolean =>
	startsWith(texte, nom) && !(LONGEST_NAMES.get(nom) ?? []).some(long => startsWith(texte, long))

/** Where a profile works, as the search reads it: its commune, and the département of its INSEE code. */
export interface ProfilePlace {
	ville: string | null
	departement: string | null
	/** True when she gives a city and a radius: she travels. */
	seDeplace: boolean
}

/** The place of a profile, in the shape of what was typed. */
export function profilePlace({ ville: city, departement: department }: Pick<ProfilePlace, 'ville' | 'departement'>): Place {
	const read = readPlace(city)
	return { segments: read.segments, departements: department ? [department] : [] }
}

/**
 * How the place of a profile matches what was typed:
 * - 'ville': the words typed, whole and in order, are in her commune (« annecy » in « Annecy-le-Vieux »,
 *   not in « Annemasse »); a name of département only at the start of a place and never inside a longer
 *   one (« Savoie » is not « Haute-Savoie »); a country or a region only when it holds nothing else
 *   (« Annecy, Suisse » is Annecy);
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
	if (cherche.departements.some(code => profil.departements.includes(code))) return 'departement'
	return null
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
	codes.map(code => `du ${code}${DEPARTEMENTS[code] ? ` (${DEPARTEMENTS[code]})` : ''}`).join(' et ')

export interface OthersSection<T> {
	cle: 'departement' | 'deplacent' | 'autres'
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
