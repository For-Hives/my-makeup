/**
 * Calendar arithmetic shared by the retention rules.
 *
 * Pure: no `next` import, no Payload.
 */

/**
 * The instant `months` calendar months before `now`, in UTC, keeping the day and the time. Day 1 is
 * set first, so that 31 March minus a month does not spill over into the month after; a day the
 * target month does not have becomes its last day (31 March gives 28 February).
 */
export function monthsBefore(now: Date, months: number): Date {
	const result = new Date(now.getTime())
	const day = result.getUTCDate()
	result.setUTCDate(1)
	result.setUTCMonth(result.getUTCMonth() - months)
	const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
	result.setUTCDate(Math.min(day, lastDay))
	return result
}
