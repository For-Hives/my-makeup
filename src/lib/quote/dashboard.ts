import type { Payload } from 'payload'
import { QUOTE_REQUESTS_COLLECTION } from '../../collections/QuoteRequests'
import type { QuoteStatus, ServiceType } from './request'
import { QUOTE_STATUSES } from './request'

/**
 * Her own quote requests in her space (issue 1003). The profile comes from her session (the caller gives its
 * identifier, found by her account), never from the request, so no other artist's request can come out or be
 * changed. The collection is closed to every API: these reads and writes are the server's, after that check.
 */

/** The most requests the card shows: older ones are still there until the purge, and her mail has them. */
export const MY_QUOTES_LIMIT = 50

export interface MyQuote {
	id: number
	status: QuoteStatus
	/** `AAAA-MM-JJ`. */
	eventDate: string
	place: string
	serviceType: ServiceType
	message: string
	clientFirstName: string
	clientEmail: string
	clientPhone: string | null
	/** When it was received (ISO). */
	receivedAt: string
}

/** Her requests, the newest first. `null` when the reading fails: her space then says so, never an empty list that would be false. */
export async function readMyQuotes(payload: Payload, profileId: number): Promise<MyQuote[] | null> {
	try {
		const { docs } = await payload.find({
			collection: QUOTE_REQUESTS_COLLECTION,
			depth: 0,
			limit: MY_QUOTES_LIMIT,
			overrideAccess: true,
			pagination: false,
			sort: '-createdAt',
			where: { profile: { equals: profileId } },
		})
		return docs.map(doc => ({
			id: doc.id,
			status: doc.status,
			eventDate: doc.eventDate,
			place: doc.place,
			serviceType: doc.serviceType,
			message: doc.message,
			clientFirstName: doc.clientFirstName,
			clientEmail: doc.clientEmail,
			clientPhone: doc.clientPhone ?? null,
			receivedAt: doc.createdAt,
		}))
	} catch {
		return null
	}
}

export type MarkResult = { ok: true; status: QuoteStatus } | { ok: false }

/**
 * Marks one of her requests `answered` (or takes it back to `new`). Refused, without a word on why, when the
 * request is not on her profile, does not exist, or the status is not one of the two.
 */
export async function markMyQuote(
	payload: Payload,
	profileId: number,
	input: { id: unknown; status: unknown }
): Promise<MarkResult> {
	const id = typeof input.id === 'string' ? Number(input.id) : input.id
	const status = input.status
	if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return { ok: false }
	if (typeof status !== 'string' || !(QUOTE_STATUSES as readonly string[]).includes(status)) return { ok: false }
	try {
		const { docs } = await payload.find({
			collection: QUOTE_REQUESTS_COLLECTION,
			depth: 0,
			limit: 1,
			overrideAccess: true,
			pagination: false,
			select: {},
			where: { and: [{ id: { equals: id } }, { profile: { equals: profileId } }] },
		})
		if (docs.length === 0) return { ok: false }
		await payload.update({
			collection: QUOTE_REQUESTS_COLLECTION,
			data: { status: status as QuoteStatus },
			depth: 0,
			id,
			overrideAccess: true,
		})
		return { ok: true, status: status as QuoteStatus }
	} catch {
		return { ok: false }
	}
}
