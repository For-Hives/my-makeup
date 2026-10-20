/**
 * The place of a profile as it may be published (plans/01 §6.2): the commune, with its département
 * when a postal code was typed (« Annecy (74) »), never a street number nor a street.
 *
 * Ported as is from src/lib/profil/lieu-public.js of the old site (branch main): the same field
 * gives the same public place. On the old site the city is free text, and a few artists typed
 * their postal address there. The rule of a profile (completude.ts) reads a city through this
 * file, so that such a profile counts by its commune, as on the old site.
 *
 * Read as an address:
 * - a field with a type of street or a part of an address (rue, avenue,
 *   place, lieu-dit, BP, ZA…), even glued to a separator or a number
 *   (« Annecy,rue X », « Annecy.rue X », « 12rue X », « Annecy-rue X »);
 * - a number at the start and a postal code further (« 12 Les Marais 74000
 *   Annecy »), or a place after a comma (« 12 Les Marais, Annecy »);
 * - two words or more, a postal code and a place (« Le Bourg 74300 Cluses »,
 *   « Les Vignes, 74200 Thonon »), unless they say how far (« Toute la
 *   Haute-Savoie, 74000 Annecy »).
 * Then:
 * - with a postal code: the commune after it, else the place before it when
 *   it holds no street nor number (« …, Annecy 74000 », « …, Annecy,
 *   74000 »), else the postal code alone (« 12 Les Marais 74000 »);
 * - without a postal code: the last part after a comma when it holds no
 *   street (« 12 rue X, Annecy »); without a comma the commune cannot be
 *   told from the end of the street (« rue Victor Hugo »), so only a
 *   compound name is taken (« 3 place Z Thonon-les-Bains »), else nothing.
 *
 * A number at the start followed by a place alone (« 74 Annecy », « 12 Le
 * Bourg ») may be a département or a street number: the place is published
 * without the number, and with it only when the place is the name of that
 * département (« 74 Haute-Savoie » → « Haute-Savoie (74) »). A number
 * followed by free text is no street number (« 74 et alentours », « 3
 * villes : … »): shown as typed.
 *
 * Any other field is shown as typed (« Paris, Lyon et Annecy », « Toute la
 * France »), except one place with its postal code (« Annecy 74000 »),
 * written « Annecy (74) ». CEDEX and a final « France » are dropped, and
 * from an address a final foreign country too. A commune typed in capitals
 * or in lower case is written as a name. publicPlace(publicPlace(x).texte)
 * gives the same place: the public page reads it again from its props.
 */

// Relative imports on purpose: read by the completeness rule, which the collection `profils` calls.
import { DEPARTMENTS, departmentOfPostalCode, normalizePlace } from '../departments'
import { villeAffichee } from '../format-zone'

/** Types of street and parts of an address (lower case, no accents) */
const STREETS = new Set([
	'rue',
	'ruelle',
	'avenue',
	'av',
	'ave',
	'bd',
	'bld',
	'blvd',
	'boulevard',
	'chemin',
	'allee',
	'impasse',
	'imp',
	'route',
	'rte',
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
	'fbg',
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
	'zae',
	'zi',
	'bp',
	'cs',
	'tsa',
	'batiment',
	'bat',
	'appartement',
	'appt',
	'etage',
	'escalier',
])

/** Small words written in lower case inside a name (Thonon-les-Bains) */
const PARTICLES = new Set([
	'le',
	'la',
	'les',
	'l',
	'de',
	'du',
	'des',
	'd',
	'en',
	'sur',
	'sous',
	'lez',
	'aux',
	'au',
	'et',
	'a',
])
const ARTICLES = new Set(['le', 'la', 'les'])
const HOLY_NAME_PREFIXES = new Set(['saint', 'sainte', 'st', 'ste'])

/** Titles inside a name of street (« avenue du Général Charles-de-Gaulle ») */
const TITLES = new Set([
	'general',
	'gal',
	'marechal',
	'president',
	'docteur',
	'dr',
	'abbe',
	'colonel',
	'commandant',
	'capitaine',
	'lieutenant',
	'professeur',
	'pasteur',
	'amiral',
	'cardinal',
])

/** Words that say how far, not where (« 74 et alentours », « 74 partout ») */
const NOT_A_PLACE = new Set([
	'partout',
	'alentours',
	'alentour',
	'environs',
	'autour',
	'toute',
	'tout',
	'tous',
	'toutes',
	'france',
	'region',
	'departement',
	'departements',
	'secteur',
	'secteurs',
	'ville',
	'villes',
	'km',
	'kms',
	'deplacement',
	'deplacements',
	'domicile',
	'rayon',
])

// a street number at the start: « 12 », « 12, », « 12bis », « 3 B »; also
// a code of département (« 74 », « 2A »)
const LEADING_NUMBER = /^\d{1,4}(?:\s?(?:bis|ter|quater|[a-d]))?(?=[\s,]|$)/i
const POSTAL_CODES = /(?<!\d)\d{5}(?!\d)/g
// « 74 000 » written with a space, before a place or at the end, not before
// a unit (« 74 100 km »)
const POSTAL_CODE_SPACE =
	/(?<!\d)(\d{2}) (\d{3})(?!\d)(?!\s*(?:(?:kms?|kilom\w*|km\/h|m|min|minutes?|h|heures?|euros?|ans?|personnes?|clientes?)\b|[€%]))/giu
// what parts a text into pieces (« Annecy, rue X »), glued or not
// (« Annecy,rue X », « Annecy.rue X »); not the hyphen of a name
// (Cours-la-Ville) nor the apostrophe (L'Isle-d'Abeau)
const SEGMENT_SEPARATORS = /[,;:/|+()[\]]/
const WORD_SEPARATORS = /[\s.]+/
// a foreign postal code before the town (« 1000 Bruxelles », « L-1234 »)
const FOREIGN_CODE = /^(?:[a-z]{1,2}-)?\d{4}\s+/i
const MAIL_SORT_SUFFIX = /\bcedex(?:\s*\d{1,2})?\b/gi
const COUNTRY_AT_END = /(?:[\s,;/–-]*\bfrance\b\.?)+\s*$/i
const COUNTRY_AFTER_SEPARATOR = /(?:\s*[,;/–-]\s*france\.?)+\s*$/i
// at the end of an address only: the town comes before (Luxembourg and
// Monaco are towns too, they stay)
const FOREIGN_COUNTRY_AT_END = /(?:[\s,;/–-]*\b(?:suisse|belgique|allemagne|italie|espagne)\b\.?)+\s*$/i
// several places or a sentence, not one place; the parts of an address
const SEPARATORS = /[,;:/|+()[\]]|\s[-–—]\s/
// what a « Commune (74) » already written holds
const CITY_DEPARTMENT = /^(.+?) \((\d{2}|2A|2B|97\d)\)$/

/** A word as compared: lower case, no accents, no final punctuation. */
const normalizeWord = (mot: string): string =>
	mot
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/^[(]+|[.,;:)]+$/g, '')

const words = (texte: string): string[] => texte.split(/\s+/).filter(Boolean)
const isStreet = (mot: string): boolean => STREETS.has(normalizeWord(mot))

/**
 * The words of each piece of a text, whatever glues them: a separator
 * (« Annecy,rue », « Annecy.rue », « Annecy;rue »), a digit (« 12rue »).
 */
const wordsPerSegment = (texte: string): string[][] =>
	texte
		.replace(/(\d)(?=\p{L})/gu, '$1 ')
		.split(SEGMENT_SEPARATORS)
		.map(segment => segment.split(WORD_SEPARATORS).filter(Boolean))
		.filter(liste => liste.length > 0)

/**
 * Whether a word of a piece is the type of a street: it comes before the
 * name or the number of the street, so not alone nor before a postal code
 * (Rue, Cours, Le Passage, « La Chaussée 76590 » are communes). Alone, after
 * the elision of « la » (« l'avenue »), or glued by a hyphen at the end of
 * a word (« Annecy-rue des X », « 9-lieu-dit X »), unlike the name of a
 * commune (Cours-la-Ville, Cosne-Cours-sur-Loire, Fontaine-la-Chaussée).
 * `liste` holds the words of one piece.
 */
function streetWord(liste: readonly string[], i: number): boolean {
	const word = liste[i]
	const next = liste[i + 1]
	if (word === undefined || next === undefined || /^\d{5}$/.test(next)) return false
	const street = (m: string): boolean => isStreet(m.replace(/^l['’]/i, ''))
	if (street(word)) return true
	if (!/\p{L}/u.test(next)) return false
	const parts = word.split('-')
	const end = parts.length - 1
	const lastPart = parts[end] ?? ''
	return (end > 0 && street(lastPart)) || (end > 1 && street(`${parts[end - 1]}-${lastPart}`))
}

const hasStreet = (texte: string): boolean =>
	wordsPerSegment(texte).some(liste => liste.some((_, i) => streetWord(liste, i)))
const trimmed = (texte: string): string => texte.replace(/^[\s,;:./–-]+|[\s,;:/–-]+$/g, '').replace(/\s+/g, ' ')
const withoutCountry = (texte: string): string => texte.replace(FOREIGN_COUNTRY_AT_END, '').replace(COUNTRY_AT_END, '')

interface FoundPostalCode {
	readonly code: string
	readonly index: number
}

/** The last postal code of a text, the one before the commune */
function lastPostalCode(texte: string): FoundPostalCode | null {
	const codes = [...texte.matchAll(POSTAL_CODES)]
	const cp = codes.at(-1)
	return cp ? { code: cp[0], index: cp.index } : null
}

/** Name of the département of a code, as compared */
function departmentName(code: string): string | null {
	const name = DEPARTMENTS[code]
	return name ? normalizePlace(name) : null
}

// « ANNECY-LE-VIEUX » → « Annecy-le-Vieux », « l'isle-d'abeau » →
// « L'Isle-d'Abeau »: only for a name typed all in capitals or in lower case
function properName(nom: string): string {
	if (nom !== nom.toUpperCase() && nom !== nom.toLowerCase()) return nom
	let first = true
	return nom
		.toLowerCase()
		.split(/([\s-]+)/)
		.map(partie => {
			if (/^[\s-]+$/.test(partie)) return partie
			const result = partie
				.split(/(['’])/)
				.map((morceau, i, morceaux) => {
					if (morceau === '' || /^['’]$/.test(morceau)) return morceau
					const elision = morceaux[i + 1] !== undefined
					const start = first
					first = false
					if (!start && (elision || PARTICLES.has(normalizeWord(morceau)))) return morceau
					return morceau.charAt(0).toUpperCase() + morceau.slice(1)
				})
				.join('')
			return result
		})
		.join('')
}

/** A place without street nor number (letters, no digit, no type of street): its name, or ''. */
function placeName(texte: string): string {
	const t = trimmed(texte.replace(MAIL_SORT_SUFFIX, ' '))
	if (!/\p{L}/u.test(t) || /\d/.test(t) || hasStreet(t)) return ''
	if (normalizeWord(t) === 'france') return ''
	return properName(t)
}

/** A word that says how far, not where (« et alentours », « toute ») */
const hasDistanceWord = (liste: readonly string[]): boolean => liste.some(mot => NOT_A_PLACE.has(normalizeWord(mot)))

/**
 * One place written alone (« Annecy », « La Roche sur Foron »,
 * « Haute-Savoie »), not a list, a sentence nor a distance (« et
 * alentours », « partout », « villes : … »).
 */
function isPlace(texte: string): boolean {
	if (!/\p{L}/u.test(texte) || /\d/.test(texte) || SEPARATORS.test(texte)) return false
	const list = words(texte)
	if (list.length > 4) return false
	const first = normalizeWord(list[0] ?? '')
	if (PARTICLES.has(first) && !ARTICLES.has(first)) return false
	return !(hasStreet(texte) || hasDistanceWord(list))
}

/**
 * « 12 Les Marais, Annecy », « 12 bis, Les Marais, Annecy »: a number, words,
 * then a place after a comma; not « 74, Haute-Savoie » (a département and
 * its name), « 74 et alentours, Annecy » nor « 3 villes : Annecy, Thonon ».
 * `t` comes without CEDEX nor country.
 */
function numberThenPlace(t: string): boolean {
	const number = LEADING_NUMBER.exec(t)
	if (!number || /[:/|+()[\]]/.test(t) || hasDistanceWord(words(t))) return false
	const parts = t.slice(number[0].length).split(/[,;]/).map(trimmed)
	const filled = parts.filter(Boolean)
	return parts.length >= 2 && (parts[0] !== '' || filled.length >= 2) && isPlace(filled.at(-1) ?? '')
}

/** Whether the field is a postal address (see the top of this file). */
function isAddress(brut: string): boolean {
	if (hasStreet(brut)) return true
	const t = withoutCountry(brut.replace(MAIL_SORT_SUFFIX, ' '))
	const cp = lastPostalCode(t)
	if (!cp) return numberThenPlace(t)
	const before = t.slice(0, cp.index)
	// « 12 Les Marais 74000 Annecy », not « 3 villes : Annecy 74000, … »
	if (LEADING_NUMBER.test(t)) return !/[:;/|+()[\]]/.test(before)
	// « Le Bourg 74300 Cluses », « Les Vignes, 74200 Thonon », not « Annecy
	// 74000 », « Thonon les Bains 74200 » nor « Toute la Haute-Savoie, 74000
	// Annecy »
	const after = t.slice(cp.index + 5).split(/[,;/]/)[0] ?? ''
	const placeBefore = words(trimmed(before).split(/[,;]/).at(-1) ?? '')
	return placeBefore.length >= 2 && !hasDistanceWord(placeBefore) && isPlace(trimmed(after))
}

/**
 * The commune at the end of a street without a comma nor a postal code
 * (« 3 place Z Thonon-les-Bains »): only a compound name with a small word
 * inside (Thonon-les-Bains, Annecy-le-Vieux, Saint-Julien-en-Genevois), or
 * after Le, La or Les (Le Grand-Bornand), so that the end of a street (rue
 * Victor Hugo, rue Joliot-Curie, avenue du Général Charles-de-Gaulle, avenue
 * des Essais d'Annecy-le-Vieux) is never taken for a commune.
 */
function cityAfterStreet(texte: string): string {
	const list = wordsPerSegment(texte).flat()
	let lastStreet = -1
	for (const i of list.keys()) {
		if (streetWord(list, i)) lastStreet = i
	}
	if (lastStreet < 0) return ''
	const rest = list.slice(lastStreet + 1)
	if (rest.length < 2) return ''
	const last = rest.at(-1) ?? ''
	const beforeLast = rest.at(-2) ?? ''
	if (/\d/.test(last) || !last.includes('-')) return ''
	// « avenue des Îles d'Annecy-le-Vieux »: the end of the street
	if (/^d['’]/i.test(last)) return ''
	const before = normalizeWord(beforeLast)
	if (TITLES.has(before)) return ''
	if (ARTICLES.has(before) && rest.length >= 3 && !PARTICLES.has(normalizeWord(rest.at(-3) ?? '')))
		return placeName(`${beforeLast} ${last}`)
	if (PARTICLES.has(before)) return ''
	// the small word second (Thonon-les-Bains), or third after Saint
	// (Saint-Julien-en-Genevois): « rue X Hugo-Thonon-les-Bains » is no
	// commune
	const parts = last.split('-').map(normalizeWord)
	const small = parts.findIndex((p, k) => k > 0 && k < parts.length - 1 && PARTICLES.has(p))
	const compose = small === 1 || (small === 2 && HOLY_NAME_PREFIXES.has(parts[0] ?? ''))
	return compose ? placeName(last) : ''
}

interface AddressCity {
	readonly commune: string
	readonly codePostal: string
}

/** The commune of a postal address (see the top of this file). */
function addressCity(adresse: string): AddressCity {
	const t = withoutCountry(adresse.replace(MAIL_SORT_SUFFIX, ' '))
	const cp = lastPostalCode(t)
	if (cp) return cityWithPostalCode(t, cp)
	// « 12 rue X, Annecy », « 12 rue X / Annecy », « 12 rue X (Annecy) »
	const parts = t
		.split(SEPARATORS)
		.map(p => p.trim())
		.filter(Boolean)
	// « 1000 Bruxelles »: the town without its foreign postal code
	const lastPart = (parts.at(-1) ?? '').replace(FOREIGN_CODE, '')
	if (parts.length >= 2)
		return {
			commune: placeName(lastPart) || cityAfterStreet(lastPart),
			codePostal: '',
		}
	return { commune: cityAfterStreet(lastPart), codePostal: '' }
}

export interface PublicPlace {
	/** What is shown: « Annecy (74) », « Annecy », « 74000 », « Paris, Lyon et Annecy », or '' when nothing can be shown */
	readonly texte: string
	/** The commune alone when it is known (for the JSON-LD), else the text */
	readonly commune: string
	/** '74', '2A', '974' or null */
	readonly departement: string | null
	/** The field was read as a postal address, or a number was dropped before a place */
	readonly adresse: boolean
}

const NONE: PublicPlace = { texte: '', commune: '', departement: null, adresse: false }

/** The public place of a city field, as typed in the profile or already public. */
export function publicPlace(city: unknown): PublicPlace {
	const raw = villeAffichee(city).replace(POSTAL_CODE_SPACE, '$1$2')
	if (!raw) return NONE

	if (isAddress(raw)) return addressPlace(raw)

	const t = trimmed(raw.replace(MAIL_SORT_SUFFIX, ' ').replace(COUNTRY_AFTER_SEPARATOR, ''))
	if (!t) return NONE

	// a number then one place: « 74 Annecy », « 12 Le Bourg », « 74
	// Haute-Savoie »; never the number, unless it is the département named
	const withNumber = placeWithNumber(t)
	if (withNumber) return withNumber

	const already = CITY_DEPARTMENT.exec(t)
	if (already) return { texte: t, commune: already[1] ?? '', departement: already[2] ?? null, adresse: false }
	// one place and its postal code: « 74000 Annecy », « Annecy 74000 »,
	// « Annecy (74000) »
	const extracted = placeWithPostalCode(t)
	if (extracted) return extracted
	const cp = lastPostalCode(t)
	return {
		texte: t,
		commune: t,
		departement: cp ? departmentOfPostalCode(cp.code) : null,
		adresse: false,
	}
}

/**
 * The city as it may be published: « Annecy (74) » for « 12 rue X 74000
 * Annecy », never the number nor the street; '' when nothing can be shown.
 */
export const publicCity = (city: unknown): string => publicPlace(city).texte

function cityWithPostalCode(t: string, cp: FoundPostalCode): AddressCity {
	// after the postal code, in the first piece that is not empty
	// (« …, 74000, Annecy »), up to a digit or a street, glued or not
	// (« 74000 Annecy.rue X »)
	const after: string[] = []
	const [list = []] = wordsPerSegment(
		t
			.slice(cp.index + 5)
			.split(/[,;/]/)
			.find(morceau => morceau.trim()) ?? ''
	)
	for (const [i, word] of list.entries()) {
		if (/\d/.test(word) || streetWord(list, i)) break
		after.push(word)
	}
	let city = placeName(after.join(' '))
	// « …, 74160 Haute-Savoie »: a département is no commune (Paris is
	// both)
	const department = departmentOfPostalCode(cp.code)
	if (city && department && department !== '75' && normalizePlace(city) === departmentName(department)) city = ''
	if (!city) {
		const chunks = t.slice(0, cp.index).split(/[,;]/)
		const before = chunks.at(-1) ?? ''
		// « 12 rue X, Annecy, 74000 »: the piece before when the last one is
		// empty; « 12 Les Marais 74000 »: a number then words are a street
		const chunk = before.trim() ? before : (chunks.slice(0, -1).findLast(m => m.trim()) ?? '')
		city = (/\d/.test(chunk) ? '' : placeName(chunk)) || cityAfterStreet(chunk)
	}
	return { commune: city, codePostal: cp.code }
}

function addressPlace(brut: string): PublicPlace {
	const { commune: city, codePostal } = addressCity(brut)
	const department = codePostal ? departmentOfPostalCode(codePostal) : null
	let text = ''
	if (city) text = department ? `${city} (${department})` : city
	else if (department) text = codePostal
	return { texte: text, commune: city || text, departement: department, adresse: true }
}

function placeWithNumber(t: string): PublicPlace | null {
	const number = LEADING_NUMBER.exec(t)
	if (number) {
		const place = trimmed(t.slice(number[0].length))
		if (isPlace(place)) {
			const name = placeName(place)
			const code = number[0].replace(/\s/g, '').toUpperCase()
			if (departmentName(code) === normalizePlace(place))
				return {
					texte: `${name} (${code})`,
					commune: name,
					departement: code,
					adresse: false,
				}
			return { texte: name, commune: name, departement: null, adresse: true }
		}
	}
	return null
}

function placeWithPostalCode(t: string): PublicPlace | null {
	const withCode = /^(\d{5})[\s,–-]+([^\d,;/()]+)$/.exec(t) ?? /^([^\d,;/()]+?)[\s,–-]+\(?(\d{5})\)?$/.exec(t)
	if (withCode) {
		const [, first = '', second = ''] = withCode
		const [codePostal, name] = /^\d/.test(first) ? [first, second] : [second, first]
		const city = placeName(name)
		const department = departmentOfPostalCode(codePostal)
		if (city)
			return {
				texte: department ? `${city} (${department})` : city,
				commune: city,
				departement: department,
				adresse: false,
			}
	}
	return null
}
