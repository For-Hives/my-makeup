/**
 * Who would receive the mail to the members, and what each profile lacks (issue 998). The rules, apart from the
 * database, so that the dry-run list, the real send and the tests say the same thing. Pure: no `next` import,
 * no Payload.
 *
 * The audience: a confirmed, unblocked account, not an internal account of the team, that did not unsubscribe
 * (the unsubscribe of the reminders, issue 1006: the consent to the service mails is respected as it was given)
 * and that is not already in the send log. A profile the team hid is not read (the store leaves it out).
 *
 * What a profile lacks is `unmetConditions` of src/lib/reminders/rules.ts, which reads the single rule of
 * src/lib/profile/completeness.ts: nothing is recomputed here. Unlike the reminders, there is no limit on how
 * many conditions are missing, no idle period and no 90-day period: it is one mail for everybody.
 *
 * Relative imports on purpose: the scripts load this file outside of Next.
 */

import { isInternal } from '../profile/completeness'
import { profileFields } from '../profile/state'
import {
	type GoogleSuggestion,
	googleSuggestions,
	type MissingCondition,
	type ReminderSubject,
	unmetConditions,
} from '../reminders/rules'

/** Why an account is left out. An account is counted under the first reason that applies, in this order. */
export const EXCLUSION_REASONS = ['unconfirmed', 'blocked', 'unsubscribed', 'internal', 'alreadyHandled'] as const

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number]

export const CONDITIONS: readonly MissingCondition[] = [
	'photoPrincipale',
	'villeExploitable',
	'specialite',
	'canalDeContact',
]

export interface Recipient {
	profileId: number
	/** What her profile lacks to be publishable, in the display order; empty when it lacks nothing. */
	missing: MissingCondition[]
	/** What she could add to be better referenced on Google (suggestions, not conditions); empty when nothing. */
	forGoogle: GoogleSuggestion[]
}

export interface MembersPlan {
	/** Profiles read (the hidden ones are not read). */
	profilesRead: number
	/** The recipients, by profile number. */
	eligible: Recipient[]
	excluded: Record<ExclusionReason, number>
	/** Recipients whose profile already meets the four conditions. */
	completeProfiles: number
	/** For each condition, how many recipients lack it. */
	missingByCondition: Record<MissingCondition, number>
}

function reasonToLeaveOut(subject: ReminderSubject, handled: ReadonlySet<number>): ExclusionReason | undefined {
	if (!subject.account.verified) return 'unconfirmed'
	if (subject.account.blocked) return 'blocked'
	if (subject.state?.unsubscribedAt) return 'unsubscribed'
	if (isInternal(profileFields(subject.document))) return 'internal'
	if (handled.has(subject.profileId)) return 'alreadyHandled'
	return undefined
}

/** `handled`: the profiles already in the send log (sent, failed or started): never written to twice. */
export function planMembersMail(subjects: readonly ReminderSubject[], handled: ReadonlySet<number>): MembersPlan {
	const excluded = Object.fromEntries(EXCLUSION_REASONS.map(reason => [reason, 0])) as Record<ExclusionReason, number>
	const missingByCondition = Object.fromEntries(CONDITIONS.map(condition => [condition, 0])) as Record<
		MissingCondition,
		number
	>
	const eligible: Recipient[] = []
	let completeProfiles = 0
	for (const subject of subjects) {
		const reason = reasonToLeaveOut(subject, handled)
		if (reason) {
			excluded[reason]++
			continue
		}
		const missing = unmetConditions(subject)
		if (missing.length === 0) completeProfiles++
		for (const condition of missing) missingByCondition[condition]++
		eligible.push({ profileId: subject.profileId, missing, forGoogle: googleSuggestions(subject) })
	}
	eligible.sort((a, b) => a.profileId - b.profileId)
	return { profilesRead: subjects.length, eligible, excluded, completeProfiles, missingByCondition }
}
