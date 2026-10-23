'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { readSearchCount, recordSearchCount } from '@/lib/search/count'
import { mayCountSearch } from '@/lib/search/count-rate-limit'

/**
 * Adds one search to the count of the day (issue 1002). It takes three facts and a code of the list of the
 * départements (`readSearchCount`), nothing typed, and answers nothing: a refused or failed count never
 * shows on the page. Next refuses a Server Action called from another origin before this code runs; the
 * origin is checked here as well, as for the contact form. Braked by address (60 a minute), with no log line.
 */
export async function recordSearch(entree: unknown): Promise<void> {
	const count = readSearchCount(entree)
	if (!count) return
	try {
		const requestHeaders = await headers()
		const payload = await getPayload({ config })
		const origin = requestHeaders.get('origin')
		if (origin !== null && !payload.config.csrf.includes(origin)) return
		if (!mayCountSearch(requestHeaders)) return
		await recordSearchCount(payload, count)
	} catch {
		// A count that fails is lost: the search it belongs to has been answered.
	}
}
