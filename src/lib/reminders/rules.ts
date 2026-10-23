/**
 * Who would be reminded, and who is inactive (issue 1006). The rules, apart from the database, so that
 * the daily task, the report and the tests say the same thing. Pure: no `next` import, no Payload.
 *
 * Two lists, both only drawn up, never acted on by this file:
 * - the profiles that miss one or two of the six conditions of a publishable profile
 *   (`publishableConditions`, the single rule of src/lib/profile/completeness.ts, never recomputed here);
 * - the accounts with no activity for 24 calendar months.
 *
 * Relative imports on purpose: the Payload CLI and the scripts load this file outside of Next.
 */

import { monthsBefore } from '../calendar'
import { isInternal, type PublishableConditions, publishableConditions } from '../profile/completeness'
import { type ProfileDocument, profileFields } from '../profile/state'

/** A profile she changed less than this many days ago is left in peace: she is probably still on it. */
export const REMINDER_IDLE_DAYS = 14

/** One reminder at most for each period of this many days, for a profile. */
export const REMINDER_PERIOD_DAYS = 90

/** The most reminders that leave in one day, however many are due. */
export const REMINDERS_PER_DAY = 20

/** An account with no activity for this many calendar months is on the list of the rule of inactivity. */
export const INACTIVITY_MONTHS = 24

/** A report is kept this many days, then deleted (as the counters of views). */
export const REPORT_RETENTION_DAYS = 92

/** A reminder is « close to publishable »: it misses at least one and at most this many conditions. */
export const MISSING_MAX = 2

const DAY_MS = 86_400_000

/** What the rules read about one profile and its account. Dates as stored: ISO strings. */
export interface ReminderSubject {
	profileId: number
	/** `draft`, `published` or `hidden`. */
	status: string
	document: ProfileDocument
	/** When the profile was last saved. */
	profileUpdatedAt: string
	account: {
		verified: boolean
		blocked: boolean
		/** The last sign-in; `null` for an account that never signed in, or came from the old site. */
		lastSignInAt: string | null
		createdAt: string
	}
	/** What the reminders know of her: `null` when none was ever sent and she never unsubscribed. */
	state: { lastSentAt: string | null; unsubscribedAt: string | null } | null
}

export type MissingCondition = keyof PublishableConditions

/** Her words for each condition, in the tone of her space (« tu »). */
export const CONDITION_TEXTS: Record<MissingCondition, string> = {
	photoPrincipale: 'une photo principale',
	villeExploitable: 'une ville ou une zone d’intervention',
	specialite: 'ta spécialité',
	offreChiffree: 'une prestation avec un prix',
	descriptionLongue: 'une description d’au moins 200 caractères',
	canalDeContact: 'un moyen de te contacter',
}

const time = (value: string): number => new Date(value).getTime()

/** True when the account can be written to or counted at all: a confirmed, unblocked account whose page the team did not hide. */
function listable(subject: ReminderSubject): boolean {
	return subject.status !== 'hidden' && subject.account.verified && !subject.account.blocked
}

/** The conditions of a publishable profile that this profile does not meet, in the display order. */
export function unmetConditions(subject: ReminderSubject): MissingCondition[] {
	const conditions = publishableConditions(profileFields(subject.document))
	return (Object.keys(conditions) as MissingCondition[]).filter(name => !conditions[name])
}

/**
 * What a reminder would say she lacks, or an empty list when she is not to be reminded today.
 *
 * She is, when: her page is not hidden, her account confirmed and not blocked, she is not an internal
 * account, she did not unsubscribe, she misses one or two conditions (not three or more: she is far
 * from it; not none: she is publishable), she did not change her profile in the last 14 days, and no
 * reminder was sent to her in the last 90 days.
 */
export function missingConditions(subject: ReminderSubject, now: Date): MissingCondition[] {
	if (!listable(subject)) return []
	if (isInternal(profileFields(subject.document))) return []
	if (subject.state?.unsubscribedAt) return []
	if (time(subject.profileUpdatedAt) > now.getTime() - REMINDER_IDLE_DAYS * DAY_MS) return []
	const lastSentAt = subject.state?.lastSentAt
	if (lastSentAt && time(lastSentAt) > now.getTime() - REMINDER_PERIOD_DAYS * DAY_MS) return []
	const missing = unmetConditions(subject)
	return missing.length >= 1 && missing.length <= MISSING_MAX ? missing : []
}

/** The instant before which a last activity is more than 24 calendar months old. */
export function inactivityThreshold(now: Date): Date {
	return monthsBefore(now, INACTIVITY_MONTHS)
}

/**
 * The last time anything happened: the latest of her last sign-in, the last save of her profile and the
 * creation of her account. An account from the old site has no sign-in date from before the switch, so
 * it counts from the switch at the earliest (its creation date in this site): the list is empty until
 * 24 months after it, which is the cautious side.
 */
export function lastActivity(subject: ReminderSubject): number {
	return Math.max(
		time(subject.account.createdAt),
		time(subject.profileUpdatedAt),
		subject.account.lastSignInAt ? time(subject.account.lastSignInAt) : Number.NEGATIVE_INFINITY
	)
}

/**
 * True when the account has had no activity for more than 24 calendar months: exactly 24 months is not yet
 * inactive. The rule only lists; it hides, deletes and writes to nobody. Hidden pages, blocked and
 * unconfirmed accounts and internal accounts are not on the list.
 */
export function isInactive(subject: ReminderSubject, now: Date): boolean {
	if (!listable(subject)) return false
	if (isInternal(profileFields(subject.document))) return false
	return lastActivity(subject) < inactivityThreshold(now).getTime()
}
