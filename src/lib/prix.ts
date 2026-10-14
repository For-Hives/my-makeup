/**
 * The single rule for a price (plans/01 §6.2, plans/02 U33-U37): reading the amount in the text
 * an artist typed, showing a price, and the lowest price of a profile. The import, the public
 * profile, the cards, the JSON-LD and the artist's space all go through this file.
 *
 * A price is two values: `prixAPartirDe`, an amount in euros or nothing, and `prixTexte`, what
 * was typed, kept as it is.
 *
 * The amount is read as on the old site (prixNumerique of src/lib/profil/completude.js, branch
 * main): the same text gives the same number, so a profile keeps its « offre chiffrée ». Its
 * known limits come with it: the first number of the text is the one read (« 45 min, 60 € »
 * gives 45, « 2 h : 150 € » gives nothing), and two numbers on two lines with nothing between
 * them (« 80 », then « 120 ») read as one amount out of bounds, so as nothing.
 */

/** An amount counts as a price between these two bounds, in euros (same bounds as the old site). */
export const PRIX_MIN = 5
export const PRIX_MAX = 10_000

/** A price as a profile stores it, for an offer or for one of its options. */
export type Prix = {
	/** Amount in euros, null when there is none (« Sur devis ») */
	prixAPartirDe: number | null
	/** The text as typed, trimmed; null when nothing was typed */
	prixTexte: string | null
}

/** What the display reads: the two fields, absent or not, whatever the data holds. */
export type PrixStocke = {
	readonly prixAPartirDe?: number | null
	readonly prixTexte?: string | null
}

const ESPACE_INSECABLE = '\u00a0'
const ESPACE_FINE_INSECABLE = '\u202f'

/** Words a broken save may have written in place of a text: they say nothing. */
const MOTS_VIDES = new Set(['null', 'undefined', 'nan'])

// « 1 200 »: a space between a digit and a group of three digits
const ESPACE_DE_MILLIERS = /(\d)\s(?=\d{3}\b)/g
const PREMIER_NOMBRE = /(\d+(?:\.\d+)?)/
const GROUPE_DE_TROIS_CHIFFRES = /\B(?=(\d{3})+$)/g

// An amount and nothing else: « 50 », « 50€ », « 1 200 euros », « 50,5 € »
const MONTANT = String.raw`(?:\d+|\d{1,3}(?:\s\d{3})+)(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?`
const MONTANT_SEUL = new RegExp(`^${MONTANT}$`, 'i')
const A_PARTIR_DE_MONTANT = new RegExp(String.raw`^[àa]\s+partir\s+de(?:\s*:\s*|\s+)${MONTANT}$`, 'i')

/** True for an amount that counts as a price: a number between PRIX_MIN and PRIX_MAX. */
export function estMontantDePrix(montant: unknown): montant is number {
	return typeof montant === 'number' && montant >= PRIX_MIN && montant <= PRIX_MAX
}

/** Trimmed text, or null for anything else, for an empty text and for the words of MOTS_VIDES. */
function texteSaisi(saisie: unknown): string | null {
	if (typeof saisie !== 'string') return null
	const texte = saisie.trim()
	return texte === '' || MOTS_VIDES.has(texte.toLowerCase()) ? null : texte
}

/** First number written in a text, whatever its size: « à partir de 80 € » → 80, « 1 200 € » → 1200. */
function premierNombre(texte: string): number | null {
	const m = PREMIER_NOMBRE.exec(texte.replace(ESPACE_DE_MILLIERS, '$1').replace(',', '.'))
	return m === null ? null : Number(m[1])
}

/**
 * Reads a price typed as text: « 50 », « 50€ » and « à partir de 80 » give their amount, « sur
 * devis » gives none, and neither does a number out of bounds. The text is always kept.
 * Anything but a text is nothing typed.
 */
export function parsePrice(saisie: unknown): Prix {
	const prixTexte = texteSaisi(saisie)
	const nombre = prixTexte === null ? null : premierNombre(prixTexte)
	return { prixAPartirDe: estMontantDePrix(nombre) ? nombre : null, prixTexte }
}

/**
 * An amount in euros as the site writes it: « 50 € », « 1 200 € », « 50,50 € ». Cents are shown
 * only when there are some. '' for anything that is not an amount above zero: never « NaN € ».
 *
 * Written by hand, with the spaces Intl gives for fr-FR (a thin no-break space between the
 * thousands, a no-break space before the sign): the server and the browser cannot disagree.
 */
export function formatMontant(montant: number | null | undefined): string {
	if (typeof montant !== 'number' || !Number.isFinite(montant)) return ''
	const centimes = Math.round(montant * 100)
	if (centimes < 1 || !Number.isSafeInteger(centimes)) return ''
	const euros = String(Math.trunc(centimes / 100)).replace(GROUPE_DE_TROIS_CHIFFRES, ESPACE_FINE_INSECABLE)
	const reste = centimes % 100
	const decimales = reste === 0 ? '' : `,${String(reste).padStart(2, '0')}`
	return `${euros}${decimales}${ESPACE_INSECABLE}€`
}

/** « À partir de 80 € », for a card or a line of price; '' without an amount. */
export function formatAPartirDe(montant: number | null | undefined): string {
	const affiche = formatMontant(montant)
	return affiche === '' ? '' : `À partir de ${affiche}`
}

/** The text with its first letter as a capital; the rest is left as typed. */
function majuscule(texte: string): string {
	const [premiere = ''] = texte
	return premiere.toUpperCase() + texte.slice(premiere.length)
}

/**
 * One line typed, as shown: an amount alone becomes « 1 200 € », « à partir de » and an amount
 * becomes « À partir de 80 € », anything else stays as typed, with a capital (« Sur devis »).
 */
function ligneAffichee(ligne: string): string {
	const nombre = premierNombre(ligne)
	if (formatMontant(nombre) !== '') {
		const forme = ligne.normalize('NFC')
		if (MONTANT_SEUL.test(forme)) return formatMontant(nombre)
		if (A_PARTIR_DE_MONTANT.test(forme)) return formatAPartirDe(nombre)
	}
	return majuscule(ligne)
}

/**
 * A price as the site shows it, one entry per line: the lines typed that say something, each one
 * through ligneAffichee. The amount comes first when the text does not give it already, that is
 * when it is not the first number of the text (an amount stored without a text, or next to a free
 * text). Empty when there is nothing to show: no entry is ever blank, « null » or « NaN € ».
 */
export function lignesDePrix(prix: PrixStocke | null | undefined): string[] {
	const texte = texteSaisi(prix?.prixTexte)
	const lignes = (texte ?? '').split('\n').flatMap(ligne => texteSaisi(ligne) ?? [])
	const montant = formatMontant(prix?.prixAPartirDe)
	const dejaDit = texte !== null && premierNombre(texte) === prix?.prixAPartirDe
	return [...(montant === '' || dejaDit ? [] : [montant]), ...lignes.map(ligneAffichee)]
}

/** A price as one text: the entries of lignesDePrix, one per line; '' when there is nothing to show. */
export function formatPrix(prix: PrixStocke | null | undefined): string {
	return lignesDePrix(prix).join('\n')
}

/**
 * Lowest price of a profile, for the cards and the JSON-LD: the smallest amount of its offers.
 * An offer in free text (no amount) is ignored, and so is an amount out of bounds. The options
 * of an offer do not count: an option is not sold alone. Null when no offer has an amount.
 */
export function prixMinimal(
	prestations: ReadonlyArray<{ readonly prixAPartirDe?: number | null } | null | undefined> | null | undefined
): number | null {
	let minimal: number | null = null
	for (const prestation of prestations ?? []) {
		const montant = prestation?.prixAPartirDe
		if (estMontantDePrix(montant) && (minimal === null || montant < minimal)) minimal = montant
	}
	return minimal
}
