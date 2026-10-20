/**
 * The opposition of a visitor to the audience measure, kept in the browser (ticket 112).
 *
 * The key is the one Umami reads before it sends anything, and the one the filter of the page
 * (src/lib/analytics/umami.ts) checks: while it is set, this browser sends nothing. It lives in
 * `localStorage`, so it holds for this browser only, and until the visitor removes it.
 */

export const OPT_OUT_KEY = 'umami.disabled'

/** True when this browser opted out. A storage that cannot be read (private window, blocked data) is not an opt-out. */
export function analyticsRefused(stockage: Pick<Storage, 'getItem'> | undefined): boolean {
	try {
		return !!stockage && stockage.getItem(OPT_OUT_KEY) !== null
	} catch {
		return false
	}
}

/**
 * Opts this browser out of the measure, or back in. Returns the state the browser is in afterwards,
 * read back from the storage: a storage that refuses the write leaves the state as it was.
 */
export function refuseAnalytics(
	stockage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
	refuser: boolean
): boolean {
	try {
		if (refuser) stockage?.setItem(OPT_OUT_KEY, '1')
		else stockage?.removeItem(OPT_OUT_KEY)
	} catch {
		// The storage is unavailable: nothing else to do.
	}
	return analyticsRefused(stockage)
}
