/**
 * The location of a makeup artist, as she edits it in her space (ticket 123; plan 01 §3.3 P7.4;
 * plan 02 U14, U15, U16): her commune, chosen in the official list, her radius of 0 to 200 km, and
 * « à domicile ». One set of rules, read by the form in the browser and by the server.
 *
 * - The commune is only ever a code of the official list (INSEE). The request holds no name and no
 *   coordinates: the server takes them from the list (./referentiel-communes.ts). A text typed
 *   freely is never a commune, an address least of all.
 * - The radius is a whole number of kilometres, from `RADIUS_BOUNDS_KM.min` to `.max`, or empty.
 * - The bounds and the French messages are those of the collection (src/lib/profile/zone.ts): the
 *   same sentence under the field, whoever refuses.
 */

import { z } from 'zod'
import { departmentOfInseeCode, RADIUS_BOUNDS_KM, ZONE_MESSAGES } from '../profile/zone'

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
	  }
	| { ok: false; message: string }

/** The message when the list of communes does not answer. */
export const CITIES_SERVICE_MESSAGE =
	'Le service qui donne la liste des communes ne répond pas pour le moment. Ta commune n’a pas été modifiée : réessaie dans un instant.'

export const CITY_TO_CHOOSE_MESSAGE = 'Choisis ta commune dans la liste qui s’affiche quand tu écris son nom.'

export const REFUSED_ADDRESS_MESSAGE = 'Écris le nom de ta commune, pas ton adresse : elle ne s’enregistre jamais.'

/** The three values of the section as the form and the card read them. */
export type LocationValues = {
	/** The INSEE code of her commune, or '' when she has none yet. */
	codeInsee: string
	/** « Annecy (74) », or '' without a commune. */
	libelle: string
	/** Whole kilometres, or null when she has not said. */
	rayonKm: number | null
	aDomicile: boolean
}

const HOME_MESSAGE = 'Dis si tu te déplaces à domicile, oui ou non.'

/**
 * What the server accepts: the code of a commune of the list, the radius and « à domicile », and
 * no other key (a name, coordinates, a département, a reserved field refuse the whole request).
 */
export const strictLocationSchema = z.strictObject({
	codeInsee: z
		.string({ error: CITY_TO_CHOOSE_MESSAGE })
		.trim()
		.toUpperCase()
		.refine(code => departmentOfInseeCode(code) !== null, CITY_TO_CHOOSE_MESSAGE),
	rayonKm: z
		.number({ error: ZONE_MESSAGES.rayon })
		.int(ZONE_MESSAGES.rayon)
		.min(RADIUS_BOUNDS_KM.min, ZONE_MESSAGES.rayon)
		.max(RADIUS_BOUNDS_KM.max, ZONE_MESSAGES.rayon)
		.nullable(),
	aDomicile: z.boolean({ error: HOME_MESSAGE }),
})
export type LocationInput = z.infer<typeof strictLocationSchema>

/** The fields that can be refused, for the messages under them. */
export const LOCATION_FIELDS = ['codeInsee', 'rayonKm', 'aDomicile'] as const
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
