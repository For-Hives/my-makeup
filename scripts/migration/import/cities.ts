/**
 * The city typed in a profile of the old site becomes a commune of the official list, with its
 * INSEE code (plan 01 §6.2 « Ville »; plan 03 SEO-24; docs/migration/SCHEMA.md §5.2; register,
 * `ville-en-commune`). All of France: the referential is geo.api.gouv.fr (./reference.ts).
 *
 * - The text typed is never copied into the profile: only the commune of the referential, its name,
 *   INSEE code, département and centre (rounded to about 1 km by the collection).
 * - The text is read by the rule of the old site that publishes a city (src/lib/profile/public-place.ts):
 *   the commune of « 74000 Annecy », of « Toulouse (31) », and of a postal address, never its street.
 *   A postal address is never imported: its commune is, and the profile is listed (`adresses`).
 * - The import asks the referential for the communes of that name and of the postal code typed,
 *   never for a street. A name that the referential gives once (in the département or with the
 *   postal code typed, when there is one) is the commune; a postal code alone that one commune
 *   holds too. A text that names several communes (« Saint-Julien »), none, or that is no commune at
 *   all (« France », « Paris, Lyon et Annecy ») leaves the zone empty, and the profile « à revoir »:
 *   it goes to the private list of review, with the communes it could be.
 * - A line of the table of decisions settles a profile « à revoir » (`communes`): the commune of its
 *   INSEE code, or none. A line that names a profile not « à revoir » is without effect.
 */

import { DEPARTMENTS } from '../../../src/lib/departments'
import { usableCity } from '../../../src/lib/profile/completeness'
import { publicPlace } from '../../../src/lib/profile/public-place'
import {
	CITY_NAME_MAX,
	departmentOfInseeCode,
	hasNameCharacters,
	looksLikeAnAddress,
	roundedCoordinate,
} from '../../../src/lib/profile/zone'
import type { Reference, ReferenceCity } from './reference'
import { ImportRefuse } from './target'

/** The commune a profile must hold, as the collection stores it (`profiles.city`). */
export interface ExpectedCity {
	name: string
	inseeCode: string
	department: string | null
	latitude: number | null
	longitude: number | null
}

/** What the import looks for in a city typed: a name, a postal code, a département. Never a street. */
export interface Search {
	/** The name of commune asked, in lower case, « St » written « saint ». */
	nom: string | null
	codePostal: string | null
	departement: string | null
	/** The text was read as a postal address. */
	adresse: boolean
}

/** Why a city is « à revoir ». */
export type ReasonToReview = 'homonymes' | 'introuvable' | 'pas-une-commune'

/** What a city typed gives. */
export type Resolution =
	| { genre: 'vide' }
	| { genre: 'commune'; commune: ReferenceCity; adresse: boolean }
	| {
			genre: 'a-revoir'
			motif: ReasonToReview
			candidats: ReferenceCity[]
			adresse: boolean
			recherche: Search
	  }

/** The words of a name that many people abbreviate: « St Julien », « Ste-Foy ». */
const ABBREVIATION_EXPANSIONS: Readonly<Record<string, string>> = {
	st: 'saint',
	'st.': 'saint',
	ste: 'sainte',
	'ste.': 'sainte',
}

/** « Paris 16e », « Lyon 3ème arrondissement »: the commune is the city. */
const DISTRICT = /\s+\d{1,2}\s*(?:er|e|eme|ème)(?:\s+arr(?:ondissement|\.)?)?$/i

/** A name with its abbreviated « Saint » written out: « St Julien » → « saint Julien ». */
const withoutAbbreviation = (nom: string): string =>
	nom
		.split(/(\s+|-)/)
		.map(mot => ABBREVIATION_EXPANSIONS[mot.toLowerCase()] ?? mot)
		.join('')

/** A name as it is compared with the referential's: no accent, no case, hyphens and apostrophes as spaces. */
export function comparableName(nom: string): string {
	return withoutAbbreviation(nom)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/œ/gi, 'oe')
		.replace(/æ/gi, 'ae')
		.toLowerCase()
		.replace(/[\s'’-]+/g, ' ')
		.trim()
}

/** A code of département in front of a place and nothing else: « 74 Annecy », « 2A Ajaccio ». */
const LEADING_DEPARTMENT = /^(\d{2}|2[AB]|97\d)\s+(\D+)$/i

/**
 * The city typed without a code of département in front of a place (« 74 Annecy » → « Annecy »),
 * and that code: the number is the département, not a street number, so the text is no postal
 * address, and the commune is looked for in that département only (« 12 Le Bourg » then finds a
 * Le Bourg of Aveyron or goes « à revoir », never one of another département). The old site reads
 * the number as dropped before a place (`publicPlace`: an address, with the place alone left); the
 * number goes here, before the city is read, only when that is all the text holds. Any other text
 * (« 74 et alentours », « 12 Les Marais, Annecy ») is kept as typed, without a département.
 */
export function extractLeadingDepartment(texte: string): { texte: string; departement: string | null } {
	const unchanged = { texte, departement: null }
	const found = LEADING_DEPARTMENT.exec(texte)
	const department = (found?.[1] ?? '').toUpperCase()
	if (!found || !Object.hasOwn(DEPARTMENTS, department)) return unchanged
	const rest = (found[2] ?? '').trim()
	if (/[,;:/|+()[\]]/.test(rest)) return unchanged
	const withNumber = publicPlace(texte)
	const withoutNumber = publicPlace(rest)
	return withNumber.adresse &&
		!withoutNumber.adresse &&
		comparableName(withNumber.commune) === comparableName(withoutNumber.commune)
		? { texte: rest, departement: department }
		: unchanged
}

/** The last postal code of a text: five digits alone. */
const CODE_POSTAL = /(?<!\d)\d{5}(?!\d)/g

/**
 * What the import looks for in a city typed, or `null` for an empty city. The name is the commune
 * the old site would publish (src/lib/profile/public-place.ts), and only when it can be the name of a
 * commune: letters, no more than six words, nothing that looks like an address, a list or a
 * sentence. A city that is not one for the old site (« France », « 74 ») gives no name.
 */
export function citySearch(ville: string | null): Search | null {
	const { texte: text, departement: leadingDepartment } = extractLeadingDepartment(ville?.trim() ?? '')
	if (text === '') return null
	const place = publicPlace(text)
	const postalCode = [...text.matchAll(CODE_POSTAL)].at(-1)?.[0] ?? null
	const name = withoutAbbreviation(place.commune.replace(DISTRICT, '')).replace(/\s+/g, ' ').trim()
	const searchable =
		usableCity(text) &&
		/\p{L}/u.test(name) &&
		name.length <= CITY_NAME_MAX &&
		name.split(' ').length <= 6 &&
		hasNameCharacters(name) &&
		!looksLikeAnAddress(name)
	return {
		nom: searchable ? name.toLowerCase() : null,
		codePostal: postalCode,
		departement: place.departement ?? leadingDepartment,
		adresse: place.adresse,
	}
}

const unique = (communes: readonly ReferenceCity[]): ReferenceCity[] =>
	communes.filter((commune, rang) => communes.findIndex(({ code }) => code === commune.code) === rang)

/** How many communes the review shows for a name the referential does not give as it is. */
const SUGGESTIONS = 5

/**
 * What a city typed gives, asking the referential for the communes of its name and of its postal
 * code (see the top of this file).
 */
export async function resolveCity(ville: string | null, referentiel: Reference): Promise<Resolution> {
	const search = citySearch(ville)
	if (!search) return { genre: 'vide' }
	const { nom: name, codePostal, departement: department, adresse: address } = search
	const toReview = (motif: ReasonToReview, candidats: ReferenceCity[]): Resolution => ({
		genre: 'a-revoir',
		motif,
		candidats: unique(candidats),
		adresse: address,
		recherche: search,
	})
	const cityRecord = (trouvee: ReferenceCity): Resolution => ({ genre: 'commune', commune: trouvee, adresse: address })

	const nameAnswers = name ? await referentiel.repondre({ genre: 'nom', valeur: name }) : []
	const matchesByName = name ? nameAnswers.filter(c => comparableName(c.nom) === comparableName(name)) : []
	const matchesByCode = codePostal ? await referentiel.repondre({ genre: 'codePostal', valeur: codePostal }) : []

	if (!name && !codePostal) return toReview('pas-une-commune', [])
	if (codePostal && !name) {
		const [sole] = matchesByCode
		if (sole && matchesByCode.length === 1) return cityRecord(sole)
		return toReview(matchesByCode.length > 1 ? 'homonymes' : 'introuvable', matchesByCode)
	}
	if (codePostal) {
		const crossed = matchesByName.filter(c => matchesByCode.some(({ code }) => code === c.code))
		const [sole] = crossed
		if (sole && crossed.length === 1) return cityRecord(sole)
		if (crossed.length > 1) return toReview('homonymes', crossed)
		// The name is no commune of today (a former commune, merged since), and one commune holds the postal code.
		const [soleCodeMatch] = matchesByCode
		if (matchesByName.length === 0 && soleCodeMatch && matchesByCode.length === 1) return cityRecord(soleCodeMatch)
		return toReview('introuvable', [...matchesByName, ...matchesByCode, ...nameAnswers.slice(0, SUGGESTIONS)])
	}
	const kept = department ? matchesByName.filter(c => c.departement === department) : matchesByName
	const [sole] = kept
	if (sole && kept.length === 1) return cityRecord(sole)
	if (kept.length > 1) return toReview('homonymes', kept)
	return toReview('introuvable', [...matchesByName, ...nameAnswers.slice(0, SUGGESTIONS)])
}

/** The commune of the referential as the profile stores it: the centre rounded to about 1 km. */
export function expectedCity(commune: ReferenceCity): ExpectedCity {
	const rounded = (valeur: number | null): number | null =>
		valeur === null ? null : (roundedCoordinate(valeur) as number)
	return {
		name: commune.nom,
		inseeCode: commune.code,
		department: departmentOfInseeCode(commune.code),
		latitude: rounded(commune.latitude),
		longitude: rounded(commune.longitude),
	}
}

/** A profile « à revoir », as the private list of review gives it: never the text typed. */
export interface CaseToReview {
	profil: number
	motif: ReasonToReview
	/** The text was read as a postal address: its street was never asked nor kept. */
	adresse: boolean
	/** What the import asked the referential. */
	recherche: Search
	/** The communes it could be, from the referential. */
	candidats: Pick<ReferenceCity, 'nom' | 'code' | 'departement' | 'codesPostaux'>[]
}

/** A line of the table of decisions for a profile « à revoir »: the commune of this INSEE code, or none. */
export interface CityDecision {
	profile: number
	inseeCode: string | null
}

/** What the communes of a run give, in numbers and identifiers. */
export interface CitiesSummary {
	/** Profiles taken whose city is not empty at the source. */
	filledCities: number
	/** Among them, the profiles that hold a commune. */
	attached: number
	/** `rattachees` out of `villesRenseignees`, in percent, to one decimal (plan 03 SEO-24; target 90 %). */
	part: number | null
	/** Profiles taken that are not entirely empty at the source. */
	nonEmptyProfiles: number
	/** Among them, the profiles that hold a commune. */
	nonEmptyProfilesWithCity: number
	/** Profiles « à revoir », by identifier: their zone stays empty. */
	toReview: number[]
	/** Profiles whose city was a postal address: its commune is taken, never its street. */
	addresses: number[]
	/** Profiles « à revoir » settled by a line of the table of decisions. */
	decided: number[]
}

export interface ProfileCities {
	/** For each profile taken, its commune, or `null`. */
	communes: Map<number, ExpectedCity | null>
	/** The private list of review: the profiles « à revoir », with what was asked and the communes they could be. */
	revue: CaseToReview[]
	bilan: CitiesSummary
	/** Lines of the table that name no profile « à revoir »: without effect. */
	sansObjet: number
}

/**
 * The commune of each profile taken, asked to the referential, and the lines of the table of
 * decisions applied to the profiles « à revoir ». A line that gives an INSEE code the referential
 * does not know stops the run before any write (`ImportRefuse`).
 */
export async function profileCities(
	profils: readonly { id: number; city: string | null; videALaSource: boolean }[],
	referentiel: Reference,
	decisions: readonly CityDecision[] = []
): Promise<ProfileCities> {
	const cities = new Map<number, ExpectedCity | null>()
	const toReview = new Map<number, Extract<Resolution, { genre: 'a-revoir' }>>()
	const addresses: number[] = []
	for (const { id, city } of [...profils].sort((a, b) => a.id - b.id)) {
		const resolution = await resolveCity(city, referentiel)
		if (resolution.genre !== 'vide' && resolution.adresse) addresses.push(id)
		if (resolution.genre === 'a-revoir') toReview.set(id, resolution)
		cities.set(id, resolution.genre === 'commune' ? expectedCity(resolution.commune) : null)
	}

	const decided: number[] = []
	let pointless = 0
	for (const { profile, inseeCode: codeInsee } of decisions) {
		const reviewCase = toReview.get(profile)
		if (!reviewCase) {
			pointless++
			continue
		}
		let chosen: ReferenceCity | undefined
		if (codeInsee !== null) {
			chosen =
				reviewCase.candidats.find(({ code }) => code === codeInsee) ??
				(await referentiel.repondre({ genre: 'code', valeur: codeInsee }))[0]
			if (!chosen)
				throw new ImportRefuse(
					`La table de décision donne au profil ${profile} une commune que le référentiel ne connaît pas (code INSEE ${codeInsee}) : rien n’est écrit.`
				)
		}
		cities.set(profile, chosen ? expectedCity(chosen) : null)
		toReview.delete(profile)
		decided.push(profile)
	}

	const filled = profils.filter(({ city }) => (city?.trim() ?? '') !== '')
	const attached = filled.filter(({ id }) => cities.get(id)).length
	const notEmpty = profils.filter(({ videALaSource }) => !videALaSource)
	return {
		communes: cities,
		revue: [...toReview.entries()].map(([profile, { motif, adresse: address, recherche: search, candidats }]) => ({
			profil: profile,
			motif,
			adresse: address,
			recherche: search,
			candidats: candidats.map(({ nom: name, code, departement: department, codesPostaux }) => ({
				nom: name,
				code,
				departement: department,
				codesPostaux,
			})),
		})),
		bilan: {
			filledCities: filled.length,
			attached: attached,
			part: filled.length === 0 ? null : Math.round((attached / filled.length) * 1000) / 10,
			nonEmptyProfiles: notEmpty.length,
			nonEmptyProfilesWithCity: notEmpty.filter(({ id }) => cities.get(id)).length,
			toReview: [...toReview.keys()],
			addresses: addresses,
			decided: decided.sort((a, b) => a - b),
		},
		sansObjet: pointless,
	}
}
