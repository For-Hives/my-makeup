/**
 * The market hint of the onboarding (issue 1009), read from the published profiles: for each model of
 * offer (bride, evening, trial), the median amount of the offers that carry one, or null when fewer than
 * `MEDIAN_MINIMUM` of them exist.
 *
 * - Only the name and the amount of an offer are read (`select`), from the profiles that are listed
 *   (the prices are on their public pages already): the rules of the collection stay active
 *   (`overrideAccess: false`), so a draft, a hidden or a suspended profile is never in the sample.
 * - What leaves is the median and nothing else: no slug, no count, no single price. The sample is read
 *   up to `OFFER_SAMPLE_LIMIT` profiles; past it the hint is computed on that many, which only makes it
 *   less exact.
 *
 * No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { type OfferModel, offerMedians } from '@/lib/price-median'
import { LISTED_FILTER } from '@/lib/profile/visibility'

/** The most profiles the sample reads. */
export const OFFER_SAMPLE_LIMIT = 2000

export type OfferMedians = Record<OfferModel['label'], number | null>

/** The median of each model of offer over the listed profiles. */
export async function readOfferMedians(payload: Payload): Promise<OfferMedians> {
	const { docs } = await payload.find({
		collection: 'profiles',
		where: LISTED_FILTER,
		select: { serviceOffers: { name: true, priceFrom: true } },
		depth: 0,
		limit: OFFER_SAMPLE_LIMIT,
		pagination: false,
		overrideAccess: false,
	})
	return offerMedians(
		docs.flatMap(doc => (doc.serviceOffers ?? []).map(offer => ({ name: offer.name, amount: offer.priceFrom })))
	)
}
