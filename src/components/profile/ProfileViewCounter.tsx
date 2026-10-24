'use client'

import { useEffect } from 'react'
import { analyticsRefused } from '@/lib/analytics/opt-out'
import { PROFILE_VIEWS_PATH, reportProfileView } from '@/lib/views/report-view'

/**
 * Tells the server that this page was opened (ticket 1001), once per tab. Renders nothing. The HTML of
 * the page is cached and the same for everyone: the count is made here, after the page is shown.
 * Nothing is sent but the slug of the page; the server decides what counts (src/services/views/record-view.ts).
 */
export function ProfileViewCounter({ slug }: { slug: string }) {
	useEffect(() => {
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
	}, [slug])
	return null
}
