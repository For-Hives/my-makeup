/**
 * Counts one view of a profile (ticket 1001). The only writer of `profile-views`.
 *
 * What it keeps: the profile, the day of Paris and a number, added in ONE statement
 * (`INSERT … ON CONFLICT DO UPDATE`), so that two views at once make 2, never a lost one. What it never
 * keeps or logs: the address, the user agent, the cookie, who asked.
 *
 * It counts nothing for:
 * - a robot, a tool or a request with no user agent (`isAutomatedAgent`);
 * - a request another site started (`Sec-Fetch-Site: cross-site`);
 * - a slug that is not a published profile (hidden, draft, unknown): the server decides, the browser never does;
 * - the owner of the profile signed in, and any account of the team: they look at their own work.
 */

import type { Payload } from 'payload'
import { COLLECTION_ADMINS, COLLECTION_PROS } from '@/lib/access'
import { isAutomatedAgent } from '@/lib/views/profile-views'
import { parisDay } from '@/lib/weekly-stats'

export type ViewOutcome = 'counted' | 'ignored'

export async function recordProfileView(
	payload: Payload,
	{ slug, headers, now = new Date() }: { slug: string; headers: Headers; now?: Date }
): Promise<ViewOutcome> {
	if (isAutomatedAgent(headers.get('user-agent'))) return 'ignored'
	if (headers.get('sec-fetch-site') === 'cross-site') return 'ignored'
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		select: { pro: true },
		where: { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] },
	})
	const profile = docs[0]
	if (!profile) return 'ignored'
	// No cookie, no session: nothing to ask. A visitor signed in is looked up only when she carries one.
	if (headers.get('cookie')) {
		const { user } = await payload.auth({ headers })
		if (user?.collection === COLLECTION_ADMINS) return 'ignored'
		if (user?.collection === COLLECTION_PROS) {
			const owner = typeof profile.pro === 'object' && profile.pro !== null ? profile.pro.id : profile.pro
			if (owner === user.id) return 'ignored'
		}
	}
	await payload.db.pool.query(
		`INSERT INTO profile_views (profile_id, day, count, updated_at, created_at)
		 VALUES ($1, $2, 1, now(), now())
		 ON CONFLICT (profile_id, day) DO UPDATE SET count = profile_views.count + 1, updated_at = now()`,
		[profile.id, parisDay(now)]
	)
	return 'counted'
}
