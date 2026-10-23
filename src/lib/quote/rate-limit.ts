import { createRateLimit } from '../auth/rate-limit'
import type { ContactRateLimits } from '../contact/rate-limit'

/**
 * The brakes of the quote request form (issue 1003), with counters of their own, apart from the contact
 * form's: 5 requests an hour from one client address, and 5 a day for one mailbox (the hashed canonical form).
 * The brake of the contact form (`takeContactSlot`) takes the places: its two counters are passed in.
 *
 * In memory, per process, like the others. No `next` import.
 */

export const QUOTES_PER_HOUR_AND_ADDRESS = 5
export const QUOTES_PER_DAY_AND_EMAIL = 5

/** Two brakes with the numbers above and counters named after `name`: a test gives itself counters of its own. */
export function createQuoteRateLimits(name: string): ContactRateLimits {
	return {
		parAdresse: createRateLimit({
			nom: `quote-adresse-${name}`,
			limite: QUOTES_PER_HOUR_AND_ADDRESS,
			fenetreMs: 60 * 60 * 1000,
		}),
		parEmail: createRateLimit({
			nom: `quote-email-${name}`,
			limite: QUOTES_PER_DAY_AND_EMAIL,
			fenetreMs: 24 * 60 * 60 * 1000,
		}),
	}
}

export const QUOTE_RATE_LIMITS: ContactRateLimits = createQuoteRateLimits('shared')
