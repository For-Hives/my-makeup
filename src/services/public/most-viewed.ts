/**
 * The profiles whose page was opened most over the last 30 days, for the preset of the search page (src/lib/search/preset.ts).
 *
 * The counter of views (`profile-views`, ticket 1001) is closed to the public read (admins only), so it is read here
 * apart, on the server, the way `readVerified` reads the box « Vérifiée »: one aggregate per profile, summed over the
 * window, and only the ORDER of the slugs leaves (never a count, never a day). The page then keeps from this list the
 * profiles the directory lists, so a hidden, unpublished or suspended profile never comes out of it.
 *
 * No `next` import: the caching is `cachedMostViewed`.
 */

import type { Payload } from 'payload'
import { orderMostViewed } from '@/lib/search/preset'
import { VIEWS_WINDOW_DAYS } from '@/lib/views/profile-views'
import { parisDayBefore } from '@/lib/weekly-stats'

/** The slugs of the published profiles viewed enough over the window, most viewed first (see `orderMostViewed`). */
export async function readMostViewedSlugs(payload: Payload, now: Date = new Date()): Promise<string[]> {
	// The window is the same as the one of her space: today and the 29 days before it, days of Paris.
	const first = parisDayBefore(now, VIEWS_WINDOW_DAYS - 1)
	const { rows } = await payload.db.pool.query<{ slug: string; views: string }>(
		`SELECT p.slug AS slug, SUM(v.count) AS views
		 FROM profile_views v
		 JOIN profiles p ON p.id = v.profile_id
		 WHERE v.day >= $1 AND p.status = 'published'
		 GROUP BY p.slug`,
		[first]
	)
	return orderMostViewed(new Map(rows.map(({ slug, views }) => [slug, Number(views)])))
}
