'use client'

import { type ComponentProps, useEffect } from 'react'
import { type ContactChannel, measureContactClick } from '@/lib/analytics/contact-click'
import type { Pid } from '@/lib/analytics/events'
import { myPid } from '@/lib/analytics/my-pid'
import { track } from '@/lib/analytics/track'

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
