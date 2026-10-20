import type { CollectionBeforeChangeHook, DateField, Field, NumberField, TextareaField, TextField } from 'payload'
import { PRIX_MAX, PRIX_MIN } from '../lib/price'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	DESCRIPTION_MAX_LENGTH,
	dateMessage,
	dayDate,
	endMessage,
	NAME_MAX_LENGTH,
	obtainMessage,
	priceMessage,
	rowIdentities,
	textMessage,
} from '../lib/profile/lists'

/**
 * The list sections of a profile (plan 01 §6.1; docs/migration/SCHEMA.md §6.1 to §6.7): offers
 * with their options, skills, languages, courses and experiences, in the order the artist gave.
 *
 * Each row has the identifier Payload gives it, kept from one save to the next
 * (`rowIdentities`); the order is the order of the rows sent. Each value is checked by the
 * server against its bound, with a refusal in French (src/lib/profile/lists.ts). No sub-field is
 * required: a row of the old site keeps its empty values (SCHEMA.md §2, rule 2); the forms of the
 * artist's space say what they require.
 *
 * The lists take the access of the profile: its owner and an admin write them, nobody else.
 */

/** A text of a row, refused in French beyond `maximum` characters. */
const texte = (name: string, label: string, maximum = NAME_MAX_LENGTH): TextField => ({
	name,
	label,
	type: 'text',
	maxLength: maximum,
	validate: valeur => textMessage(valeur, maximum) ?? true,
})

/** A long text of a row, refused in French beyond 2 000 characters. */
const description = (): TextareaField => ({
	name: 'description',
	label: 'Description',
	type: 'textarea',
	maxLength: DESCRIPTION_MAX_LENGTH,
	validate: valeur => textMessage(valeur, DESCRIPTION_MAX_LENGTH) ?? true,
})

/** A day without an hour, stored at 12:00 UTC (`dayDate`). */
const jour = (name: string, label: string, validate: DateField['validate']): DateField => ({
	name,
	label,
	type: 'date',
	admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' } },
	hooks: { beforeValidate: [({ value }) => dayDate(value)] },
	validate,
})

/** The two fields of a price (SCHEMA.md §6.6): the text as typed, and the amount it gives, if any. */
const prix = (): Field[] => [
	texte('priceText', 'Prix, tel que saisi'),
	{
		name: 'priceFrom',
		label: 'Prix à partir de (€)',
		type: 'number',
		min: PRIX_MIN,
		max: PRIX_MAX,
		admin: { description: 'De 5 à 10 000 €. Vide quand le prix saisi n’a pas de montant (« Sur devis »).' },
		validate: valeur => priceMessage(valeur) ?? true,
	} satisfies NumberField,
]

export const CHAMPS_LISTES: Field[] = [
	{
		name: 'serviceOffers',
		label: 'Prestations',
		labels: { singular: 'Prestation', plural: 'Prestations' },
		type: 'array',
		fields: [
			texte('name', 'Nom'),
			description(),
			...prix(),
			{
				name: 'options',
				label: 'Options',
				labels: { singular: 'Option', plural: 'Options' },
				type: 'array',
				fields: [texte('name', 'Nom'), description(), ...prix()],
			},
		],
	},
	{
		name: 'skills',
		label: 'Compétences',
		labels: { singular: 'Compétence', plural: 'Compétences' },
		type: 'array',
		fields: [texte('name', 'Nom'), description()],
	},
	{
		name: 'languages',
		label: 'Langues',
		labels: { singular: 'Langue', plural: 'Langues' },
		type: 'array',
		fields: [texte('name', 'Nom')],
	},
	{
		name: 'courses',
		label: 'Formations',
		labels: { singular: 'Formation', plural: 'Formations' },
		type: 'array',
		fields: [
			texte('diploma', 'Diplôme'),
			texte('school', 'École'),
			jour('graduatedAt', 'Obtenu le', valeur => obtainMessage(valeur, new Date()) ?? true),
			description(),
		],
	},
	{
		name: 'experiences',
		label: 'Expériences',
		labels: { singular: 'Expérience', plural: 'Expériences' },
		type: 'array',
		fields: [
			texte('company', 'Entreprise'),
			texte('jobTitle', 'Poste'),
			texte('city', 'Ville'),
			jour('startDate', 'Début', valeur => dateMessage(valeur) ?? true),
			jour(
				'endDate',
				'Fin',
				(valeur, { siblingData }) => endMessage(valeur, (siblingData as { startDate?: unknown }).startDate) ?? true
			),
			description(),
		],
	},
]

/**
 * Before a profile is written: the identity of the rows of its lists. A row sent back with the
 * identifier the server gave it keeps it; any other row is new and gets one from Payload.
 */
export const identitesDesLignesAvantEcriture: CollectionBeforeChangeHook = ({ data, originalDoc }) =>
	rowIdentities(data, originalDoc)
