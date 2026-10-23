/**
 * The location of a makeup artist, as she edits it in her space (ticket 123; plan 01 §3.3 P7.4;
 * plan 02 U14, U15, U16): her commune, chosen in the official list, her radius of 0 to 200 km, and
 * « à domicile ». One set of rules, read by the form in the browser and by the server.
 *
 * - The commune is only ever a code of the official list (INSEE). The request holds no name and no
 *   coordinates, nor postal codes: the server takes them from the list (./city-reference.ts). A
 *   text typed freely is never a commune, an address least of all.
 * - A zone is one of two forms (ticket 266; PLAN-ZONES.md §3.4): a commune, or one to five
 *   countries with a town abroad when the country is alone. A request without `kind` is a commune.
 * - The radius is a whole number of kilometres, from `RADIUS_BOUNDS_KM.min` to `.max`, or empty.
 * - The bounds and the French messages are those of the collection (src/lib/profile/zone.ts): the
 *   same sentence under the field, whoever refuses.
 */

import { z } from 'zod'
import { zoneCountries } from '../format-zone'
import {
	ABROAD_MESSAGES,
	countriesErrors,
	departmentOfInseeCode,
	normalizedCountries,
	RADIUS_BOUNDS_KM,
	townErrors,
	ZONE_MESSAGES,
} from '../profile/zone'

/** What the card and the panel call a commune: « Annecy (74) » (plan 02 U16). Never « Annecy () ». */
export function cityLabel({ nom, departement }: { nom?: unknown; departement?: unknown }): string {
	const n = typeof nom === 'string' ? nom.trim() : ''
	const d = typeof departement === 'string' ? departement.trim() : ''
	if (n === '') return ''
	return d === '' ? n : `${n} (${d})`
}

/** A commune the list proposes: what the panel shows, and the code it sends back. */
export interface SuggestedCity {
	readonly codeInsee: string
	/** « Annecy (74) ». */
	readonly libelle: string
	/** « Annecy »: the name alone, for the sentence that says which commune a postal code chose. */
	readonly nom: string
}

/** The shortest and the longest text the search accepts. */
export const SEARCH_MIN = 2
export const SEARCH_MAX = 60

/** What a search answers to the panel. */
export type SearchResult =
	| {
			ok: true
			communes: SuggestedCity[]
			/** Why there is nothing to propose when the text itself is the reason. */
			motif?: 'adresse' | 'trop-court'
			/** The postal code that was searched, when the text typed was one (ticket 265). */
			codePostal?: string
	  }
	| { ok: false; message: string }

/** The message when the list of communes does not answer. */
export const CITIES_SERVICE_MESSAGE =
	'Le service qui donne la liste des communes ne répond pas pour le moment. Ta commune n’a pas été modifiée : réessaie dans un instant.'

export const CITY_TO_CHOOSE_MESSAGE = 'Choisis ta commune dans la liste qui s’affiche quand tu écris son nom.'

export const REFUSED_ADDRESS_MESSAGE = 'Écris le nom de ta commune, pas ton adresse : elle ne s’enregistre jamais.'

/** The two forms a zone takes in her space. */
export type ZoneFormKind = 'city' | 'countries'

/** The values of the section as the form and the card read them. */
export type LocationValues = {
	kind: ZoneFormKind
	/** The INSEE code of her commune, or '' when she has none yet (always '' for countries). */
	codeInsee: string
	/** « Annecy (74) », or '' without a commune. */
	libelle: string
	/** The ISO codes of her countries, in her order (always empty for a commune). */
	countries: string[]
	/** The town abroad, or '' (only next to a single foreign country). */
	town: string
	/** Whole kilometres, or null when she has not said. */
	rayonKm: number | null
	aDomicile: boolean
}

/** The zone of a stored profile as the form reads it: a commune, or countries (the rule of `formatZone`). */
export function locationValues(profile: {
	city?: { name?: unknown; inseeCode?: unknown; department?: unknown } | null
	radiusKm?: unknown
	homeService?: unknown
	zoneKind?: unknown
	countries?: unknown
	town?: unknown
}): LocationValues {
	const abroad = zoneCountries({ zoneKind: profile.zoneKind, countries: profile.countries, city: profile.city?.name })
	const common = {
		rayonKm: typeof profile.radiusKm === 'number' ? profile.radiusKm : null,
		aDomicile: profile.homeService === true,
	}
	if (abroad.length > 0)
		return {
			kind: 'countries',
			codeInsee: '',
			libelle: '',
			countries: abroad.map(({ code }) => code),
			town: typeof profile.town === 'string' ? profile.town.trim() : '',
			...common,
		}
	return {
		kind: 'city',
		codeInsee: typeof profile.city?.inseeCode === 'string' ? profile.city.inseeCode : '',
		libelle: cityLabel({ nom: profile.city?.name, departement: profile.city?.department }),
		countries: [],
		town: '',
		...common,
	}
}

const HOME_MESSAGE = 'Dis si tu te déplaces à domicile, oui ou non.'

const radiusSchema = z
	.number({ error: ZONE_MESSAGES.rayon })
	.int(ZONE_MESSAGES.rayon)
	.min(RADIUS_BOUNDS_KM.min, ZONE_MESSAGES.rayon)
	.max(RADIUS_BOUNDS_KM.max, ZONE_MESSAGES.rayon)
	.nullable()

/**
 * A commune: the code of a commune of the list, the radius and « à domicile », and no other key (a
 * name, coordinates, a département, postal codes, a reserved field refuse the whole request).
 * `kind` may be left out: a request without one is a commune, as it was before countries existed.
 */
const strictCitySchema = z.strictObject({
	kind: z.literal('city').optional(),
	codeInsee: z
		.string({ error: CITY_TO_CHOOSE_MESSAGE })
		.trim()
		.toUpperCase()
		.refine(code => departmentOfInseeCode(code) !== null, CITY_TO_CHOOSE_MESSAGE),
	rayonKm: radiusSchema,
	aDomicile: z.boolean({ error: HOME_MESSAGE }),
})

/** Countries: one to five codes of the embedded list, a town next to a single foreign one, the radius, « à domicile ». */
const strictCountriesSchema = z
	.strictObject({
		kind: z.literal('countries'),
		countries: z
			.array(z.string({ error: ABROAD_MESSAGES.countriesUnknown }), { error: ABROAD_MESSAGES.countriesNotAList })
			.min(1, ABROAD_MESSAGES.countriesFranceOnly)
			.transform(list => normalizedCountries(list) as string[])
			.superRefine((list, ctx) => {
				for (const message of countriesErrors(list)) ctx.addIssue({ code: 'custom', message })
			}),
		town: z
			.string({ error: ABROAD_MESSAGES.townInvalid })
			.nullable()
			.transform(text => (text === null || text.trim() === '' ? null : text.trim())),
		rayonKm: radiusSchema,
		aDomicile: z.boolean({ error: HOME_MESSAGE }),
	})
	.superRefine((zone, ctx) => {
		const [message] = townErrors(zone.town, zone.countries)
		if (message !== undefined) ctx.addIssue({ code: 'custom', message, path: ['town'] })
	})

export type CityLocationInput = z.infer<typeof strictCitySchema>
export type CountriesLocationInput = z.infer<typeof strictCountriesSchema>
/** What is sent: a commune (the code only, never a name), or countries and a town. */
export type LocationInput = CityLocationInput | CountriesLocationInput

const isCountriesRequest = (saisie: unknown): boolean =>
	typeof saisie === 'object' && saisie !== null && (saisie as { kind?: unknown }).kind === 'countries'

/**
 * What the server accepts: one of the two forms, chosen by `kind` (a missing `kind` is a commune).
 * A request that mixes the two (a code and countries), or that carries any other key, is refused
 * whole. The form is chosen here and not by a union, so that each refusal keeps the field it is
 * about and its French message.
 */
export const strictLocationSchema = {
	safeParse(saisie: unknown): z.ZodSafeParseResult<LocationInput> {
		return isCountriesRequest(saisie) ? strictCountriesSchema.safeParse(saisie) : strictCitySchema.safeParse(saisie)
	},
	parse(saisie: unknown): LocationInput {
		const result = this.safeParse(saisie)
		if (!result.success) throw result.error
		return result.data
	},
}

/** The fields that can be refused, for the messages under them. */
export const LOCATION_FIELDS = ['codeInsee', 'rayonKm', 'aDomicile', 'countries', 'town'] as const
export type LocationField = (typeof LOCATION_FIELDS)[number]

/** The message of each field that does not pass, the first one when a field has several. */
export function errorsByField(erreur: z.ZodError): Partial<Record<LocationField, string>> {
	const fields: Partial<Record<LocationField, string>> = {}
	for (const { path, message } of erreur.issues) {
		const field = LOCATION_FIELDS.find(nom => nom === path[0])
		if (field !== undefined && fields[field] === undefined) fields[field] = message
	}
	return fields
}

/** What the form checks of the radius she typed: nothing, or whole kilometres within the bounds. */
export const enteredRadiusSchema = z
	.string({ error: ZONE_MESSAGES.rayon })
	.trim()
	.refine(
		texte => texte === '' || (/^\d{1,3}$/.test(texte) && Number(texte) <= RADIUS_BOUNDS_KM.max),
		ZONE_MESSAGES.rayon
	)

/** The radius typed as the server takes it: whole kilometres, or null when empty. */
export function textRadius(texte: string): number | null {
	const clean = texte.trim()
	return clean === '' ? null : Number(clean)
}
