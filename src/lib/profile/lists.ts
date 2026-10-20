/**
 * The rules of the list sections of a profile (plans/01 §6.1, docs/migration/SCHEMA.md §6):
 * offers with their options, skills, languages, courses and experiences. One rule per subject,
 * called by the collection (src/collections/profile-lists.ts) and, later, by the forms of the
 * artist's space, which must not compute them again.
 *
 * - The identity of a row: the server gives it, once, and keeps it (`rowIdentities`).
 * - The bounds of a value: a text length, an amount of price, a date (`messageDe…`).
 * - A date of these lists is a day, without an hour (`dayDate`).
 *
 * Every message is in French: it is what the artist reads when the server refuses a value.
 */

import { estMontantDePrix, formatMontant, PRIX_MAX, PRIX_MIN } from '../price'

/** Longest name, title or price text of a row (the bounds of the old API and of its forms). */
export const NAME_MAX_LENGTH = 70
/** Longest description of a row (the bound of the old API and of its forms). */
export const DESCRIPTION_MAX_LENGTH = 2000

/**
 * The list fields of a profile, each with the lists nested in its rows. Only one level of
 * nesting exists: the options of an offer.
 */
export const PROFILE_LISTS = {
	serviceOffers: ['options'],
	skills: [],
	languages: [],
	courses: [],
	experiences: [],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** A row of a list, or a document that holds lists: what it holds is checked, never assumed. */
export type Row = Record<string, unknown>

const isRow = (valeur: unknown): valeur is Row =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

const rowsOf = (valeur: unknown): Row[] => (Array.isArray(valeur) ? valeur.filter(isRow) : [])

const idsOf = (lignes: readonly Row[]): ReadonlySet<string> =>
	new Set(lignes.flatMap(({ id }) => (typeof id === 'string' && id !== '' ? [id] : [])))

/**
 * The rows sent, each keeping its identifier only when it is one the server gave to a row of
 * this list (`connus`) and no earlier row of the request holds it already (`vus`). Any other
 * row loses its identifier, and Payload gives it a new one.
 */
function keepIds(recues: unknown[], connus: ReadonlySet<string>, vus: Set<string>): unknown[] {
	return recues.map(ligne => {
		if (!isRow(ligne)) return ligne
		const { id, ...content } = ligne
		if (typeof id !== 'string' || !connus.has(id) || vus.has(id)) return content
		vus.add(id)
		return ligne
	})
}

/**
 * The identity of each row of the lists of a profile, before it is written (rule L1 of
 * docs/qualite.md §3): a row gets its identifier from the server when it is created, and keeps
 * it as long as it is sent back with it. The order of the rows is the order sent.
 *
 * In the data sent (`recu`), a row keeps its identifier when the stored profile (`stocke`) has a
 * row with this identifier in the same list (for an option: among the options of any of its
 * offers), and only on its first occurrence. Every other row is a new row and loses the
 * identifier it came with: none (a row just added), a made-up one (taken from its content, as
 * the old site did), one held by an earlier row of the request (a row copied), or one of another
 * profile. So no identifier ever comes from the content of a row, two rows never share one, and a
 * request never reaches the rows of another profile, nor learns that an identifier exists.
 *
 * A list that is not sent is left as it is. Everything else in `recu` is returned unchanged.
 */
export function rowIdentities(recu: Row, stocke: Row | null | undefined): Row {
	const output: Row = { ...recu }
	for (const [name, nested] of Object.entries(PROFILE_LISTS)) {
		const received = recu[name]
		if (!Array.isArray(received)) continue
		const stored = rowsOf(stocke?.[name])
		let rows = keepIds(received, idsOf(stored), new Set())
		for (const subList of nested) {
			const known = idsOf(stored.flatMap(ligne => rowsOf(ligne[subList])))
			// One set for all the rows: an option keeps its identifier once in the whole profile.
			const seen = new Set<string>()
			rows = rows.map(ligne =>
				isRow(ligne) && Array.isArray(ligne[subList])
					? { ...ligne, [subList]: keepIds(ligne[subList], known, seen) }
					: ligne
			)
		}
		output[name] = rows
	}
	return output
}

/** Refusals, as the artist reads them. */
export const MESSAGES = {
	pasUnTexte: 'Ce champ attend un texte.',
	texteTropLong: (maximum: number) => `Ce texte ne doit pas dépasser ${maximum} caractères.`,
	prixHorsBornes: `Le prix doit être un montant entre ${formatMontant(PRIX_MIN)} et ${formatMontant(PRIX_MAX)}.`,
	dateInvalide: 'Cette date n’est pas valide.',
	finAvantDebut: 'La fin d’une expérience ne peut pas précéder son début.',
	obtentionTropLointaine: 'Une date d’obtention ne peut pas dépasser d’un an la date du jour.',
} as const

/** Null when the text is within its bound (or absent), else the refusal. */
export function textMessage(valeur: unknown, maximum: number): string | null {
	if (valeur === null || valeur === undefined) return null
	if (typeof valeur !== 'string') return MESSAGES.pasUnTexte
	return valeur.length > maximum ? MESSAGES.texteTropLong(maximum) : null
}

/**
 * Null when the amount of a price is absent (an offer « sur devis », in free text) or counts as a
 * price (src/lib/price.ts: between PRIX_MIN and PRIX_MAX), else the refusal: a negative amount,
 * zero, an amount out of bounds, anything that is not a number.
 */
export function priceMessage(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null
	return estMontantDePrix(valeur) ? null : MESSAGES.prixHorsBornes
}

// « 2024-03-01 », alone or followed by an hour: the day as it was written.
const WRITTEN_DATE = /^(\d{4})-(\d{2})-(\d{2})(?=$|T)/

/** The first year PostgreSQL stores for these four-digit dates: it has no year 0. */
const MIN_YEAR = 1

const twoDigits = (nombre: number) => String(nombre).padStart(2, '0')

/** « YYYY-MM-DD » of a date in UTC. */
const utcDay = (date: Date) =>
	`${String(date.getUTCFullYear()).padStart(4, '0')}-${twoDigits(date.getUTCMonth() + 1)}-${twoDigits(date.getUTCDate())}`

/**
 * The day a date of these lists stands for, « YYYY-MM-DD », or null when it is not a date. A text
 * gives the day it writes (« 2024-03-01 », or « 2024-03-01T23:30:00-05:00 », still the 1st):
 * the day typed, whatever the time zone of whoever typed it. A Date gives its day in UTC. Anything
 * else, a day that does not exist (« 2024-02-30 »), the year 0 that PostgreSQL does not store and a text in another form are not dates.
 */
export function calendarDay(valeur: unknown): string | null {
	if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : utcDay(valeur)
	if (typeof valeur !== 'string') return null
	const written = WRITTEN_DATE.exec(valeur)
	if (written === null || Number.isNaN(Date.parse(valeur))) return null
	const [, year, month, day] = written.map(Number) as [number, number, number, number]
	// PostgreSQL has no year 0 (1 BC is followed by 1 AD): « 0000-01-01 » would pass here and fail the write.
	if (year < MIN_YEAR) return null
	const date = new Date(Date.UTC(year, month - 1, day))
	date.setUTCFullYear(year)
	return utcDay(date) === written[0] ? written[0] : null
}

/**
 * A date of these lists as it is stored: its day at 12:00 UTC, the hour the date picker of the
 * Payload admin gives a day too. At noon UTC the day stays the same in every time zone from
 * UTC-11 to UTC+11, France included. An empty text is no date (null), as an empty field of a
 * form sends it. Any other value that is not a date is returned as it is, for the validation to
 * refuse it; null and undefined too.
 */
export function dayDate(valeur: unknown): unknown {
	if (valeur === '') return null
	const day = calendarDay(valeur)
	return day === null ? valeur : `${day}T12:00:00.000Z`
}

/** Null when the value is a date (or absent), else the refusal. */
export function dateMessage(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null
	return calendarDay(valeur) === null ? MESSAGES.dateInvalide : null
}

/**
 * Null when the end of an experience is absent, or on its start day or later (plans/02 U30),
 * else the refusal. Without a start, there is nothing to compare: only the end is checked.
 */
export function endMessage(fin: unknown, debut: unknown): string | null {
	const notADate = dateMessage(fin)
	if (notADate !== null) return notADate
	const endDay = calendarDay(fin)
	const startDay = calendarDay(debut)
	return endDay !== null && startDay !== null && endDay < startDay ? MESSAGES.finAvantDebut : null
}

/** The last day a course may be obtained, seen from `maintenant`: the same day, one year later (UTC). */
export function lastDayToObtain(maintenant: Date): string {
	const limit = new Date(maintenant.getTime())
	limit.setUTCFullYear(limit.getUTCFullYear() + 1)
	return utcDay(limit)
}

/**
 * Null when the date a course was obtained is absent, or one year from `maintenant` at the latest
 * (plans/02 U30), else the refusal. A course to come may be listed, not one invented far ahead.
 */
export function obtainMessage(graduatedAt: unknown, maintenant: Date): string | null {
	const notADate = dateMessage(graduatedAt)
	if (notADate !== null) return notADate
	const day = calendarDay(graduatedAt)
	return day !== null && day > lastDayToObtain(maintenant) ? MESSAGES.obtentionTropLointaine : null
}
