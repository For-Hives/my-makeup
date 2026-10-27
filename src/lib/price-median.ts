/**
 * The market hint (issue 1009): the median amount of the published offers of one
 * model (bride, evening, trial), shown under the price field of her flagship offer.
 *
 * - It is a median of the amounts the single price rule reads (`priceFrom`, src/lib/price.ts), never
 *   of a text.
 * - It is given only from a sample of `MEDIAN_MINIMUM` amounts: below, a median would name one or two
 *   profiles, so no hint is shown at all. A value of one profile never leaves the server.
 * - The models are the three buttons of the offers block of the direct edition: one list, here.
 *
 * No server code here: relative imports, so that the services and the browser read the same file.
 */

import { normalize } from './profile/completeness'

/** The fewest amounts a median is given from. */
export const MEDIAN_MINIMUM = 5

/** One model of offer: the button, the name it fills in, and the words by which an offer name is read as this model. */
export interface OfferModel {
	readonly label: 'Mariée' | 'Soirée' | 'Essai'
	readonly name: string
	/** Words (no accent, lower case) of which one, found in a name, makes the offer of this model. */
	readonly words: readonly string[]
}

/** In the order of the buttons. A trial comes first when a name says both « essai » and « mariée ». */
export const OFFER_MODELS: readonly OfferModel[] = [
	{ label: 'Mariée', name: 'Maquillage de la mariée', words: ['mariee', 'mariage', 'bride'] },
	{ label: 'Soirée', name: 'Maquillage de soirée', words: ['soiree'] },
	{ label: 'Essai', name: 'Essai maquillage', words: ['essai'] },
]

/** The model an offer name says, or null (« Cours d’auto-maquillage »). The trial wins: « Essai mariée » is a trial. */
export function offerModelOf(name: unknown): OfferModel | null {
	const read = normalize(name)
	if (read === '') return null
	const trial = OFFER_MODELS.find(({ label }) => label === 'Essai')
	if (trial?.words.some(word => read.includes(word))) return trial
	return OFFER_MODELS.find(({ words }) => words.some(word => read.includes(word))) ?? null
}

/**
 * The median of the amounts, to the euro, or null below `MEDIAN_MINIMUM` usable amounts. An amount is a
 * finite number above zero; anything else is not counted.
 */
export function medianPrice(amounts: readonly number[]): number | null {
	const usable = amounts.filter(amount => Number.isFinite(amount) && amount > 0).sort((a, b) => a - b)
	if (usable.length < MEDIAN_MINIMUM) return null
	const middle = Math.floor(usable.length / 2)
	const value = usable.length % 2 === 1 ? usable[middle] : ((usable[middle - 1] ?? 0) + (usable[middle] ?? 0)) / 2
	return value === undefined ? null : Math.round(value)
}

/** The median of each model, from the name and the amount of the published offers. A model under the minimum is null. */
export function offerMedians(
	offers: readonly { readonly name: string | null | undefined; readonly amount: number | null | undefined }[]
): Record<OfferModel['label'], number | null> {
	const byModel: Record<OfferModel['label'], number[]> = { Mariée: [], Soirée: [], Essai: [] }
	for (const { name, amount } of offers) {
		const model = offerModelOf(name)
		if (model !== null && typeof amount === 'number') byModel[model.label].push(amount)
	}
	return {
		Mariée: medianPrice(byModel.Mariée),
		Soirée: medianPrice(byModel.Soirée),
		Essai: medianPrice(byModel.Essai),
	}
}
