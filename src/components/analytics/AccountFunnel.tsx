'use client'

import { useEffect } from 'react'
import { LAST_FUNNEL_KEY, realBrowser, shouldEmit } from '@/lib/analytics/duplicate'
import type { EventName } from '@/lib/analytics/events'
import { installAnalytics } from '@/lib/analytics/loader'
import { track } from '@/lib/analytics/track'

/** Tells the measure once for this view of the page; a reload of the page does not tell it again. */
function useOnce(event: Extract<EventName, 'signup_wall' | 'email_confirmed'>) {
	useEffect(() => {
		installAnalytics()
		if (shouldEmit(event, '', 'rechargement', realBrowser(), LAST_FUNNEL_KEY)) track(event)
	}, [event])
}

/**
 * The wall of verification was shown after a sign-up (`signup_wall`, 27/10/2026): the step of the funnel of the makeup
 * artist between `signup_start` and the confirmation of the address. The wall is the same for a new address and for one
 * that already has an account (ticket 083), so the event counts requests, not accounts created. Renders nothing.
 */
export function SignupWallEvent() {
	useOnce('signup_wall')
	return null
}

/** The link of the confirmation mail was followed and the account is now active (`email_confirmed`). Renders nothing. */
export function EmailConfirmedEvent() {
	useOnce('email_confirmed')
	return null
}
