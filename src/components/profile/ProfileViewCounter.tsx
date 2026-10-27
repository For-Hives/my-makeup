'use client'

import { useEffect } from 'react'
import { leftPage } from '@/lib/analytics/delegated'
import { LAST_VIEW_KEY, realBrowser, shouldEmit } from '@/lib/analytics/duplicate'
import type { Pid } from '@/lib/analytics/events'
import { profileVisitCounts } from '@/lib/analytics/my-pid'
import { analyticsRefused } from '@/lib/analytics/opt-out'
import { track } from '@/lib/analytics/track'
import { viewOrigin } from '@/lib/analytics/values'
import { PROFILE_VIEWS_PATH, reportProfileView } from '@/lib/views/report-view'

/**
 * Tells the server that this page was opened (ticket 1001), once per tab. Renders nothing. The HTML of
 * the page is cached and the same for everyone: the count is made here, after the page is shown.
 * Nothing is sent but the slug of the page; the server decides what counts (src/services/views/record-view.ts).
 *
 * It also tells the audience measure (`profile_view`, 27/10/2026): the profile and where the visitor came from, told by
 * the page she left (a list, a zone, an article, another site, nobody). Not for the artist herself, nor from her space,
 * nor from a reminder link (the rules of the click on a contact), and not again for a reload of the page.
 */
export function ProfileViewCounter({ slug, pid }: { slug: string; pid: Pid | null }) {
	useEffect(() => {
		// Read at once: the page a link was clicked on is only kept until the next page asks.
		const from = viewOrigin(leftPage.from, document.referrer, location.origin)
		leftPage.from = null
		void (async () => {
			try {
				if (pid === null || !(await profileVisitCounts(pid))) return
				if (shouldEmit('profile_view', String(pid), 'rechargement', realBrowser(), LAST_VIEW_KEY))
					track('profile_view', { pid, from })
			} catch {
				// A measure never breaks a page.
			}
		})()
		try {
			let storage: Storage | undefined
			try {
				storage = window.sessionStorage
			} catch {
				// Blocked storage: the page cannot tell a reload from a visit, and counts.
			}
			reportProfileView({
				slug,
				storage,
				automated: navigator.webdriver === true,
				refused: analyticsRefused(window.localStorage),
				send: body => {
					void fetch(PROFILE_VIEWS_PATH, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
						keepalive: true,
					}).catch(() => undefined)
				},
			})
		} catch {
			// A count must never break the page.
		}
	}, [slug, pid])
	return null
}
