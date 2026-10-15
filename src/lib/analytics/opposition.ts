/**
 * The opposition of a visitor to the audience measure, kept in the browser (ticket 112).
 *
 * The key is the one Umami reads before it sends anything, and the one the filter of the page
 * (src/lib/analytics/umami.ts) checks: while it is set, this browser sends nothing. It lives in
 * `localStorage`, so it holds for this browser only, and until the visitor removes it.
 */

export const CLE_D_OPPOSITION = 'umami.disabled'

/** True when this browser opted out. A storage that cannot be read (private window, blocked data) is not an opt-out. */
export function mesureRefusee(stockage: Pick<Storage, 'getItem'> | undefined): boolean {
	try {
		return !!stockage && stockage.getItem(CLE_D_OPPOSITION) !== null
	} catch {
		return false
	}
}

/**
 * Opts this browser out of the measure, or back in. Returns the state the browser is in afterwards,
 * read back from the storage: a storage that refuses the write leaves the state as it was.
 */
export function refuserLaMesure(
	stockage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
	refuser: boolean
): boolean {
	try {
		if (refuser) stockage?.setItem(CLE_D_OPPOSITION, '1')
		else stockage?.removeItem(CLE_D_OPPOSITION)
	} catch {
		// The storage is unavailable: nothing else to do.
	}
	return mesureRefusee(stockage)
}
