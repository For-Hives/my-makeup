/**
 * The weekly statistics (ticket 149; plan 04 §3.6): what GET /api/stats/weekly answers to the
 * weekly report of the owner. Aggregates only: counts, and the slugs of the profiles a visitor can
 * see, which are public addresses already. No name, no email, no phone, no account identifier.
 *
 * Three pieces, none of which reads the database or the request:
 * - `StatsHebdo`, the schema of the answer, strict: an unknown key is refused. The report tool
 *   (plans/mesures/outil) has no dependency and cannot import it; it validates the same shape by
 *   hand, and both sides test the published example (docs/mesure/stats-hebdo.exemple.json).
 * - `lirePeriode`, the period asked for.
 * - `agregerStats`, the counts, from the profiles and the account dates the caller read.
 *
 * Version 2 (ticket 253): the keys are English, and so are the keys of the counters that are values of
 * the closed lists of the database (renamed by tickets 250 to 252). The codes of the sign-in
 * outcomes (`byCode`) are those of the journal and stay as they are. Version 1 is gone: a reader that
 * does not know `version: 2` must refuse the answer, not read zeros.
 *
 * Optional keys came later (169: contact messages, sign-ins, inherited hashes; 212 and 213 next):
 * a reader of `version: 2` must keep working on an answer that has fewer of them.
 *
 * Relative imports on purpose, like the rest of src/lib: no `next` import.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { EVENT_CODES, EVENT_TYPES } from './auth/auth-log'
import { ETATS_DU_MAIL, STATUTS_DE_DEMANDE } from './contact/etats'
import { completeness } from './profile/completeness'
import { type ProfileDocument, profileFields } from './profile/state'

/** A published profile has this status; the rest is a draft or hidden. */
const STATUT_PUBLIE = 'published'

export const VERSION_STATS = 2

/** 28 days: the window of the cohort of chiffre 6, before the week. */
const JOURS_DE_LA_COHORTE = 28
/** 90 days: « modified recently ». */
const JOURS_DE_FRAICHEUR = 90
/** The longest period the route answers for. */
export const PERIODE_MAX_JOURS = 92

const JOUR_MS = 86_400_000

const compte = z.number().int().nonnegative()
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)

export const StatsHebdo = z.strictObject({
	version: z.literal(VERSION_STATS),
	/** The period asked for, `start` included, `end` excluded, as UTC instants. */
	period: z.strictObject({ start: instant, end: instant }),
	generatedAt: instant,
	accounts: z.strictObject({
		total: compte,
		/** Created in the period. */
		new: compte,
	}),
	profiles: z.strictObject({
		total: compte,
		/** None of the six conditions: counted apart, and inside `total`. */
		fullyEmpty: compte,
		/** Main photo, usable city and speciality. */
		active: compte,
		/** The six conditions AND shown on the site: a hidden or draft profile is not counted. */
		publishable: compte,
		/** Hidden by an admin. */
		hidden: compte,
		/** At least 11 criteria out of 13. */
		complete11: compte,
		/** 2 criteria out of 13, or fewer. */
		nearlyEmpty: compte,
		/** No contact channel. */
		noChannel: compte,
		/** Modified in the 90 days before the end of the period. */
		modified90d: compte,
		/** Created in the period. */
		created: compte,
	}),
	/** The profiles created in the 28 days before the period, and how many are active today. */
	cohort: z.strictObject({ profiles: compte, active: compte }),
	/** The profiles created in the period, one by one: no name, only the state. */
	signUps: z.array(
		z.strictObject({
			createdOn: jour,
			completeness: z.number().int().min(0).max(13),
			active: z.boolean(),
			publishable: z.boolean(),
		})
	),
	/** The only detail that is given on a profile, and only for those a visitor can see. */
	publishable: z.strictObject({
		/** Count by department code; `unknown` when the commune has none. */
		byDepartment: z.record(z.string(), compte),
		slugs: z.array(z.string()),
	}),
	/** Ticket 169. The contact messages received in the period: counts by status and by mail state. */
	contact: z
		.strictObject({
			total: compte,
			byStatus: z.record(z.string(), compte),
			byMailState: z.record(z.string(), compte),
		})
		.optional(),
	/**
	 * Ticket 169. The authentication events of the period, from the journal (no IP, no email: the
	 * journal holds none). `signIns` is the `sign-in` events alone.
	 */
	auth: z
		.strictObject({
			byType: z.record(z.string(), compte),
			signIns: z.strictObject({
				total: compte,
				byCode: z.record(z.string(), compte),
				/** 95th percentile of the duration of a sign-in, in ms (nearest rank); null without any duration. */
				durationP95Ms: compte.nullable(),
			}),
		})
		.optional(),
	/**
	 * Ticket 169, for the follow-up M6 of plan 01 §2.4. A snapshot of today, not of the period:
	 * the hashes of the old site still stored, and the accounts that never had a password of their
	 * own, by provider of the old site.
	 */
	inherited: z
		.strictObject({
			remainingHashes: compte,
			/**
			 * Accounts of a provider other than `local` with no inherited hash, by `legacyProvider` (`google`,
			 * `facebook`, `other`). Payload keeps no mark of a password set later (reset link): those stay counted.
			 */
			withoutPasswordByProvider: z.record(z.string(), compte),
		})
		.optional(),
})

export type StatsHebdo = z.infer<typeof StatsHebdo>

/** The period asked for, as instants; `fin` is excluded. */
export interface Periode {
	debut: Date
	fin: Date
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function lireInstant(valeur: string | null): Date | undefined {
	if (valeur === null || !ISO_UTC.test(valeur)) return undefined
	const date = new Date(valeur)
	return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * `from` and `to` of the query: two ISO 8601 instants with their offset, `from` before `to`, at
 * most 92 days apart. Anything else is refused (400): no default period.
 */
export function lirePeriode(parametres: URLSearchParams): Periode | undefined {
	if (parametres.getAll('from').length !== 1 || parametres.getAll('to').length !== 1) return undefined
	const debut = lireInstant(parametres.get('from'))
	const fin = lireInstant(parametres.get('to'))
	if (!debut || !fin || debut >= fin) return undefined
	if (fin.getTime() - debut.getTime() > PERIODE_MAX_JOURS * JOUR_MS) return undefined
	return { debut, fin }
}

/** What the aggregation reads of a profile. */
export interface ProfilPourStats extends ProfileDocument {
	slug?: string | null
	createdAt: string
	updatedAt: string
	status?: string | null
	completeness?: number | null
	active?: boolean | null
	publishable?: boolean | null
	fullyEmpty?: boolean | null
	city?: { name?: string | null; inseeCode?: string | null; department?: string | null } | null
}

const PARIS = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Paris',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
})

/** The day of an instant in Paris, `AAAA-MM-JJ`. */
export function jourParis(date: Date): string {
	return PARIS.format(date)
}

const dans = (date: Date, debut: Date, fin: Date): boolean => date >= debut && date < fin

/**
 * The counts. `maintenant` caps the end of the freshness window, so a period in the future does
 * not widen it.
 */
export function agregerStats({
	profils,
	datesDesComptes,
	periode,
	maintenant,
}: {
	profils: readonly ProfilPourStats[]
	datesDesComptes: readonly string[]
	periode: Periode
	maintenant: Date
}): StatsHebdo {
	const finFraicheur = new Date(Math.min(periode.fin.getTime(), maintenant.getTime()))
	const debutFraicheur = new Date(finFraicheur.getTime() - JOURS_DE_FRAICHEUR * JOUR_MS)
	const debutCohorte = new Date(periode.debut.getTime() - JOURS_DE_LA_COHORTE * JOUR_MS)

	const resume = {
		total: profils.length,
		fullyEmpty: 0,
		active: 0,
		publishable: 0,
		hidden: 0,
		complete11: 0,
		nearlyEmpty: 0,
		noChannel: 0,
		modified90d: 0,
		created: 0,
	}
	const cohorte = { profiles: 0, active: 0 }
	const inscriptions: StatsHebdo['signUps'] = []
	const parDepartement: Record<string, number> = {}
	const slugs: string[] = []

	for (const profil of profils) {
		const lecture = completeness(profileFields(profil))
		const creeLe = new Date(profil.createdAt)
		const actif = profil.active === true
		const publiable = profil.publishable === true
		const score = typeof profil.completeness === 'number' ? profil.completeness : lecture.score
		if (profil.fullyEmpty === true) resume.fullyEmpty++
		if (actif) resume.active++
		if (profil.status === 'hidden') resume.hidden++
		if (score >= 11) resume.complete11++
		if (score <= 2) resume.nearlyEmpty++
		if (lecture.manquants.includes('reseaux')) resume.noChannel++
		if (dans(new Date(profil.updatedAt), debutFraicheur, finFraicheur)) resume.modified90d++
		if (dans(creeLe, periode.debut, periode.fin)) {
			resume.created++
			inscriptions.push({ createdOn: jourParis(creeLe), completeness: score, active: actif, publishable: publiable })
		}
		if (dans(creeLe, debutCohorte, periode.debut)) {
			cohorte.profiles++
			if (actif) cohorte.active++
		}
		if (publiable && profil.status === STATUT_PUBLIE && typeof profil.slug === 'string') {
			resume.publishable++
			slugs.push(profil.slug)
			const departement = profil.city?.department || 'unknown'
			parDepartement[departement] = (parDepartement[departement] ?? 0) + 1
		}
	}

	return {
		version: VERSION_STATS,
		period: { start: periode.debut.toISOString(), end: periode.fin.toISOString() },
		generatedAt: maintenant.toISOString(),
		accounts: {
			total: datesDesComptes.length,
			new: datesDesComptes.filter(date => dans(new Date(date), periode.debut, periode.fin)).length,
		},
		profiles: resume,
		cohort: cohorte,
		signUps: inscriptions.sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.completeness - b.completeness),
		publishable: {
			byDepartment: Object.fromEntries(Object.entries(parDepartement).sort(([a], [b]) => a.localeCompare(b))),
			slugs: slugs.sort(),
		},
	}
}

/** The closed lists, as counters at zero: a count that is zero is in the answer, not missing from it. */
const compteurs = (cles: readonly string[]): Record<string, number> => Object.fromEntries(cles.map(cle => [cle, 0]))

/** Adds one to a counter that is in the list; a key outside it is ignored. */
function ajouter(compteur: Record<string, number>, cle: unknown): boolean {
	if (typeof cle !== 'string' || !Object.hasOwn(compteur, cle)) return false
	compteur[cle] = (compteur[cle] ?? 0) + 1
	return true
}

/** What the count of the messages reads of a row of `contact-requests`: two closed lists, nothing typed by a visitor. */
export interface DemandePourStats {
	status?: string | null
	mailStatus?: string | null
}

/** Contact messages received in the period (the caller read them): counts by status and by mail state. */
export function agregerContact(demandes: readonly DemandePourStats[]): NonNullable<StatsHebdo['contact']> {
	const byStatus = compteurs(STATUTS_DE_DEMANDE)
	const byMailState = compteurs(ETATS_DU_MAIL)
	for (const { status, mailStatus } of demandes) {
		ajouter(byStatus, status)
		ajouter(byMailState, mailStatus)
	}
	return { total: demandes.length, byStatus, byMailState }
}

/** What the count of the sign-ins reads of a row of the journal. */
export interface EvenementPourStats {
	type?: string | null
	code?: string | null
	durationMs?: number | null
}

/** Nearest-rank percentile of a list of durations; null for an empty list. */
export function centile(valeurs: readonly number[], p: number): number | null {
	if (valeurs.length === 0) return null
	const tries = [...valeurs].sort((a, b) => a - b)
	return tries[Math.max(0, Math.ceil(p * tries.length) - 1)] ?? null
}

/** Authentication events of the period (the caller read them): by kind, and the sign-ins by outcome with their 95th percentile. */
export function agregerAuth(evenements: readonly EvenementPourStats[]): NonNullable<StatsHebdo['auth']> {
	const byType = compteurs(EVENT_TYPES)
	const byCode = compteurs(EVENT_CODES)
	const durees: number[] = []
	let total = 0
	for (const { type, code, durationMs } of evenements) {
		if (!ajouter(byType, type) || type !== 'sign-in') continue
		total++
		ajouter(byCode, code)
		if (typeof durationMs === 'number') durees.push(durationMs)
	}
	const p95 = centile(durees, 0.95)
	return { byType, signIns: { total, byCode, durationP95Ms: p95 === null ? null : Math.round(p95) } }
}

/**
 * The providers of the old site whose accounts the report counts without a password; any other value
 * but `local` is `other`. A `local` account has no place here: it had a password on the old site, so
 * once its hash is gone it has signed in and has a password of Payload's.
 */
export const FOURNISSEURS_HERITES = ['google', 'facebook', 'other'] as const

/** The token of an `Authorization: Bearer` header, or nothing. */
export function jetonDeLEntete(entete: string | null): string | undefined {
	const [schema, jeton, ...reste] = (entete ?? '').split(' ')
	return schema === 'Bearer' && jeton && reste.length === 0 ? jeton : undefined
}

/** True when the header carries exactly the token of the service. Constant time; false without a configured token. */
export function jetonValide(entete: string | null, attendu: string | undefined): boolean {
	const recu = jetonDeLEntete(entete)
	if (!attendu || !recu) return false
	const empreinte = (texte: string) => createHash('sha256').update(texte).digest()
	return timingSafeEqual(empreinte(recu), empreinte(attendu))
}
