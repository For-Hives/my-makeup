import type { CheckRow } from '../activity/store'
import { formatSiret } from '../legal'
import { longDate } from './contact-details'

/**
 * What her space says of the check of her SIRET (issue 1004): the number she gave (for her eyes only, on her own
 * page) and where the check stands. Plain data, so that the page hands it to the browser.
 */
export type ActivityState = 'none' | 'pending' | 'active' | 'ceased' | 'not-found'

export interface ActivityView {
	/** The SIRET printed the usual way, or `null` without one. */
	siret: string | null
	state: ActivityState
	/** « 20 octobre 2026 »: the day of the last answer read, or `null`. */
	checkedOn: string | null
}

/**
 * The view from the SIRET stored and the row of the cache. A row is only trusted when she holds a SIRET: the
 * profile resets it at each change, so the row belongs to this number.
 */
export function activityView(siret: string | null | undefined, row: CheckRow | null): ActivityView {
	if (typeof siret !== 'string' || !/^\d{14}$/.test(siret)) return { siret: null, state: 'none', checkedOn: null }
	return { siret: formatSiret(siret), state: row?.outcome ?? 'pending', checkedOn: longDate(row?.checkedAt) }
}
