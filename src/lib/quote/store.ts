import type { Payload } from 'payload'
import { QUOTE_REQUESTS_COLLECTION } from '../../collections/QuoteRequests'
import type { QuoteRequest } from './request'
import type { QuoteMailState, QuoteStore } from './save'
import { quoteFormShown } from './shown'

/**
 * The store of the quote requests wired to Payload (issue 1003): the Local API without access control, as the
 * server writes its journals. It decides nothing about who may write: that is `saveQuoteRequest`, which
 * calls it after its checks.
 *
 * `target` is the server's own reading of the profile at the moment a request arrives. It applies the same rule
 * as the page (src/lib/quote/shown.ts): the public reading of the profile (published, not hidden), at least one
 * way to reach the artist, and not on pause. It then reads, apart, the address of the account of the artist.
 *
 * Relative imports on purpose: this file is also loaded by scripts, outside of Next.
 */

/** What `target` reads of the public profile: the facts the rule needs. */
export interface PublicProfileFacts {
	published: boolean
	reachable: boolean
	available: boolean
}

/** The public reading of a profile by slug, or `null` when the public does not read it. Passed in: it lives in the services. */
export type ReadPublicFacts = (payload: Payload, slug: string) => Promise<PublicProfileFacts | null>

export function payloadQuoteStore(payload: Payload, readFacts: ReadPublicFacts): QuoteStore {
	return {
		async target(slug) {
			const facts = await readFacts(payload, slug)
			if (facts === null || !quoteFormShown({ enabled: true, ...facts })) return null
			const { docs } = await payload.find({
				collection: 'profiles',
				depth: 0,
				limit: 1,
				overrideAccess: true,
				pagination: false,
				select: { pro: true },
				where: { slug: { equals: slug } },
			})
			const profile = docs[0]
			if (!profile) return null
			const proId = typeof profile.pro === 'object' ? profile.pro?.id : profile.pro
			const account =
				typeof proId === 'number'
					? await payload
							.findByID({ collection: 'pros', depth: 0, id: proId, overrideAccess: true, select: { email: true } })
							.catch(() => null)
					: null
			return { profileId: profile.id, recipient: account?.email }
		},

		async create(profileId, quote: QuoteRequest, consentAt) {
			return (
				await payload.create({
					collection: QUOTE_REQUESTS_COLLECTION,
					data: {
						profile: profileId,
						status: 'new',
						mailStatus: 'pending',
						eventDate: quote.eventDate,
						place: quote.place,
						serviceType: quote.serviceType,
						message: quote.message,
						clientFirstName: quote.firstName,
						clientEmail: quote.email,
						...(quote.phone !== '' && { clientPhone: quote.phone }),
						consentAt: consentAt.toISOString(),
					},
					depth: 0,
					overrideAccess: true,
				})
			).id
		},

		async mark(id, mailStatus: QuoteMailState) {
			await payload.update({
				collection: QUOTE_REQUESTS_COLLECTION,
				id,
				data: { mailStatus },
				depth: 0,
				overrideAccess: true,
			})
		},
	}
}
