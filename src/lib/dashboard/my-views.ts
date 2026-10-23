import type { Payload } from 'payload'
import { lastViewDays, PROFILE_VIEWS_COLLECTION, VIEWS_WINDOW_DAYS, type ViewRow } from '../views/profile-views'

/**
 * Her own views of the last 30 days (ticket 1001), one number per day. The profile identifier comes
 * from her session (`profileId`), never from the request, so no other profile's numbers can come out.
 * `null` when the reading fails: her space then says « indisponible », and never a zero that would be false.
 */
export async function readMyViews(
	payload: Payload,
	profileId: number,
	now: Date = new Date()
): Promise<ViewRow[] | null> {
	try {
		const first = lastViewDays([], now)[0]?.day
		const { docs } = await payload.find({
			collection: PROFILE_VIEWS_COLLECTION,
			depth: 0,
			limit: VIEWS_WINDOW_DAYS + 5,
			overrideAccess: true,
			pagination: false,
			select: { day: true, count: true },
			where: { and: [{ profile: { equals: profileId } }, { day: { greater_than_equal: first ?? '' } }] },
		})
		return lastViewDays(
			docs.map(({ day, count }) => ({ day, count })),
			now
		)
	} catch {
		return null
	}
}

/** The sentence over the numbers: the total of the 30 days. */
export function viewsSentence(days: readonly ViewRow[]): string {
	const total = days.reduce((sum, { count }) => sum + count, 0)
	if (total === 0) return 'Ta page n’a pas encore été vue ces 30 derniers jours.'
	return total === 1
		? 'Ta page a été vue 1 fois ces 30 derniers jours.'
		: `Ta page a été vue ${total} fois ces 30 derniers jours.`
}
