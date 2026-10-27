/**
 * The flagship offer (issue 1009): the one offer she writes, a name
 * (one of three models, or her own) and one price.
 *
 * - The step takes an amount, not « sur devis »: an offer without an amount does not count towards a
 *   publishable profile (`SERVICE_OFFERS_MESSAGES.sansMontant`), and the step exists to give her one. The
 *   reading is the single price rule (`parsePrice`, src/lib/price.ts); this file reads nothing itself.
 * - The server replaces the whole list of offers. The list sent therefore starts with the offers she
 *   already has, with their identifiers and without a word about their options (the server keeps the
 *   stored ones when none is sent), then the new one. An offer with the same name (case and accents
 *   ignored) receives the price instead of a second line.
 */

import { parsePrice } from '../price'
import { normalize } from '../profile/completeness'
import type { SavedRow, SentRow } from './list'
import { inputPrice, SERVICE_OFFERS } from './service-offers'

export interface FlagshipInput {
	readonly name: string
	readonly price: string
}

export const FLAGSHIP_MESSAGES = {
	name: SERVICE_OFFERS.requis.name ?? 'Le nom de la prestation est requis.',
	price: 'Indique un montant, par exemple 150 : sans montant, ta page ne peut pas être en ligne.',
} as const

/** The messages under the fields: nothing when the offer is good to send. */
export function flagshipErrors(input: FlagshipInput): { name?: string; price?: string } {
	const errors: { name?: string; price?: string } = {}
	if (input.name.trim() === '') errors.name = FLAGSHIP_MESSAGES.name
	if (parsePrice(inputPrice(input.price)).priceFrom === null) errors.price = FLAGSHIP_MESSAGES.price
	return errors
}

/** The list to send: the offers she has, then the flagship one (or the same-named offer, priced). */
export function flagshipRows(stored: readonly SavedRow[], input: FlagshipInput): SentRow[] {
	const name = input.name.trim()
	const price = input.price.trim()
	const same = stored.find(row => normalize(row.valeurs.name) === normalize(name))
	const kept: SentRow[] = stored.map(row =>
		row === same ? { id: row.id, valeurs: { ...row.valeurs, price } } : { id: row.id, valeurs: row.valeurs }
	)
	return same ? kept : [...kept, { valeurs: { name, description: '', price } }]
}
