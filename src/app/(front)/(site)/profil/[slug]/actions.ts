'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import { ipClient } from '@/lib/auth/client-ip'
import { NO_RELAY, payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { type QuoteState, quoteFormValues } from '@/lib/quote/request'
import { saveQuoteRequest } from '@/lib/quote/save'
import { payloadQuoteStore } from '@/lib/quote/store'
import { readQuoteFacts } from '@/services/public/quote-facts'

/** The field of the form that carries the slug of the profile it is on. */
const SLUG_FIELD = 'profile'

/**
 * The quote request form of a profile (issue 1003). The request is checked, stored, then sent to the artist and
 * acknowledged after the answer (src/lib/quote/save.ts). Next refuses a Server Action called from another
 * origin before this code runs; the origin is checked here as well, as for the contact form.
 *
 * The page that holds the form is kept in the cache, so nothing here trusts it: the switch of the site and the
 * profile are read again by the server. Nothing she typed is logged.
 */
export async function sendQuoteRequest(_previous: QuoteState, form: FormData): Promise<QuoteState> {
	const values = quoteFormValues(form)
	const slugField = form.get(SLUG_FIELD)
	const slug = typeof slugField === 'string' ? slugField : ''
	const payload = await getPayload({ config })
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { failure: true, values }

	const env = serverEnv()
	const door = payloadSendEmail(payload, env)
	const result = await saveQuoteRequest({
		form,
		slug,
		enabled: env.quoteRequests,
		now: new Date(),
		store: payloadQuoteStore(payload, readQuoteFacts),
		send: async email => {
			// A work station with no relay writes nothing: the mail did not leave, which the flow must know.
			if ((await door(email)) === NO_RELAY) throw new Error('no relay')
		},
		site: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost',
		after: job => after(job),
		log: {
			info: line => payload.logger.info({ msg: line }),
			erreur: line => payload.logger.error({ msg: line }),
		},
		client: ipClient(await headers()),
		...(env.turnstile && { turnstile: { secret: env.turnstile.secret } }),
	})
	if (result.ok) return { sent: true }
	if (result.code === 'indisponible') return { unavailable: true }
	if (result.code === 'verification-echouee') return { verification: true, values }
	if (result.code === 'trop-de-demandes') return { throttled: true, values }
	if (result.code === 'donnees-invalides') return { errors: result.errors, values }
	return { failure: true, values }
}
