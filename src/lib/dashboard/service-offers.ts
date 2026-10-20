/**
 * The offers of a makeup artist, edited row by row in her space (ticket 131; plan 01 §3.3 P7.4,
 * plan 02 U29, U04). Same model as the experiences (src/lib/dashboard/experiences.ts).
 *
 * - Required, for the row she adds or edits: the name. The description and the price may stay empty.
 * - The price is one text, as typed: « 80 », « 80 € », « à partir de 80 » or « sur devis ». The server
 *   reads the amount from it by the single price rule (`parsePrice`, src/lib/prix.ts) and stores both:
 *   the text as typed and the amount, if there is one. The amount makes the offer count towards a
 *   publishable profile (U04). A request cannot carry an amount: the schema has no such field.
 * - Several prices of one offer are typed with « ; » between them, and stored one per line, as on
 *   the old site.
 * - The options of an offer (ticket 132) are edited in the same panel: each has a name (required), a
 *   description and a price, read by the same rules as the offer's own. A request that sends no
 *   `options` for an offer keeps the stored ones.
 */

import { formatMontant, formatPrix, parsePrice } from '../prix'
import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeTexte } from '../profile/listes'
import { texte } from '../profile/nom-affiche'
import type { ListDefinition, RowErrors, RowValues } from './list'

/** The price as typed (« ; » between several), as the one text that is stored (one per line). */
export function inputPrice(saisie: string): string {
	return saisie
		.split(/[;\n]/)
		.map(ligne => ligne.trim())
		.filter(Boolean)
		.join('\n')
}

/** The price as it is typed again in the form: the lines of the stored text, « ; » between them. */
const priceFromInput = (stocke: unknown): string => (typeof stocke === 'string' ? stocke.split('\n').join(' ; ') : '')

export const SERVICE_OFFERS_MESSAGES = {
	montant: (montant: string) => `Montant retenu pour ton profil : ${montant}.`,
	sansMontant:
		'Aucun montant retenu : l’offre est affichée telle quelle, mais elle ne compte pas pour rendre ton profil publiable. Écris par exemple « à partir de 80 € ».',
} as const

function bounds(valeurs: RowValues): RowErrors {
	const errors: Record<string, string> = {}
	const name = messageDeTexte(valeurs.name, LONGUEUR_NOM)
	if (name !== null) errors.name = name
	const description = messageDeTexte(valeurs.description, LONGUEUR_DESCRIPTION)
	if (description !== null) errors.description = description
	const price = messageDeTexte(inputPrice(valeurs.price ?? ''), LONGUEUR_NOM)
	if (price !== null) errors.price = price
	return errors
}

/** The two stored fields of a price typed in the form. */
const storedPrice = (saisie: string | undefined) => parsePrice(inputPrice(saisie ?? ''))

/** What an offer and an option share: their three fields, bounds, price reading and storage. */
const SHARED = {
	champs: [
		{ nom: 'name', libelle: 'Nom', genre: 'texte' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
		{
			nom: 'price',
			libelle: 'Prix',
			genre: 'texte',
			exemple: 'à partir de 80 €',
			aide: 'Un montant (80, 80 €, à partir de 80) ou un texte (sur devis). Pour plusieurs formules, sépare-les par un point-virgule.',
		},
	],
	bornes: bounds,
	resume: (valeurs: RowValues) =>
		[valeurs.name, formatPrix(storedPrice(valeurs.price)).replace(/\n/g, ', ')].map(texte).filter(Boolean).join(' - '),
	nom: (valeurs: RowValues) => texte(valeurs.name),
	depuisLeStockage: (stockee: Readonly<Record<string, unknown>>) => ({
		name: texte(stockee.name),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
		price: priceFromInput(
			// An amount stored without its text (an imported offer) is typed back as the amount.
			texte(stockee.priceText) !== ''
				? stockee.priceText
				: typeof stockee.priceFrom === 'number'
					? String(stockee.priceFrom)
					: ''
		),
	}),
	versLeStockage: (valeurs: RowValues) => {
		const { priceText, priceFrom } = storedPrice(valeurs.price)
		return { name: valeurs.name || null, description: valeurs.description || null, priceText, priceFrom }
	},
	indice: (valeurs: RowValues) => {
		if (inputPrice(valeurs.price ?? '') === '') return ''
		const { priceFrom } = storedPrice(valeurs.price)
		return priceFrom === null
			? SERVICE_OFFERS_MESSAGES.sansMontant
			: SERVICE_OFFERS_MESSAGES.montant(formatMontant(priceFrom))
	},
} as const

/** The options of an offer (ticket 132): the same three fields, the name required. */
export const SERVICE_OFFER_OPTIONS: ListDefinition = {
	...SHARED,
	section: 'options',
	singulier: 'option',
	pluriel: 'options',
	designation: 'l’option',
	champs: [
		{ ...SHARED.champs[0], libelle: 'Nom de l’option', exemple: 'Essai avant le jour J' },
		...SHARED.champs.slice(1),
	],
	requis: { name: 'Le nom de l’option est requis.' },
	doublon: 'Une option identique est déjà dans la liste.',
	retrait: nom => `Option ${nom} retirée`.replace(/\s+/g, ' '),
}

export const SERVICE_OFFERS: ListDefinition = {
	...SHARED,
	section: 'serviceOffers',
	singulier: 'prestation',
	pluriel: 'prestations',
	designation: 'la prestation',
	champs: [
		{ ...SHARED.champs[0], libelle: 'Nom de la prestation', exemple: 'Maquillage de mariée' },
		...SHARED.champs.slice(1),
	],
	requis: { name: 'Le nom de la prestation est requis.' },
	doublon: 'Une prestation identique est déjà dans la liste.',
	retrait: nom => `Prestation ${nom} retirée`.replace(/\s+/g, ' '),
	options: SERVICE_OFFER_OPTIONS,
	garder: stockee => ({ options: Array.isArray(stockee.options) ? stockee.options : [] }),
}
