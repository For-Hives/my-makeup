/**
 * The zone of a profile as it is stored (plan 01 §3.3 P7.4 and §6.2; docs/migration/SCHEMA.md,
 * §5.2): a commune of the official list (its name, its INSEE code, its département, its
 * coordinates), a radius of 0 to 200 km, and « à domicile ». Never a postal address: the zone has
 * no field for one, a name of commune that looks like one is refused, and the coordinates are
 * rounded to about 1 km. All of France, without a pilot area (decision of 13/10/2026, evening):
 * the overseas collectivities of the official list too.
 *
 * The rules of the server, in one place: the département an INSEE code names, and what is wrong
 * with a value, in French. The collection (src/collections/Profiles.ts) calls them; the zone of
 * the makeup artist's space (ticket 123) shows the same messages.
 *
 * Checking that a commune is really on the official list (geo.api.gouv.fr), and that its name is
 * the one of its code, is not done here: the space (ticket 123) and the import (ticket 063) choose
 * it there. Here, only its form: a name made of the characters of a name of commune, which does
 * not look like an address.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { FRANCE_CODE, isCountryCode, normalizedCountryCode } from '../countries'
import { DEPARTMENTS } from '../departments'

/**
 * The radius a profile accepts, in whole kilometres (plan 01 §3.3 P7.4). The display keeps its
 * own bound (`RADIUS_MAX_KM`, src/lib/format-zone.ts, 1 000 km as on the old site), which is not
 * this one.
 */
export const RADIUS_BOUNDS_KM = { min: 0, max: 200 } as const

/** The longest name of a commune kept; the longest of the official list has 45 characters. */
export const CITY_NAME_MAX = 70

/**
 * The decimals kept of a coordinate: the centre of a commune to about 1 km (0.01° is 1.1 km of
 * latitude), never a point that locates a home.
 */
export const COORDINATE_DECIMALS = 2

/** The fields of the commune of a profile, in the order of SCHEMA.md §5.2. */
export const CITY_FIELDS = ['name', 'inseeCode', 'department', 'latitude', 'longitude'] as const

/**
 * The overseas collectivities whose communes the official list holds (geo.api.gouv.fr, 14/10/2026),
 * besides the 101 départements of src/lib/departments.ts: code → name. Their INSEE codes start
 * with these three characters, and `city.department` holds them.
 */
export const OVERSEAS_COLLECTIVITIES: Readonly<Record<string, string>> = {
	975: 'Saint-Pierre-et-Miquelon',
	977: 'Saint-Barthélemy',
	978: 'Saint-Martin',
	984: 'Terres australes et antarctiques françaises',
	986: 'Wallis-et-Futuna',
	987: 'Polynésie française',
	988: 'Nouvelle-Calédonie',
	989: 'Île de Clipperton',
}

/** What the server answers, in French, to a zone it refuses. */
export const ZONE_MESSAGES = {
	rayon: `Le rayon d’action se donne en kilomètres entiers, de ${RADIUS_BOUNDS_KM.min} à ${RADIUS_BOUNDS_KM.max} km.`,
	codeInseeMalForme: 'Le code INSEE de la commune est mal formé : 5 caractères, comme 74010 ou 2A004.',
	communeSansCodeInsee: 'Choisis ta commune dans la liste : sans son code INSEE, elle ne peut pas être enregistrée.',
	codeInseeSansNom: 'Il manque le nom de la commune de ce code INSEE.',
	nomInvalide: `Le nom de la commune est un texte de ${CITY_NAME_MAX} caractères au plus.`,
	nomAdresse: 'Ce nom ressemble à une adresse : choisis ta commune dans la liste, jamais ton adresse.',
	nomCaracteres:
		'Le nom d’une commune n’a que des lettres, des espaces, des traits d’union, des apostrophes et des parenthèses : choisis ta commune dans la liste.',
	latitude: 'La latitude de la commune va de -90 à 90.',
	longitude: 'La longitude de la commune va de -180 à 180.',
	coordonneesIncompletes: 'La latitude et la longitude de la commune vont ensemble.',
	coordonneesSansCommune: 'Des coordonnées sans commune ne peuvent pas être enregistrées.',
} as const

/**
 * An INSEE code of a commune: the département first (3 characters overseas, 2 in mainland France
 * and Corsica), then the number of the commune in it. Overseas comes first: « 97411 » is the
 * commune 11 of the département 974, never the commune 411 of a département 97; « 98735 » the
 * commune 35 of the collectivity 987.
 */
const CODE_INSEE = /^(?:(9[78]\d)(\d{2})|(\d{2}|2[AB])(\d{3}))$/

/**
 * The département an INSEE code names, or null when the code is not well formed: « 74010 » →
 * « 74 », « 2A004 » → « 2A », « 97411 » → « 974 », « 97701 » → « 977 ». The 101 départements of
 * src/lib/departments.ts and the overseas collectivities of the official list
 * (`OVERSEAS_COLLECTIVITIES`) exist here, nothing else: « 20004 » (Corsica is 2A and 2B),
 * « 97001 » and a commune numbered 0 are refused. The code is read as written: no space, A and B
 * in capitals (the collection writes it so before it checks it).
 */
export function departmentOfInseeCode(code: unknown): string | null {
	if (typeof code !== 'string') return null
	const [, overseas, overseasNumber, metropole, mainlandNumber] = CODE_INSEE.exec(code) ?? []
	const department = overseas ?? metropole
	const number = overseasNumber ?? mainlandNumber
	if (department === undefined || number === undefined || /^0+$/.test(number)) return null
	return Object.hasOwn(DEPARTMENTS, department) || Object.hasOwn(OVERSEAS_COLLECTIVITIES, department)
		? department
		: null
}

/** An INSEE code as the collection stores it: without spaces around, A and B in capitals, null when empty. */
export function normalizedInseeCode(code: unknown): unknown {
	if (typeof code !== 'string') return code
	return code.trim().toUpperCase() || null
}

/** A plain object, as a JSON body gives one: not an array, nor a date, a map or another instance. */
function plainObject(valeur: unknown): valeur is Record<string, unknown> {
	if (typeof valeur !== 'object' || valeur === null) return false
	const prototype = Object.getPrototypeOf(valeur)
	return prototype === Object.prototype || prototype === null
}

/**
 * A commune as the collection reads it, whatever a request sent: its fields.
 *
 * - An object is the whole commune: what it does not give is empty, never taken from the commune
 *   already stored. A name is so never saved next to the code of another commune, nor a commune
 *   next to the coordinates of the former one. Its `department` is the server's: not kept.
 * - `null` is the empty commune: it empties a stored one.
 * - A text, a number… is a name without an INSEE code, which the check refuses: free text is
 *   never a commune.
 * - An array, or another object than a plain one, is left as sent: `cityVerdict` refuses it.
 * - Nothing sent stays nothing (Payload hands the stored commune instead on an update).
 */
export function cityToFields(commune: unknown): unknown {
	if (commune === undefined) return commune
	if (plainObject(commune)) {
		const { name = null, inseeCode = null, latitude = null, longitude = null } = commune
		return { name, inseeCode, latitude, longitude }
	}
	if (typeof commune === 'object' && commune !== null) return commune
	return { name: commune ?? null, inseeCode: null, latitude: null, longitude: null }
}

/**
 * The commune as a whole, once read by `cityToFields`: nothing, or a plain object. An array (or
 * a date…) is refused in French: without it, its fields would be read as empty while the stored
 * ones stay, and its département would be lost.
 */
export function cityVerdict(commune: unknown): true | string {
	return commune === undefined || commune === null || plainObject(commune) ? true : ZONE_MESSAGES.communeSansCodeInsee
}

/**
 * Types of street, as src/lib/profile/public-place.ts reads them in an address (lower case, without
 * accents). Here they only count before another word: « Rue », « Le Chemin », « Le Passage » are
 * communes.
 */
const STREETS = new Set([
	'rue',
	'ruelle',
	'avenue',
	'av',
	'bd',
	'boulevard',
	'chemin',
	'allee',
	'impasse',
	'route',
	'place',
	'quai',
	'cours',
	'square',
	'esplanade',
	'promenade',
	'passage',
	'sentier',
	'traverse',
	'venelle',
	'voie',
	'montee',
	'chaussee',
	'faubourg',
	'rond-point',
	'lieu-dit',
	'lieudit',
	'hameau',
	'lotissement',
	'residence',
	'clos',
	'domaine',
	'parc',
	'za',
	'zac',
	'zi',
	'bp',
])

/** The ordinal of a municipal arrondissement, the only digits of the official list (« Paris 20e Arrondissement »). */
const DISTRICT = / \d{1,2}(?:er|e) arrondissement$/i

/**
 * Whether a name of commune looks like a postal address: a digit (a street number, a postal code)
 * other than the ordinal of an arrondissement, a comma or another separator of the parts of an
 * address, or a type of street followed by another word (« rue des Lilas »). No name of the
 * official list does: the rule was run on the whole list of 14/10/2026 (34 969 communes and 45
 * municipal arrondissements of geo.api.gouv.fr), and none was refused.
 */
export function looksLikeAnAddress(nom: string): boolean {
	const withoutDistrict = nom.trim().replace(DISTRICT, '')
	if (/\d/.test(withoutDistrict) || /[,;:/|]/.test(withoutDistrict)) return true
	const words = withoutDistrict.split(/\s+/).map(mot =>
		mot
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/^l['’]/, '')
	)
	return words.some((mot, i) => i < words.length - 1 && STREETS.has(mot))
}

/**
 * The characters of a name of the official list: letters of any script with their accents, spaces,
 * hyphens, apostrophes and parentheses (« Château-Chinon (Ville) », « L’Haÿ-les-Roses »), and the
 * ordinal of an arrondissement, the only digits (removed before this check). An email, a website,
 * an abbreviation (« St. ») or a symbol is not a name of commune.
 */
const NAME_CHARACTERS = /^[\p{L}\p{M} '’()-]*$/u

/** Whether a name holds only the characters of a name of commune (`NAME_CHARACTERS`). */
export function hasNameCharacters(nom: string): boolean {
	return NAME_CHARACTERS.test(nom.trim().replace(DISTRICT, ''))
}

/** A coordinate as the collection stores it: rounded to `COORDINATE_DECIMALS`; anything else as it came. */
export function roundedCoordinate(valeur: unknown): unknown {
	if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return valeur
	const factor = 10 ** COORDINATE_DECIMALS
	// `|| 0`: never a negative zero.
	return Math.round(valeur * factor) / factor || 0
}

/** A name as the collection stores it: without spaces around, null when empty. */
export function normalizedName(nom: unknown): unknown {
	if (typeof nom !== 'string') return nom
	return nom.trim() || null
}

/** Nothing given: absent, null, or a text of spaces only. */
const empty = (valeur: unknown): boolean =>
	valeur === null || valeur === undefined || (typeof valeur === 'string' && valeur.trim() === '')

/**
 * The radius: empty (the makeup artist has not said it), or a whole number of kilometres from 0
 * to 200. Gives `true`, or the message of the refusal.
 */
export function radiusVerdict(rayon: unknown): true | string {
	if (empty(rayon)) return true
	const { min, max } = RADIUS_BOUNDS_KM
	return typeof rayon === 'number' && Number.isInteger(rayon) && rayon >= min && rayon <= max
		? true
		: ZONE_MESSAGES.rayon
}

/** What a commune holds before it is checked: anything a request may send. */
export type CityInput = Partial<Record<(typeof CITY_FIELDS)[number], unknown>>

/** The fields of a commune that can be wrong, each with the message of its refusal. */
export type CityErrors = Partial<Record<'name' | 'inseeCode' | 'latitude' | 'longitude', string>>

/** A coordinate: absent, in its bounds, or out of them (not a number, or too far). */
function coordinate(valeur: unknown, borne: number): 'absente' | 'valide' | 'invalide' {
	if (empty(valeur)) return 'absente'
	return typeof valeur === 'number' && Number.isFinite(valeur) && Math.abs(valeur) <= borne ? 'valide' : 'invalide'
}

/**
 * What is wrong with a commune, field by field, in French; an empty object when nothing is.
 *
 * - Empty (nothing given): no error, a profile may have no zone yet.
 * - A commune has its name and its INSEE code, the one never without the other, and the code is
 *   well formed (`departmentOfInseeCode`). Its name never looks like an address
 *   (`looksLikeAnAddress`), and holds only the characters of a name (`hasNameCharacters`).
 * - Its coordinates are optional; given, they come together, in their bounds, with a commune.
 *
 * The département is not checked: the server computes it from the code, whatever was sent.
 */
export function cityErrors(commune: CityInput | null | undefined): CityErrors {
	const { name: cityName, inseeCode: codeInsee, latitude, longitude } = commune ?? {}
	const errors: CityErrors = {}

	if (!empty(codeInsee) && departmentOfInseeCode(codeInsee) === null) errors.inseeCode = ZONE_MESSAGES.codeInseeMalForme
	else if (empty(codeInsee) && !empty(cityName)) errors.inseeCode = ZONE_MESSAGES.communeSansCodeInsee

	if (!empty(cityName) && (typeof cityName !== 'string' || cityName.trim().length > CITY_NAME_MAX))
		errors.name = ZONE_MESSAGES.nomInvalide
	else if (typeof cityName === 'string' && looksLikeAnAddress(cityName)) errors.name = ZONE_MESSAGES.nomAdresse
	else if (typeof cityName === 'string' && !hasNameCharacters(cityName)) errors.name = ZONE_MESSAGES.nomCaracteres
	else if (empty(cityName) && !empty(codeInsee)) errors.name = ZONE_MESSAGES.codeInseeSansNom

	const lat = coordinate(latitude, 90)
	const lng = coordinate(longitude, 180)
	if (lat === 'invalide') errors.latitude = ZONE_MESSAGES.latitude
	if (lng === 'invalide') errors.longitude = ZONE_MESSAGES.longitude
	if (lat === 'absente' && lng !== 'absente') errors.latitude = ZONE_MESSAGES.coordonneesIncompletes
	if (lng === 'absente' && lat !== 'absente') errors.longitude = ZONE_MESSAGES.coordonneesIncompletes
	if (lat === 'valide' && lng === 'valide' && empty(codeInsee) && empty(cityName))
		errors.latitude = ZONE_MESSAGES.coordonneesSansCommune

	return errors
}

// ---------------------------------------------------------------------------------------------
// A zone outside of France, and the postal codes of a commune (plans/PLAN-ZONES.md §3.2 to §3.4;
// ticket 258). Rules only: the collection (ticket 259) calls them, the space shows their messages.
// ---------------------------------------------------------------------------------------------

/** The most countries a zone names. */
export const COUNTRIES_MAX = 5

/** What the server answers, in French, to a zone outside of France or to postal codes it refuses. */
export const ABROAD_MESSAGES = {
	countriesTooMany: `${COUNTRIES_MAX} pays au plus.`,
	countriesUnknown: 'Un des pays n’est pas dans la liste : choisis-le dans la liste.',
	countriesDuplicate: 'Un même pays est choisi deux fois.',
	countriesFranceOnly: 'Choisis au moins un pays étranger : pour la France, écris ta commune.',
	countriesNotAList: 'Les pays se donnent en liste de codes, comme BE ou IT.',
	townWithoutCountry: 'Une ville à l’étranger va avec un pays étranger.',
	townSeveralCountries: 'Une ville ne va qu’avec un seul pays : retire-la, ou retire les autres pays.',
	townInvalid: `Le nom de la ville est un texte de ${CITY_NAME_MAX} caractères au plus.`,
	townAddress: 'Écris le nom de ta ville, pas ton adresse : elle ne s’enregistre jamais.',
	townCharacters:
		'Le nom d’une ville n’a que des lettres, des espaces, des traits d’union, des apostrophes et des parenthèses.',
	postalCodeInvalid: 'Un code postal a cinq chiffres, comme 74000.',
	postalCodeDuplicate: 'Un même code postal est donné deux fois.',
	postalCodesNotAList: 'Les codes postaux se donnent en liste.',
} as const

/**
 * Whether a text is a French postal code: five digits and nothing else, spaces ignored (« 62 149 »
 * is « 62149 »). The code of a commune (« 62200 ») and of a typed search read the same way.
 */
export function isPostalCode(text: unknown): boolean {
	return typeof text === 'string' && /^\d{5}$/.test(text.replace(/\s+/g, ''))
}

/** A postal code as the collection stores it: five digits, no space; anything else as it came. */
export function normalizedPostalCode(code: unknown): unknown {
	return isPostalCode(code) ? (code as string).replace(/\s+/g, '') : code
}

/**
 * The postal codes of a commune as the collection stores them: each written without spaces, then
 * sorted. A duplicate is kept, `postalCodesErrors` refuses it. Anything but a list stays as sent.
 */
export function normalizedPostalCodes(codes: unknown): unknown {
	if (!Array.isArray(codes)) return codes
	const normalized = codes.map(normalizedPostalCode)
	return normalized.every(code => typeof code === 'string') ? normalized.toSorted() : normalized
}

/** The countries of a zone as the collection stores them: each in capitals, without spaces around. */
export function normalizedCountries(countries: unknown): unknown {
	return Array.isArray(countries) ? countries.map(normalizedCountryCode) : countries
}

/** The foreign countries of a list of codes read as the collection reads them (capitals, known codes only). */
function foreignCountries(countries: unknown): string[] {
	const list = normalizedCountries(countries)
	return Array.isArray(list) ? list.filter((code): code is string => isCountryCode(code) && code !== FRANCE_CODE) : []
}

/**
 * What is wrong with the countries of a zone, in French; an empty list when nothing is.
 *
 * - Empty (nothing given): no error, a zone may be empty.
 * - 1 to 5 codes of the list (src/lib/countries.ts), each once, in capitals (a lower case code is
 *   written in capitals first), at least one foreign country: France alone is a commune.
 */
export function countriesErrors(countries: unknown): string[] {
	if (countries === null || countries === undefined) return []
	const list = normalizedCountries(countries)
	if (!Array.isArray(list)) return [ABROAD_MESSAGES.countriesNotAList]
	if (list.length === 0) return []
	const errors: string[] = []
	if (list.length > COUNTRIES_MAX) errors.push(ABROAD_MESSAGES.countriesTooMany)
	if (list.some(code => !isCountryCode(code))) errors.push(ABROAD_MESSAGES.countriesUnknown)
	if (new Set(list).size !== list.length) errors.push(ABROAD_MESSAGES.countriesDuplicate)
	if (errors.length === 0 && foreignCountries(list).length === 0) errors.push(ABROAD_MESSAGES.countriesFranceOnly)
	return errors
}

/**
 * What is wrong with the town of a zone outside of France, in French; an empty list when nothing is.
 *
 * - Empty: no error, the town is optional.
 * - Only next to one foreign country (`countries`, as sent): never alone, never with several
 *   countries, nor next to France.
 * - The rules of a name of commune: 70 characters at most, no digit nor type of street
 *   (`looksLikeAnAddress`), only the characters of a name (`hasNameCharacters`).
 */
export function townErrors(town: unknown, countries: unknown): string[] {
	if (empty(town)) return []
	const list = normalizedCountries(countries)
	const given = Array.isArray(list) ? list.length : 0
	const foreign = foreignCountries(countries)
	if (given > 1) return [ABROAD_MESSAGES.townSeveralCountries]
	if (foreign.length !== 1) return [ABROAD_MESSAGES.townWithoutCountry]
	if (typeof town !== 'string' || town.trim().length > CITY_NAME_MAX) return [ABROAD_MESSAGES.townInvalid]
	if (looksLikeAnAddress(town)) return [ABROAD_MESSAGES.townAddress]
	if (!hasNameCharacters(town)) return [ABROAD_MESSAGES.townCharacters]
	return []
}

/**
 * What is wrong with the postal codes of a commune, in French; an empty list when nothing is: five
 * digits each (`isPostalCode`, written without spaces and sorted first), no duplicate.
 */
export function postalCodesErrors(codes: unknown): string[] {
	if (codes === null || codes === undefined) return []
	const list = normalizedPostalCodes(codes)
	if (!Array.isArray(list)) return [ABROAD_MESSAGES.postalCodesNotAList]
	const errors: string[] = []
	if (list.some(code => !isPostalCode(code))) errors.push(ABROAD_MESSAGES.postalCodeInvalid)
	else if (new Set(list).size !== list.length) errors.push(ABROAD_MESSAGES.postalCodeDuplicate)
	return errors
}

// ---------------------------------------------------------------------------------------------
// The zone as a whole (ticket 259): its type, and what the server empties when it is saved.
// ---------------------------------------------------------------------------------------------

/** The two types of zone: a commune of the official list, or one to five countries (`PLAN-ZONES.md` §3.2). */
export const ZONE_KINDS = ['city', 'countries'] as const

export type ZoneKind = (typeof ZONE_KINDS)[number]

/** The zone type a profile has before anyone chooses one. */
export const INITIAL_ZONE_KIND: ZoneKind = 'city'

/** The reasons an import leaves a zone empty and the profile « to review » (`zoneReview.reason`). */
export const ZONE_REVIEW_REASONS = ['sharedPostalCode', 'homonyms', 'notFound', 'notACity'] as const

/** What the server answers, in French, to a zone that mixes the two types or names none. */
export const ZONE_KIND_MESSAGES = {
	mixed: 'Une zone est une commune ou des pays, pas les deux : enregistre l’une ou l’autre.',
	unknown: 'Choisis un type de zone : une commune ou des pays.',
} as const

const isZoneKind = (value: unknown): value is ZoneKind => (ZONE_KINDS as readonly unknown[]).includes(value)

/** The type of zone, or a message when the value is none of the two (empty is the default). */
export function zoneKindVerdict(value: unknown): true | string {
	return value === undefined || value === null || isZoneKind(value) ? true : ZONE_KIND_MESSAGES.unknown
}

/**
 * A commune as the collection reads it, with its postal codes: `cityToFields`, then the postal
 * codes the object gives, written without spaces and sorted, or none when it gives none: a commune
 * is sent whole, so the codes of the commune it replaces never stay next to it. Anything that is
 * not an object is left as `cityToFields` leaves it.
 */
export function cityWithPostalCodes(commune: unknown): unknown {
	const fields = cityToFields(commune)
	if (!plainObject(fields)) return fields
	const given = plainObject(commune) ? commune.postalCodes : undefined
	return { ...fields, postalCodes: given === undefined || given === null ? [] : normalizedPostalCodes(given) }
}

/** A list given, or a text typed: something is there. */
const listed = (value: unknown): boolean => (Array.isArray(value) ? value.length > 0 : !empty(value))

/** Whether the commune a request sends holds anything: a name, a code, coordinates or postal codes. */
function cityGiven(commune: unknown): boolean {
	if (commune === undefined || commune === null) return false
	if (!plainObject(commune)) return listed(commune)
	return [...CITY_FIELDS, 'postalCodes'].some(field => field !== 'department' && listed(commune[field]))
}

/**
 * Whether a zone holds anything once saved: a commune (its name or its code) or countries. The
 * server empties `zoneReview` as soon as it does.
 */
export function zoneFilled(zone: unknown): boolean {
	if (!plainObject(zone)) return false
	const cityFields = plainObject(zone.city) ? zone.city : {}
	return (
		!empty(cityFields.name) ||
		!empty(cityFields.inseeCode) ||
		(Array.isArray(zone.countries) && zone.countries.length > 0)
	)
}

/**
 * What the server writes on a zone so that it is saved whole, from what a request sends (before any
 * stored value is merged into it): the fields of the other type are emptied, never left from the
 * stored zone.
 *
 * - A commune given: the zone is a commune; countries and town are emptied.
 * - Countries or a town given: the zone is countries; the commune is emptied, and so is the town
 *   when countries are given without one.
 * - Both given, or a type that contradicts what is given: refused, as a message.
 * - Only a type given: the zone takes it and the fields of the other are emptied.
 * - Nothing about the zone given: null, nothing to write. A commune or countries sent empty stay
 *   as sent (they empty themselves) and do not change the type.
 */
export function zoneWrite(data: unknown): Record<string, unknown> | string | null {
	if (!plainObject(data)) return null
	const { zoneKind, city, countries, town } = data
	if (zoneKind === undefined && city === undefined && countries === undefined && town === undefined) return null
	if (zoneKindVerdict(zoneKind) !== true) return null
	const kind = zoneKind === undefined || zoneKind === null ? undefined : zoneKind
	const hasCity = cityGiven(city)
	const hasCountries = listed(countries) || listed(town)
	if (hasCity && hasCountries) return ZONE_KIND_MESSAGES.mixed
	if ((hasCity && kind === 'countries') || (hasCountries && kind === 'city')) return ZONE_KIND_MESSAGES.mixed
	const clearCity = { city: null }
	const clearCountries = { countries: [], town: null }
	if (hasCity) return { zoneKind: 'city', ...clearCountries }
	// Countries given without a town: the zone is whole, the town of the stored zone does not stay.
	if (hasCountries)
		return {
			zoneKind: 'countries',
			...clearCity,
			...(countries !== undefined && town === undefined ? { town: null } : {}),
		}
	if (kind === 'city') return { ...clearCountries }
	if (kind === 'countries') return { ...clearCity }
	return null
}
