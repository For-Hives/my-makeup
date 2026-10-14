import type { Field, FieldHook } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	BORNES_DU_RAYON_KM,
	type CommuneSaisie,
	codeInseeNormalise,
	communeEnChamps,
	departementDuCodeInsee,
	type ErreursDeLaCommune,
	erreursDeLaCommune,
	NOM_DE_COMMUNE_MAX,
	nomNormalise,
	verdictDeLaCommune,
	verdictDuRayon,
} from '../../lib/profil/zone'

/**
 * The département of a commune, computed by the server from its INSEE code at every save, the
 * import's included: a value sent for it is replaced, so it is never out of step with the code. A
 * code that is not well formed gives null, and the check of the code refuses the save anyway.
 */
const departementDuCode: FieldHook = ({ siblingData }) =>
	departementDuCodeInsee((siblingData as CommuneSaisie).codeInsee)

/** The check of one field of the commune, which reads its sibling fields (src/lib/profil/zone.ts). */
const verdictDe =
	(champ: keyof ErreursDeLaCommune) =>
	(_valeur: unknown, { siblingData }: { siblingData: unknown }): true | string =>
		erreursDeLaCommune(siblingData as CommuneSaisie)[champ] ?? true

/**
 * The zone of a profile (ticket 041; plan 01 §3.3 P7.4 and §6.2; docs/migration/SCHEMA.md,
 * §5.2 and §9): its commune, its radius and « à domicile ». No postal address: there is no field
 * for one. The rules and their French messages live in src/lib/profil/zone.ts.
 *
 * - `commune`: a commune of the official list, with its name and its INSEE code, the one never
 *   without the other; its coordinates if known. It is sent whole: what a request leaves out of it
 *   is emptied, never taken from the stored one. Empty while the makeup artist has not chosen one;
 *   `null` empties it; a text alone (a city typed freely), an array, or a name that looks like an
 *   address is refused. `departement` is computed by the server from the code.
 * - `rayonKm`: a whole number of kilometres, from 0 to 200, or empty.
 * - `aDomicile`: empty while she has not said it (the old site does not know it).
 *
 * These fields carry no access rule of their own: whoever reads a profile reads its zone, and
 * whoever changes a profile changes its zone. The public reads it with the published profiles
 * (ticket 021): the commune, its INSEE code, its département and the coordinates of its centre are
 * public reference data, not personal data.
 */
export const champsDeLaZone: Field[] = [
	{
		name: 'commune',
		label: 'Commune',
		type: 'group',
		admin: { description: 'Une commune de la liste officielle, avec son code INSEE. Jamais une adresse.' },
		// Before its fields are read: Payload stops with a 500 on a group sent as `null`, and fills
		// what an object leaves out with the stored values.
		hooks: { beforeValidate: [({ value }) => communeEnChamps(value)] },
		validate: verdictDeLaCommune,
		fields: [
			{
				name: 'nom',
				label: 'Nom',
				type: 'text',
				maxLength: NOM_DE_COMMUNE_MAX,
				hooks: { beforeValidate: [({ value }) => nomNormalise(value)] },
				validate: verdictDe('nom'),
			},
			{
				name: 'codeInsee',
				label: 'Code INSEE',
				type: 'text',
				hooks: { beforeValidate: [({ value }) => codeInseeNormalise(value)] },
				validate: verdictDe('codeInsee'),
			},
			{
				name: 'departement',
				label: 'Département',
				type: 'text',
				hooks: { beforeChange: [departementDuCode] },
				admin: { readOnly: true, description: 'Calculé depuis le code INSEE.' },
			},
			{ name: 'latitude', label: 'Latitude', type: 'number', validate: verdictDe('latitude') },
			{ name: 'longitude', label: 'Longitude', type: 'number', validate: verdictDe('longitude') },
		],
	},
	{
		name: 'rayonKm',
		label: 'Rayon d’action (km)',
		type: 'number',
		min: BORNES_DU_RAYON_KM.min,
		max: BORNES_DU_RAYON_KM.max,
		admin: { step: 1 },
		validate: verdictDuRayon,
	},
	{
		name: 'aDomicile',
		label: 'À domicile',
		type: 'checkbox',
		admin: { description: 'Se déplace chez la cliente. Vide tant que la maquilleuse ne l’a pas dit.' },
	},
]
