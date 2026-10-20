import type { Field, FieldHook } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	CITY_NAME_MAX,
	type CityErrors,
	type CityInput,
	cityErrors,
	cityToFields,
	cityVerdict,
	departmentOfInseeCode,
	normalizedInseeCode,
	normalizedName,
	RADIUS_BOUNDS_KM,
	radiusVerdict,
	roundedCoordinate,
} from '../../lib/profile/zone'

/**
 * The département of a commune, computed by the server from its INSEE code at every save, the
 * import's included: a value sent for it is replaced, so it is never out of step with the code. A
 * code that is not well formed gives null, and the check of the code refuses the save anyway.
 */
const departementDuCode: FieldHook = ({ siblingData }) => departmentOfInseeCode((siblingData as CityInput).inseeCode)

/** The check of one field of the commune, which reads its sibling fields (src/lib/profile/zone.ts). */
const verdictDe =
	(champ: keyof CityErrors) =>
	(_valeur: unknown, { siblingData }: { siblingData: unknown }): true | string =>
		cityErrors(siblingData as CityInput)[champ] ?? true

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
export const champsDeLaZone: Field[] = [
	{
		name: 'city',
		label: 'Commune',
		type: 'group',
		admin: { description: 'Une commune de la liste officielle, avec son code INSEE. Jamais une adresse.' },
		// Before its fields are read: Payload stops with a 500 on a group sent as `null`, and fills
		// what an object leaves out with the stored values.
		hooks: { beforeValidate: [({ value }) => cityToFields(value)] },
		validate: cityVerdict,
		fields: [
			{
				name: 'name',
				label: 'Nom',
				type: 'text',
				maxLength: CITY_NAME_MAX,
				hooks: { beforeValidate: [({ value }) => normalizedName(value)] },
				validate: verdictDe('name'),
			},
			{
				name: 'inseeCode',
				label: 'Code INSEE',
				type: 'text',
				hooks: { beforeValidate: [({ value }) => normalizedInseeCode(value)] },
				validate: verdictDe('inseeCode'),
			},
			{
				name: 'department',
				label: 'Département',
				type: 'text',
				hooks: { beforeChange: [departementDuCode] },
				admin: { readOnly: true, description: 'Calculé depuis le code INSEE.' },
			},
			// The centre of the commune, to about 1 km: never a point that locates a home.
			{
				name: 'latitude',
				label: 'Latitude',
				type: 'number',
				hooks: { beforeValidate: [({ value }) => roundedCoordinate(value)] },
				validate: verdictDe('latitude'),
			},
			{
				name: 'longitude',
				label: 'Longitude',
				type: 'number',
				hooks: { beforeValidate: [({ value }) => roundedCoordinate(value)] },
				validate: verdictDe('longitude'),
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
]
