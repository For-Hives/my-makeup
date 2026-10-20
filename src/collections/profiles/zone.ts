import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook, Field, FieldHook } from 'payload'
import { ValidationError } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { neverAllowed, profileFieldAdminOrOwner } from '../../lib/access'
import {
	CITY_NAME_MAX,
	type CityErrors,
	type CityInput,
	cityErrors,
	cityVerdict,
	cityWithPostalCodes,
	countriesErrors,
	departmentOfInseeCode,
	INITIAL_ZONE_KIND,
	normalizedCountries,
	normalizedInseeCode,
	normalizedName,
	normalizedPostalCodes,
	postalCodesErrors,
	RADIUS_BOUNDS_KM,
	radiusVerdict,
	roundedCoordinate,
	townErrors,
	ZONE_REVIEW_REASONS,
	zoneFilled,
	zoneKindVerdict,
	zoneWrite,
} from '../../lib/profile/zone'

/**
 * The département of a commune, computed by the server from its INSEE code at every save, the
 * import's included: a value sent for it is replaced, so it is never out of step with the code. A
 * code that is not well formed gives null, and the check of the code refuses the save anyway.
 */
const departmentOfCode: FieldHook = ({ siblingData }) => departmentOfInseeCode((siblingData as CityInput).inseeCode)

/** The check of one field of the commune, which reads its sibling fields (src/lib/profile/zone.ts). */
const verdictOf =
	(champ: keyof CityErrors) =>
	(_valeur: unknown, { siblingData }: { siblingData: unknown }): true | string =>
		cityErrors(siblingData as CityInput)[champ] ?? true

/** The labels of the reasons of a review, in the admin panel. */
const REVIEW_LABELS: Record<(typeof ZONE_REVIEW_REASONS)[number], string> = {
	sharedPostalCode: 'Code postal partagé',
	homonyms: 'Communes du même nom',
	notFound: 'Commune introuvable',
	notACity: 'Ce n’est pas une zone',
}

/**
 * The zone of a profile (ticket 041; plan 01 §3.3 P7.4 and §6.2; docs/migration/SCHEMA.md,
 * §5.2 and §9): its commune, its radius and « à domicile ». No postal address: there is no field
 * for one. The rules and their French messages live in src/lib/profile/zone.ts.
 *
 * - `city`: a commune of the official list, with its name and its INSEE code, the one never
 *   without the other; the coordinates of its centre if known, rounded to about 1 km. It is sent
 *   whole: what a request leaves out of it is emptied, never taken from the stored one. Empty while
 *   the makeup artist has not chosen one; `null` empties it; a text alone (a city typed freely), an
 *   array, a name that looks like an address or holds other characters than a name's is refused.
 *   `department` is computed by the server from the code.
 * - `radiusKm`: a whole number of kilometres, from 0 to 200, or empty.
 * - `homeService`: empty while she has not said it (the old site does not know it).
 *
 * These fields carry no access rule of their own: whoever reads a profile reads its zone, and
 * whoever changes a profile changes its zone. The public reads it with the published profiles
 * (ticket 021): the commune, its INSEE code, its département and the coordinates of its centre,
 * to about 1 km, are public reference data, not personal data.
 */
export const zoneFields: Field[] = [
	{
		name: 'city',
		label: 'Commune',
		type: 'group',
		admin: {
			description: 'Une commune de la liste officielle, avec son code INSEE. Jamais une adresse.',
			condition: data => data?.zoneKind !== 'countries',
		},
		// Before its fields are read: Payload stops with a 500 on a group sent as `null`, and fills
		// what an object leaves out with the stored values.
		hooks: { beforeValidate: [({ value }) => cityWithPostalCodes(value)] },
		validate: cityVerdict,
		fields: [
			{
				name: 'name',
				label: 'Nom',
				type: 'text',
				maxLength: CITY_NAME_MAX,
				hooks: { beforeValidate: [({ value }) => normalizedName(value)] },
				validate: verdictOf('name'),
			},
			{
				name: 'inseeCode',
				label: 'Code INSEE',
				type: 'text',
				hooks: { beforeValidate: [({ value }) => normalizedInseeCode(value)] },
				validate: verdictOf('inseeCode'),
			},
			{
				name: 'department',
				label: 'Département',
				type: 'text',
				hooks: { beforeChange: [departmentOfCode] },
				admin: { readOnly: true, description: 'Calculé depuis le code INSEE.' },
			},
			// The centre of the commune, to about 1 km: never a point that locates a home.
			{
				name: 'latitude',
				label: 'Latitude',
				type: 'number',
				hooks: { beforeValidate: [({ value }) => roundedCoordinate(value)] },
				validate: verdictOf('latitude'),
			},
			{
				name: 'longitude',
				label: 'Longitude',
				type: 'number',
				hooks: { beforeValidate: [({ value }) => roundedCoordinate(value)] },
				validate: verdictOf('longitude'),
			},
			// The postal codes of the commune, given by the official list with it (ticket 259): sorted,
			// five digits each, none twice. Empty without a commune.
			{
				name: 'postalCodes',
				label: 'Codes postaux',
				type: 'text',
				hasMany: true,
				hooks: {
					beforeValidate: [({ value }) => normalizedPostalCodes(value)],
					// A commune with no postal code reads as before ticket 259: the group holds no empty list.
					afterRead: [({ value }) => (Array.isArray(value) && value.length === 0 ? undefined : value)],
				},
				validate: (value: unknown) => postalCodesErrors(value)[0] ?? true,
				admin: { description: 'Donnés par la liste officielle avec la commune.' },
			},
		],
	},
	{
		name: 'radiusKm',
		label: 'Rayon d’action (km)',
		type: 'number',
		min: RADIUS_BOUNDS_KM.min,
		max: RADIUS_BOUNDS_KM.max,
		admin: { step: 1 },
		validate: radiusVerdict,
	},
	{
		name: 'homeService',
		label: 'À domicile',
		type: 'checkbox',
		admin: { description: 'Se déplace chez la cliente. Vide tant que la maquilleuse ne l’a pas dit.' },
	},
	{
		name: 'zoneKind',
		label: 'Type de zone',
		type: 'select',
		defaultValue: INITIAL_ZONE_KIND,
		options: [
			{ label: 'Commune', value: 'city' },
			{ label: 'Pays', value: 'countries' },
		],
		validate: zoneKindVerdict,
		admin: {
			description:
				'Une zone est une commune de la liste officielle, ou un à cinq pays dont un étranger. Le serveur vide les champs de l’autre type.',
		},
	},
	// Countries and town: a zone outside of France (ticket 259; PLAN-ZONES.md §3.2). The codes are
	// those of the list of src/lib/countries.ts, in capitals.
	{
		name: 'countries',
		label: 'Pays',
		type: 'text',
		hasMany: true,
		hooks: { beforeValidate: [({ value }) => normalizedCountries(value)] },
		validate: (value: unknown) => countriesErrors(value)[0] ?? true,
		admin: {
			description: 'De un à cinq codes de pays (BE, IT…), dont un étranger : la France seule se dit par sa commune.',
			condition: data => data?.zoneKind === 'countries',
		},
	},
	{
		name: 'town',
		label: 'Ville à l’étranger',
		type: 'text',
		maxLength: CITY_NAME_MAX,
		hooks: { beforeValidate: [({ value }) => normalizedName(value)] },
		validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
			townErrors(value, (siblingData as { countries?: unknown }).countries)[0] ?? true,
		admin: {
			description: 'Facultative, et seulement quand un seul pays étranger est choisi. Jamais une adresse.',
			condition: data => data?.zoneKind === 'countries',
		},
	},
	// What the import could not decide about the zone (ticket 259): read by an admin and the owner,
	// written by no API, only by the import; emptied by the server as soon as a zone is saved.
	{
		name: 'zoneReview',
		label: 'Revue de la zone',
		type: 'group',
		access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
		admin: {
			readOnly: true,
			description:
				'Posée par l’import quand la zone n’a pas pu être reprise de l’ancien site. Vidée dès qu’une zone est enregistrée.',
		},
		fields: [
			{
				name: 'reason',
				label: 'Zone à revoir',
				type: 'select',
				options: ZONE_REVIEW_REASONS.map(reason => ({ label: REVIEW_LABELS[reason], value: reason })),
			},
			{ name: 'postalCode', label: 'Code postal cherché', type: 'text' },
			{
				name: 'candidates',
				label: 'Communes possibles',
				type: 'json',
				admin: { description: 'Code INSEE, nom et département de chaque commune possible.' },
			},
		],
	},
]

/**
 * Before a profile is created or changed: the zone is saved whole. The server writes the type the
 * request names or implies and empties the fields of the other, so the stored zone never keeps a
 * commune next to countries; a request that fills both is refused in French. It reads the request
 * as it was sent (`beforeOperation`): later, Payload has merged the stored values into it.
 */
export const wholeZone: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	if (operation !== 'create' && operation !== 'update') return args
	const data = (args as { data?: Record<string, unknown> }).data
	const written = zoneWrite(data)
	if (typeof written === 'string')
		throw new ValidationError({ collection: 'profiles', errors: [{ message: written, path: 'zoneKind' }], req })
	return written === null ? args : { ...args, data: { ...data, ...written } }
}

/** The review of the zone is emptied by the server at every save of a zone that holds something. */
export const clearZoneReview: CollectionBeforeChangeHook = ({ data }) =>
	zoneFilled(data) ? { ...data, zoneReview: { reason: null, postalCode: null, candidates: null } } : data
