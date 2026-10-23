import type { Payload } from 'payload'
import { REMINDER_REPORTS_COLLECTION } from '../../collections/ReminderReports'
import { REMINDER_STATES_COLLECTION } from '../../collections/ReminderStates'
import type { ReminderSubject } from './rules'
import type { ReminderStore, StoredReport } from './run'

/**
 * The store of the reminders wired to Payload (issue 1006): the Local API without access control, as the server
 * writes its counters. It reads the profiles and accounts the rules need, and writes the two internal
 * collections `reminder-states` and `reminder-reports`. Nothing is written to a profile or to an account.
 *
 * Relative imports on purpose: the Payload CLI and the scripts load this file outside of Next.
 */

const PAGE = 200

const iso = (value: string | null | undefined): string | null => (value ? value : null)

export function payloadReminderStore(payload: Payload): ReminderStore {
	const stateOf = async (profileId: number) =>
		(
			await payload.find({
				collection: REMINDER_STATES_COLLECTION,
				depth: 0,
				limit: 1,
				overrideAccess: true,
				pagination: false,
				where: { profile: { equals: profileId } },
			})
		).docs[0]

	return {
		async subjects() {
			const subjects: ReminderSubject[] = []
			for (let page = 1; ; page++) {
				const profiles = await payload.find({
					collection: 'profiles',
					depth: 0,
					limit: PAGE,
					overrideAccess: true,
					page,
					sort: 'id',
					select: {
						status: true,
						pro: true,
						updatedAt: true,
						firstName: true,
						lastName: true,
						artistName: true,
						specialty: true,
						description: true,
						city: true,
						zoneKind: true,
						countries: true,
						mainPicture: true,
						gallery: true,
						skills: true,
						experiences: true,
						courses: true,
						languages: true,
						serviceOffers: true,
						networks: true,
						contactDetails: true,
						publicContact: true,
					},
					where: { status: { not_equals: 'hidden' } },
				})
				const proIds = [
					...new Set(profiles.docs.map(doc => (typeof doc.pro === 'object' ? doc.pro?.id : doc.pro))),
				].filter((id): id is number => typeof id === 'number')
				const pros = new Map(
					(
						await payload.find({
							collection: 'pros',
							depth: 0,
							limit: PAGE,
							overrideAccess: true,
							pagination: false,
							select: { _verified: true, blocked: true, lastSignInAt: true, createdAt: true },
							where: { id: { in: proIds } },
						})
					).docs.map(doc => [doc.id, doc])
				)
				const states = new Map(
					(
						await payload.find({
							collection: REMINDER_STATES_COLLECTION,
							depth: 0,
							limit: PAGE,
							overrideAccess: true,
							pagination: false,
							select: { profile: true, lastSentAt: true, unsubscribedAt: true },
							where: { profile: { in: profiles.docs.map(doc => doc.id) } },
						})
					).docs.map(doc => [typeof doc.profile === 'object' ? doc.profile?.id : doc.profile, doc])
				)
				for (const doc of profiles.docs) {
					const proId = typeof doc.pro === 'object' ? doc.pro?.id : doc.pro
					const pro = typeof proId === 'number' ? pros.get(proId) : undefined
					if (!pro) continue
					const state = states.get(doc.id)
					subjects.push({
						profileId: doc.id,
						status: doc.status ?? 'draft',
						document: doc,
						profileUpdatedAt: doc.updatedAt,
						account: {
							verified: pro._verified === true,
							blocked: pro.blocked === true,
							lastSignInAt: iso(pro.lastSignInAt),
							createdAt: pro.createdAt,
						},
						state: state ? { lastSentAt: iso(state.lastSentAt), unsubscribedAt: iso(state.unsubscribedAt) } : null,
					})
				}
				if (!profiles.hasNextPage) return subjects
			}
		},

		async recipient(profileId) {
			const profile = await payload.findByID({
				collection: 'profiles',
				depth: 0,
				id: profileId,
				overrideAccess: true,
				select: { pro: true },
			})
			const proId = typeof profile.pro === 'object' ? profile.pro?.id : profile.pro
			if (typeof proId !== 'number') return undefined
			const pro = await payload.findByID({
				collection: 'pros',
				depth: 0,
				id: proId,
				overrideAccess: true,
				select: { email: true },
			})
			return pro.email
		},

		async markSent(profileId, at) {
			const existing = await stateOf(profileId)
			if (existing)
				await payload.update({
					collection: REMINDER_STATES_COLLECTION,
					data: { lastSentAt: at.toISOString() },
					depth: 0,
					id: existing.id,
					overrideAccess: true,
				})
			else
				await payload.create({
					collection: REMINDER_STATES_COLLECTION,
					data: { profile: profileId, lastSentAt: at.toISOString() },
					depth: 0,
					overrideAccess: true,
				})
		},

		async readReport(day) {
			const row = (
				await payload.find({
					collection: REMINDER_REPORTS_COLLECTION,
					depth: 0,
					limit: 1,
					overrideAccess: true,
					pagination: false,
					where: { day: { equals: day } },
				})
			).docs[0]
			if (!row) return null
			return {
				day: row.day,
				incompleteCount: row.incompleteCount,
				incompleteIds: asIds(row.incompleteIds),
				inactiveCount: row.inactiveCount,
				inactiveIds: asIds(row.inactiveIds),
				sentCount: row.sentCount,
				sendEnabled: row.sendEnabled === true,
			}
		},

		async writeReport(report: StoredReport) {
			const existing = (
				await payload.find({
					collection: REMINDER_REPORTS_COLLECTION,
					depth: 0,
					limit: 1,
					overrideAccess: true,
					pagination: false,
					select: {},
					where: { day: { equals: report.day } },
				})
			).docs[0]
			if (existing)
				await payload.update({
					collection: REMINDER_REPORTS_COLLECTION,
					data: report,
					depth: 0,
					id: existing.id,
					overrideAccess: true,
				})
			else
				await payload.create({ collection: REMINDER_REPORTS_COLLECTION, data: report, depth: 0, overrideAccess: true })
		},
	}
}

/** A stored list of identifiers, whatever else the JSON column may hold. */
function asIds(value: unknown): number[] {
	return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []
}

/** Records that she opened the unsubscribe link of a reminder. Idempotent: the first date stays. */
export async function unsubscribeProfile(payload: Payload, profileId: number, at: Date): Promise<boolean> {
	const profile = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		select: {},
		where: { id: { equals: profileId } },
	})
	if (profile.docs.length === 0) return false
	const existing = (
		await payload.find({
			collection: REMINDER_STATES_COLLECTION,
			depth: 0,
			limit: 1,
			overrideAccess: true,
			pagination: false,
			where: { profile: { equals: profileId } },
		})
	).docs[0]
	if (existing) {
		if (!existing.unsubscribedAt)
			await payload.update({
				collection: REMINDER_STATES_COLLECTION,
				data: { unsubscribedAt: at.toISOString() },
				depth: 0,
				id: existing.id,
				overrideAccess: true,
			})
	} else
		await payload.create({
			collection: REMINDER_STATES_COLLECTION,
			data: { profile: profileId, unsubscribedAt: at.toISOString() },
			depth: 0,
			overrideAccess: true,
		})
	return true
}
