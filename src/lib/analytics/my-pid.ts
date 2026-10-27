/**
 * Who the visitor is for the measure of a public profile: the `pid` of her own profile when she is a makeup artist
 * who is signed in, else nothing (`GET /api/dashboard/my-pid`, never cached, no database access without a cookie).
 *
 * The public page is shared and cached: it cannot tell who reads it. The browser asks once for the clicks of a
 * visit, and the events that must not count the owner (the click on a contact, the view of her page, the steps of her
 * quote form) wait for the answer. An answer that fails counts the visitor as anyone.
 */

import { clickToMeasure } from './contact-click'
import type { Pid } from './events'

/** How long the answer about the visitor is kept: the events of one visit share a single request. */
const RESPONSE_DURATION_MS = 10_000

let response: { lueA: number; pid: Promise<Pid | null> } | null = null

/** The `pid` of the profile of the visitor, if she is an artist with one. */
export function myPid(): Promise<Pid | null> {
	if (response && Date.now() - response.lueA < RESPONSE_DURATION_MS) return response.pid
	const pid = fetch('/api/dashboard/my-pid', { cache: 'no-store', credentials: 'same-origin' })
		.then(async r => (r.ok ? ((await r.json()) as { pid?: Pid | null }).pid : null) ?? null)
		.catch(() => null)
	response = { lueA: Date.now(), pid }
	return pid
}

/**
 * True when an event about the profile `pid` is to be counted for this visit: not for the artist herself, not from her
 * space, not from a reminder link (the rules of the click on a contact, U84). Without a `pid` nothing is counted.
 */
export async function profileVisitCounts(pid: Pid | null): Promise<boolean> {
	if (pid === null) return false
	const visitorPid = await myPid().catch(() => null)
	return clickToMeasure({
		pid,
		pidDeLaVisiteuse: visitorPid,
		recherche: location.search,
		referent: document.referrer,
		origine: location.origin,
	})
}
