'use client'

import { type ComponentProps, useEffect } from 'react'
import { type ContactChannel, measureContactClick } from '@/lib/analytics/contact-click'
import type { Pid } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/track'

/** How long the answer about the visitor is kept: the clicks of one visit share a single request. */
const RESPONSE_DURATION_MS = 10_000

let response: { lueA: number; pid: Promise<Pid | null> } | null = null

/** The `pid` of the profile of the visitor, if she is an artist with one (`/api/dashboard/my-pid`). */
function myPid(): Promise<Pid | null> {
	if (response && Date.now() - response.lueA < RESPONSE_DURATION_MS) return response.pid
	const pid = fetch('/api/dashboard/my-pid', { cache: 'no-store', credentials: 'same-origin' })
		.then(async r => (r.ok ? ((await r.json()) as { pid?: Pid | null }).pid : null) ?? null)
		.catch(() => null)
	response = { lueA: Date.now(), pid }
	return pid
}

/**
 * A link to a way of reaching the artist, which counts its click once (ticket 144). The page is
 * rendered by the server with the link in its HTML; this adds the count. The answer about the visitor
 * is asked as soon as the link is there, so that it is usually known when she clicks.
 */
export function TrackedContactLink({
	pid,
	canal,
	href,
	children,
	...lien
}: { pid: Pid | null; canal: ContactChannel; href: string } & Omit<ComponentProps<'a'>, 'onClick' | 'href'>) {
	useEffect(() => {
		if (pid !== null) void myPid()
	}, [pid])
	const countClick = () => {
		void measureContactClick({
			pid,
			canal,
			lieu: { recherche: location.search, referent: document.referrer, origine: location.origin },
			monPid: myPid(),
			suivre: track,
		})
	}
	return (
		<a
			href={href}
			{...lien}
			onClick={countClick}
			// A click of the middle button opens the link in a tab without a `click` event.
			onAuxClick={event => {
				if (event.button === 1) countClick()
			}}
		>
			{children}
		</a>
	)
}
