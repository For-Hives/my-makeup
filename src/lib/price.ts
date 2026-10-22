/**
 * The single rule for a price (plans/01 §6.2, plans/02 U33-U37): reading the amount in the text
 * an artist typed, showing a price, and the lowest price of a profile. The import, the public
 * profile, the cards, the JSON-LD and the artist's space all go through this file.
 *
 * A price is two values: `priceFrom`, an amount in euros or nothing, and `priceText`, what
 * was typed, kept as it is.
 *
 * The amount is read as on the old site (numericPrice of src/lib/profil/completude.js, branch
 * main): the same text gives the same number, so a profile keeps its « offre chiffrée ». Its
 * known limits come with it: the first number of the text is the one read (« 45 min, 60 € »
 * gives 45, « 2 h : 150 € » gives nothing), and two numbers on two lines with nothing between
 * them (« 80 », then « 120 ») read as one amount out of bounds, so as nothing.
 */

/** An amount counts as a price between these two bounds, in euros (same bounds as the old site). */
export const PRICE_MIN = 5
export const PRICE_MAX = 10_000

/** A price as a profile stores it, for an offer or for one of its options. */
export type Price = {
	/** Amount in euros, null when there is none (« Sur devis ») */
	priceFrom: number | null
	/** The text as typed, trimmed; null when nothing was typed */
	priceText: string | null
}

/** What the display reads: the two fields, absent or not, whatever the data holds. */
export type StoredPrice = {
	readonly priceFrom?: number | null
	readonly priceText?: string | null
}

const NO_BREAK_SPACE = '\u00a0'
const NARROW_NO_BREAK_SPACE = '\u202f'

/** Words a broken save may have written in place of a text: they say nothing. */
const STOP_WORDS = new Set(['null', 'undefined', 'nan'])

// « 1 200 »: a space between a digit and a group of three digits
const THOUSANDS_SPACE = /(\d)\s(?=\d{3}\b)/g
const FIRST_NUMBER = /(\d+(?:\.\d+)?)/
const THREE_DIGIT_GROUP = /\B(?=(\d{3})+$)/g

// An amount and nothing else: « 50 », « 50€ », « 1 200 euros », « 50,5 € »
const AMOUNT = String.raw`(?:\d+|\d{1,3}(?:\s\d{3})+)(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?`
const AMOUNT_ONLY = new RegExp(`^${AMOUNT}$`, 'i')
const FROM_AMOUNT = new RegExp(String.raw`^[àa]\s+partir\s+de(?:\s*:\s*|\s+)${AMOUNT}$`, 'i')

/** True for an amount that counts as a price: a number between PRICE_MIN and PRICE_MAX. */
export function isPriceAmount(montant: unknown): montant is number {
	return typeof montant === 'number' && montant >= PRICE_MIN && montant <= PRICE_MAX
}

/** Trimmed text, or null for anything else, for an empty text and for the words of STOP_WORDS. */
function enteredText(saisie: unknown): string | null {
	if (typeof saisie !== 'string') return null
	const text = saisie.trim()
	return text === '' || STOP_WORDS.has(text.toLowerCase()) ? null : text
}

/** First number written in a text, whatever its size: « à partir de 80 € » → 80, « 1 200 € » → 1200. */
function firstNumber(texte: string): number | null {
	const m = FIRST_NUMBER.exec(texte.replace(THOUSANDS_SPACE, '$1').replace(',', '.'))
	return m === null ? null : Number(m[1])
}

/**
 * Reads a price typed as text: « 50 », « 50€ » and « à partir de 80 » give their amount, « sur
 * devis » gives none, and neither does a number out of bounds. The text is always kept.
 * Anything but a text is nothing typed.
 */
export function parsePrice(saisie: unknown): Price {
	const priceText = enteredText(saisie)
	const number = priceText === null ? null : firstNumber(priceText)
	return { priceFrom: isPriceAmount(number) ? number : null, priceText }
}

/**
 * An amount in euros as the site writes it: « 50 € », « 1 200 € », « 50,50 € ». Cents are shown
 * only when there are some. '' for anything that is not an amount above zero: never « NaN € ».
 *
 * Written by hand, with the spaces Intl gives for fr-FR (a thin no-break space between the
 * thousands, a no-break space before the sign): the server and the browser cannot disagree.
 */
export function formatAmount(montant: number | null | undefined): string {
	if (typeof montant !== 'number' || !Number.isFinite(montant)) return ''
	const centimes = Math.round(montant * 100)
	if (centimes < 1 || !Number.isSafeInteger(centimes)) return ''
	const euros = String(Math.trunc(centimes / 100)).replace(THREE_DIGIT_GROUP, NARROW_NO_BREAK_SPACE)
	const rest = centimes % 100
	const decimals = rest === 0 ? '' : `,${String(rest).padStart(2, '0')}`
	return `${euros}${decimals}${NO_BREAK_SPACE}€`
}

/** « À partir de 80 € », for a card or a line of price; '' without an amount. */
export function formatFrom(montant: number | null | undefined): string {
	const displayed = formatAmount(montant)
	return displayed === '' ? '' : `À partir de ${displayed}`
}

/** « dès 150 € », the starting price on a card of a list; '' without an amount. */
export function formatFromShort(montant: number | null | undefined): string {
	const displayed = formatAmount(montant)
	return displayed === '' ? '' : `dès ${displayed}`
}

/** The text with its first letter as a capital; the rest is left as typed. */
function capital(texte: string): string {
	const [first = ''] = texte
	return first.toUpperCase() + texte.slice(first.length)
}

/**
 * One line typed, as shown: an amount alone becomes « 1 200 € », « à partir de » and an amount
 * becomes « À partir de 80 € », anything else stays as typed, with a capital (« Sur devis »).
 */
function displayedRow(ligne: string): string {
	const number = firstNumber(ligne)
	if (formatAmount(number) !== '') {
		const shape = ligne.normalize('NFC')
		if (AMOUNT_ONLY.test(shape)) return formatAmount(number)
		if (FROM_AMOUNT.test(shape)) return formatFrom(number)
	}
	return capital(ligne)
}

/**
 * A price as the site shows it, one entry per line: the lines typed that say something, each one
 * through displayedRow. The amount comes first when the text does not give it already, that is
 * when it is not the first number of the text (an amount stored without a text, or next to a free
 * text). Empty when there is nothing to show: no entry is ever blank, « null » or « NaN € ».
 */
export function priceRows(prix: StoredPrice | null | undefined): string[] {
	const text = enteredText(prix?.priceText)
	const rows = (text ?? '').split('\n').flatMap(ligne => enteredText(ligne) ?? [])
	const amount = formatAmount(prix?.priceFrom)
	const alreadySaid = text !== null && firstNumber(text) === prix?.priceFrom
	return [...(amount === '' || alreadySaid ? [] : [amount]), ...rows.map(displayedRow)]
}

/** A price as one text: the entries of priceRows, one per line; '' when there is nothing to show. */
export function formatPrice(prix: StoredPrice | null | undefined): string {
	return priceRows(prix).join('\n')
}

/**
 * Lowest price of a profile, for the cards and the JSON-LD: the smallest amount of its offers.
 * An offer in free text (no amount) is ignored, and so is an amount out of bounds. The options
 * of an offer do not count: an option is not sold alone. Null when no offer has an amount.
 */
export function minimumPrice(
	prestations: ReadonlyArray<{ readonly priceFrom?: number | null } | null | undefined> | null | undefined
): number | null {
	let minimal: number | null = null
	for (const serviceOffer of prestations ?? []) {
		const amount = serviceOffer?.priceFrom
		if (isPriceAmount(amount) && (minimal === null || amount < minimal)) minimal = amount
	}
	return minimal
}
