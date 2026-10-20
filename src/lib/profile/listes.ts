/**
 * The rules of the list sections of a profile (plans/01 §6.1, docs/migration/SCHEMA.md §6):
 * offers with their options, skills, languages, courses and experiences. One rule per subject,
 * called by the collection (src/collections/profile-lists.ts) and, later, by the forms of the
 * artist's space, which must not compute them again.
 *
 * - The identity of a row: the server gives it, once, and keeps it (`identitesDesLignes`).
 * - The bounds of a value: a text length, an amount of price, a date (`messageDe…`).
 * - A date of these lists is a day, without an hour (`dateDuJour`).
 *
 * Every message is in French: it is what the artist reads when the server refuses a value.
 */

import { estMontantDePrix, formatMontant, PRIX_MAX, PRIX_MIN } from '../prix'

/** Longest name, title or price text of a row (the bounds of the old API and of its forms). */
export const LONGUEUR_NOM = 70
/** Longest description of a row (the bound of the old API and of its forms). */
export const LONGUEUR_DESCRIPTION = 2000

/**
 * The list fields of a profile, each with the lists nested in its rows. Only one level of
 * nesting exists: the options of an offer.
 */
export const LISTES_DU_PROFIL = {
	serviceOffers: ['options'],
	skills: [],
	languages: [],
	courses: [],
	experiences: [],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** A row of a list, or a document that holds lists: what it holds is checked, never assumed. */
export type Ligne = Record<string, unknown>

const estLigne = (valeur: unknown): valeur is Ligne =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

const lignesDe = (valeur: unknown): Ligne[] => (Array.isArray(valeur) ? valeur.filter(estLigne) : [])

const identifiantsDe = (lignes: readonly Ligne[]): ReadonlySet<string> =>
	new Set(lignes.flatMap(({ id }) => (typeof id === 'string' && id !== '' ? [id] : [])))

/**
 * The rows sent, each keeping its identifier only when it is one the server gave to a row of
 * this list (`connus`) and no earlier row of the request holds it already (`vus`). Any other
 * row loses its identifier, and Payload gives it a new one.
 */
function garderLesIdentifiants(recues: unknown[], connus: ReadonlySet<string>, vus: Set<string>): unknown[] {
	return recues.map(ligne => {
		if (!estLigne(ligne)) return ligne
		const { id, ...contenu } = ligne
		if (typeof id !== 'string' || !connus.has(id) || vus.has(id)) return contenu
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
export function identitesDesLignes(recu: Ligne, stocke: Ligne | null | undefined): Ligne {
	const sortie: Ligne = { ...recu }
	for (const [nom, imbriquees] of Object.entries(LISTES_DU_PROFIL)) {
		const recues = recu[nom]
		if (!Array.isArray(recues)) continue
		const stockees = lignesDe(stocke?.[nom])
		let lignes = garderLesIdentifiants(recues, identifiantsDe(stockees), new Set())
		for (const sousListe of imbriquees) {
			const connus = identifiantsDe(stockees.flatMap(ligne => lignesDe(ligne[sousListe])))
			// One set for all the rows: an option keeps its identifier once in the whole profile.
			const vus = new Set<string>()
			lignes = lignes.map(ligne =>
				estLigne(ligne) && Array.isArray(ligne[sousListe])
					? { ...ligne, [sousListe]: garderLesIdentifiants(ligne[sousListe], connus, vus) }
					: ligne
			)
		}
		sortie[nom] = lignes
	}
	return sortie
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
export function messageDeTexte(valeur: unknown, maximum: number): string | null {
	if (valeur === null || valeur === undefined) return null
	if (typeof valeur !== 'string') return MESSAGES.pasUnTexte
	return valeur.length > maximum ? MESSAGES.texteTropLong(maximum) : null
}

/**
 * Null when the amount of a price is absent (an offer « sur devis », in free text) or counts as a
 * price (src/lib/prix.ts: between PRIX_MIN and PRIX_MAX), else the refusal: a negative amount,
 * zero, an amount out of bounds, anything that is not a number.
 */
export function messageDePrix(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null
	return estMontantDePrix(valeur) ? null : MESSAGES.prixHorsBornes
}

// « 2024-03-01 », alone or followed by an hour: the day as it was written.
const DATE_ECRITE = /^(\d{4})-(\d{2})-(\d{2})(?=$|T)/

/** The first year PostgreSQL stores for these four-digit dates: it has no year 0. */
const ANNEE_MIN = 1

const deuxChiffres = (nombre: number) => String(nombre).padStart(2, '0')

/** « YYYY-MM-DD » of a date in UTC. */
const jourUtc = (date: Date) =>
	`${String(date.getUTCFullYear()).padStart(4, '0')}-${deuxChiffres(date.getUTCMonth() + 1)}-${deuxChiffres(date.getUTCDate())}`

/**
 * The day a date of these lists stands for, « YYYY-MM-DD », or null when it is not a date. A text
 * gives the day it writes (« 2024-03-01 », or « 2024-03-01T23:30:00-05:00 », still the 1st):
 * the day typed, whatever the time zone of whoever typed it. A Date gives its day in UTC. Anything
 * else, a day that does not exist (« 2024-02-30 »), the year 0 that PostgreSQL does not store and a text in another form are not dates.
 */
export function jourCalendaire(valeur: unknown): string | null {
	if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : jourUtc(valeur)
	if (typeof valeur !== 'string') return null
	const ecrit = DATE_ECRITE.exec(valeur)
	if (ecrit === null || Number.isNaN(Date.parse(valeur))) return null
	const [, annee, mois, jour] = ecrit.map(Number) as [number, number, number, number]
	// PostgreSQL has no year 0 (1 BC is followed by 1 AD): « 0000-01-01 » would pass here and fail the write.
	if (annee < ANNEE_MIN) return null
	const date = new Date(Date.UTC(annee, mois - 1, jour))
	date.setUTCFullYear(annee)
	return jourUtc(date) === ecrit[0] ? ecrit[0] : null
}

/**
 * A date of these lists as it is stored: its day at 12:00 UTC, the hour the date picker of the
 * Payload admin gives a day too. At noon UTC the day stays the same in every time zone from
 * UTC-11 to UTC+11, France included. An empty text is no date (null), as an empty field of a
 * form sends it. Any other value that is not a date is returned as it is, for the validation to
 * refuse it; null and undefined too.
 */
export function dateDuJour(valeur: unknown): unknown {
	if (valeur === '') return null
	const jour = jourCalendaire(valeur)
	return jour === null ? valeur : `${jour}T12:00:00.000Z`
}

/** Null when the value is a date (or absent), else the refusal. */
export function messageDeDate(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null
	return jourCalendaire(valeur) === null ? MESSAGES.dateInvalide : null
}

/**
 * Null when the end of an experience is absent, or on its start day or later (plans/02 U30),
 * else the refusal. Without a start, there is nothing to compare: only the end is checked.
 */
export function messageDeFin(fin: unknown, debut: unknown): string | null {
	const pasUneDate = messageDeDate(fin)
	if (pasUneDate !== null) return pasUneDate
	const jourDeFin = jourCalendaire(fin)
	const jourDeDebut = jourCalendaire(debut)
	return jourDeFin !== null && jourDeDebut !== null && jourDeFin < jourDeDebut ? MESSAGES.finAvantDebut : null
}

/** The last day a course may be obtained, seen from `maintenant`: the same day, one year later (UTC). */
export function dernierJourDObtention(maintenant: Date): string {
	const limite = new Date(maintenant.getTime())
	limite.setUTCFullYear(limite.getUTCFullYear() + 1)
	return jourUtc(limite)
}

/**
 * Null when the date a course was obtained is absent, or one year from `maintenant` at the latest
 * (plans/02 U30), else the refusal. A course to come may be listed, not one invented far ahead.
 */
export function messageDObtention(graduatedAt: unknown, maintenant: Date): string | null {
	const pasUneDate = messageDeDate(graduatedAt)
	if (pasUneDate !== null) return pasUneDate
	const jour = jourCalendaire(graduatedAt)
	return jour !== null && jour > dernierJourDObtention(maintenant) ? MESSAGES.obtentionTropLointaine : null
}
