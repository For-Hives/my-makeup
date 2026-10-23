/**
 * The weekly statistics (ticket 149; plan 04 §3.6): what GET /api/stats/weekly answers to the
 * weekly report of the owner. Aggregates only: counts, and the slugs of the profiles a visitor can
 * see, which are public addresses already. No name, no email, no phone, no account identifier.
 *
 * Three pieces, none of which reads the database or the request:
 * - `WeeklyStats`, the schema of the answer, strict: an unknown key is refused. The report tool
 *   (plans/mesures/outil) has no dependency and cannot import it; it validates the same shape by
 *   hand, and both sides test the published example (docs/mesure/stats-hebdo.exemple.json).
 * - `readPeriod`, the period asked for.
 * - `aggregateStats`, the counts, from the profiles and the account dates the caller read.
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
import { MAIL_STATES, REQUEST_STATUSES } from './contact/states'
import { completeness } from './profile/completeness'
import { type ProfileDocument, profileFields } from './profile/state'

/** A published profile has this status; the rest is a draft or hidden. */
const PUBLISHED_STATUS = 'published'

export const VERSION_STATS = 2

/** 28 days: the window of the cohort of chiffre 6, before the week. */
const COHORT_DAYS = 28
/** 90 days: « modified recently ». */
const FRESHNESS_DAYS = 90
/** The longest period the route answers for. */
export const PERIOD_MAX_DAYS = 92

const DAY_MS = 86_400_000

const account = z.number().int().nonnegative()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)

export const WeeklyStats = z.strictObject({
	version: z.literal(VERSION_STATS),
	/** The period asked for, `start` included, `end` excluded, as UTC instants. */
	period: z.strictObject({ start: instant, end: instant }),
	generatedAt: instant,
	accounts: z.strictObject({
		total: account,
		/** Created in the period. */
		new: account,
	}),
	profiles: z.strictObject({
		total: account,
		/** None of the six conditions: counted apart, and inside `total`. */
		fullyEmpty: account,
		/** Main photo, usable city and speciality. */
		active: account,
		/** The six conditions AND shown on the site: a hidden or draft profile is not counted. */
		publishable: account,
		/** Hidden by an admin. */
		hidden: account,
		/** At least 11 criteria out of 13. */
		complete11: account,
		/** 2 criteria out of 13, or fewer. */
		nearlyEmpty: account,
		/** No contact channel. */
		noChannel: account,
		/** Modified in the 90 days before the end of the period. */
		modified90d: account,
		/** Created in the period. */
		created: account,
	}),
	/** The profiles created in the 28 days before the period, and how many are active today. */
	cohort: z.strictObject({ profiles: account, active: account }),
	/** The profiles created in the period, one by one: no name, only the state. */
	signUps: z.array(
		z.strictObject({
			createdOn: day,
			completeness: z.number().int().min(0).max(13),
			active: z.boolean(),
			publishable: z.boolean(),
		})
	),
	/** The only detail that is given on a profile, and only for those a visitor can see. */
	publishable: z.strictObject({
		/** Count by department code; `unknown` when the commune has none. */
		byDepartment: z.record(z.string(), account),
		slugs: z.array(z.string()),
	}),
	/** Ticket 169. The contact messages received in the period: counts by status and by mail state. */
	contact: z
		.strictObject({
			total: account,
			byStatus: z.record(z.string(), account),
			byMailState: z.record(z.string(), account),
		})
		.optional(),
	/**
	 * Ticket 169. The authentication events of the period, from the journal (no IP, no email: the
	 * journal holds none). `signIns` is the `sign-in` events alone.
	 */
	auth: z
		.strictObject({
			byType: z.record(z.string(), account),
			signIns: z.strictObject({
				total: account,
				byCode: z.record(z.string(), account),
				/** 95th percentile of the duration of a sign-in, in ms (nearest rank); null without any duration. */
				durationP95Ms: account.nullable(),
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
			remainingHashes: account,
			/**
			 * Accounts of a provider other than `local` with no inherited hash, by `legacyProvider` (`google`,
			 * `facebook`, `other`). Payload keeps no mark of a password set later (reset link): those stay counted.
			 */
			withoutPasswordByProvider: z.record(z.string(), account),
		})
		.optional(),
	/**
	 * Issue 1002. The searches of the period, counted by day with no text: how many, how many with a
	 * city, how many found nobody, the share of those (`null` without any search), and the same by
	 * département (`unknown` when the search points at none or at several).
	 */
	searches: z
		.strictObject({
			total: account,
			withCity: account,
			noResult: account,
			noResultShare: z.number().min(0).max(1).nullable(),
			byDepartment: z.record(z.string(), z.strictObject({ total: account, noResult: account })),
		})
		.optional(),
})

export type WeeklyStats = z.infer<typeof WeeklyStats>

/** The period asked for, as instants; `fin` is excluded. */
export interface Period {
	debut: Date
	fin: Date
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function readInstant(valeur: string | null): Date | undefined {
	if (valeur === null || !ISO_UTC.test(valeur)) return undefined
	const date = new Date(valeur)
	return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * `from` and `to` of the query: two ISO 8601 instants with their offset, `from` before `to`, at
 * most 92 days apart. Anything else is refused (400): no default period.
 */
export function readPeriod(parametres: URLSearchParams): Period | undefined {
	if (parametres.getAll('from').length !== 1 || parametres.getAll('to').length !== 1) return undefined
	const start = readInstant(parametres.get('from'))
	const end = readInstant(parametres.get('to'))
	if (!start || !end || start >= end) return undefined
	if (end.getTime() - start.getTime() > PERIOD_MAX_DAYS * DAY_MS) return undefined
	return { debut: start, fin: end }
}

/** What the aggregation reads of a profile. */
export interface ProfileForStats extends ProfileDocument {
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
export function parisDay(date: Date): string {
	return PARIS.format(date)
}

const inside = (date: Date, debut: Date, fin: Date): boolean => date >= debut && date < fin

/**
 * The counts. `maintenant` caps the end of the freshness window, so a period in the future does
 * not widen it.
 */
export function aggregateStats({
	profils,
	datesDesComptes,
	periode,
	maintenant,
}: {
	profils: readonly ProfileForStats[]
	datesDesComptes: readonly string[]
	periode: Period
	maintenant: Date
}): WeeklyStats {
	const freshnessEnd = new Date(Math.min(periode.fin.getTime(), maintenant.getTime()))
	const freshnessStart = new Date(freshnessEnd.getTime() - FRESHNESS_DAYS * DAY_MS)
	const cohortStart = new Date(periode.debut.getTime() - COHORT_DAYS * DAY_MS)

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
	const cohort = { profiles: 0, active: 0 }
	const signUps: WeeklyStats['signUps'] = []
	const byDepartment: Record<string, number> = {}
	const slugs: string[] = []

	for (const profile of profils) {
		const reading = completeness(profileFields(profile))
		const createdAt = new Date(profile.createdAt)
		const active = profile.active === true
		const publishable = profile.publishable === true
		const score = typeof profile.completeness === 'number' ? profile.completeness : reading.score
		if (profile.fullyEmpty === true) resume.fullyEmpty++
		if (active) resume.active++
		if (profile.status === 'hidden') resume.hidden++
		if (score >= 11) resume.complete11++
		if (score <= 2) resume.nearlyEmpty++
		if (reading.manquants.includes('reseaux')) resume.noChannel++
		if (inside(new Date(profile.updatedAt), freshnessStart, freshnessEnd)) resume.modified90d++
		if (inside(createdAt, periode.debut, periode.fin)) {
			resume.created++
			signUps.push({ createdOn: parisDay(createdAt), completeness: score, active: active, publishable: publishable })
		}
		if (inside(createdAt, cohortStart, periode.debut)) {
			cohort.profiles++
			if (active) cohort.active++
		}
		if (publishable && profile.status === PUBLISHED_STATUS && typeof profile.slug === 'string') {
			resume.publishable++
			slugs.push(profile.slug)
			const department = profile.city?.department || 'unknown'
			byDepartment[department] = (byDepartment[department] ?? 0) + 1
		}
	}

	return {
		version: VERSION_STATS,
		period: { start: periode.debut.toISOString(), end: periode.fin.toISOString() },
		generatedAt: maintenant.toISOString(),
		accounts: {
			total: datesDesComptes.length,
			new: datesDesComptes.filter(date => inside(new Date(date), periode.debut, periode.fin)).length,
		},
		profiles: resume,
		cohort: cohort,
		signUps: signUps.sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.completeness - b.completeness),
		publishable: {
			byDepartment: Object.fromEntries(Object.entries(byDepartment).sort(([a], [b]) => a.localeCompare(b))),
			slugs: slugs.sort(),
		},
	}
}

/** The closed lists, as counters at zero: a count that is zero is in the answer, not missing from it. */
const counters = (cles: readonly string[]): Record<string, number> => Object.fromEntries(cles.map(cle => [cle, 0]))

/** Adds one to a counter that is in the list; a key outside it is ignored. */
function add(compteur: Record<string, number>, cle: unknown): boolean {
	if (typeof cle !== 'string' || !Object.hasOwn(compteur, cle)) return false
	compteur[cle] = (compteur[cle] ?? 0) + 1
	return true
}

/** What the count of the messages reads of a row of `contact-requests`: two closed lists, nothing typed by a visitor. */
export interface RequestForStats {
	status?: string | null
	mailStatus?: string | null
}

/** Contact messages received in the period (the caller read them): counts by status and by mail state. */
export function aggregateContact(demandes: readonly RequestForStats[]): NonNullable<WeeklyStats['contact']> {
	const byStatus = counters(REQUEST_STATUSES)
	const byMailState = counters(MAIL_STATES)
	for (const { status, mailStatus } of demandes) {
		add(byStatus, status)
		add(byMailState, mailStatus)
	}
	return { total: demandes.length, byStatus, byMailState }
}

/** What the count of the searches reads of a row of `search-counts`: numbers and a code of the list. */
export interface SearchCountForStats {
	department?: string | null
	total?: number | string | null
	withCity?: number | string | null
	noResult?: number | string | null
}

const whole = (valeur: unknown): number => {
	const n = Number(valeur)
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** The searches of the period (the caller read the daily rows): totals, share without result, and by département. */
export function aggregateSearches(rows: readonly SearchCountForStats[]): NonNullable<WeeklyStats['searches']> {
	let total = 0
	let withCity = 0
	let noResult = 0
	const byDepartment: Record<string, { total: number; noResult: number }> = {}
	for (const row of rows) {
		const counts = { total: whole(row.total), withCity: whole(row.withCity), noResult: whole(row.noResult) }
		total += counts.total
		withCity += counts.withCity
		noResult += counts.noResult
		const key = row.department || 'unknown'
		const kept = byDepartment[key] ?? { total: 0, noResult: 0 }
		kept.total += counts.total
		kept.noResult += counts.noResult
		byDepartment[key] = kept
	}
	return {
		total,
		withCity,
		noResult,
		noResultShare: total === 0 ? null : Math.round((noResult / total) * 1000) / 1000,
		byDepartment: Object.fromEntries(Object.entries(byDepartment).sort(([a], [b]) => a.localeCompare(b))),
	}
}

/** What the count of the sign-ins reads of a row of the journal. */
export interface EventForStats {
	type?: string | null
	code?: string | null
	durationMs?: number | null
}

/** Nearest-rank percentile of a list of durations; null for an empty list. */
export function percentile(valeurs: readonly number[], p: number): number | null {
	if (valeurs.length === 0) return null
	const tries = [...valeurs].sort((a, b) => a - b)
	return tries[Math.max(0, Math.ceil(p * tries.length) - 1)] ?? null
}

/** Authentication events of the period (the caller read them): by kind, and the sign-ins by outcome with their 95th percentile. */
export function aggregateAuth(evenements: readonly EventForStats[]): NonNullable<WeeklyStats['auth']> {
	const byType = counters(EVENT_TYPES)
	const byCode = counters(EVENT_CODES)
	const durations: number[] = []
	let total = 0
	for (const { type, code, durationMs } of evenements) {
		if (!add(byType, type) || type !== 'sign-in') continue
		total++
		add(byCode, code)
		if (typeof durationMs === 'number') durations.push(durationMs)
	}
	const p95 = percentile(durations, 0.95)
	return { byType, signIns: { total, byCode, durationP95Ms: p95 === null ? null : Math.round(p95) } }
}

/**
 * The providers of the old site whose accounts the report counts without a password; any other value
 * but `local` is `other`. A `local` account has no place here: it had a password on the old site, so
 * once its hash is gone it has signed in and has a password of Payload's.
 */
export const LEGACY_PROVIDERS = ['google', 'facebook', 'other'] as const

/** The token of an `Authorization: Bearer` header, or nothing. */
export function headerToken(entete: string | null): string | undefined {
	const [schema, token, ...rest] = (entete ?? '').split(' ')
	return schema === 'Bearer' && token && rest.length === 0 ? token : undefined
}

/** True when the header carries exactly the token of the service. Constant time; false without a configured token. */
export function tokenValid(entete: string | null, attendu: string | undefined): boolean {
	const received = headerToken(entete)
	if (!attendu || !received) return false
	const fingerprint = (texte: string) => createHash('sha256').update(texte).digest()
	return timingSafeEqual(fingerprint(received), fingerprint(attendu))
}
