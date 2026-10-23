import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import type { PhotoUsage } from './photo-limits'

/**
 * What one makeup artist holds in the storage (ticket 309): her media, counted and added up by the size
 * of the file as stored (the derived sizes are not added), not what her profile names, so that a photo
 * sent straight to the API weighs as much as one in her portfolio. A photo the import found without an
 * object (`objectMissing`) takes no room and is not counted. Read by the server for her, without the
 * access rules: the owner is the account of the session, never a value of a request.
 *
 * `except` leaves one media out: the one whose file is being replaced.
 */
export async function readPhotoUsage(
	payload: Payload,
	owner: number | string,
	{ except, req }: { except?: number | string | undefined; req?: PayloadRequest | undefined } = {}
): Promise<PhotoUsage> {
	const { docs } = await payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		...(req && { req }),
		select: { filesize: true },
		where:
			except === undefined
				? { and: [{ owner: { equals: owner } }, { objectMissing: { not_equals: true } }] }
				: {
						and: [
							{ owner: { equals: owner } },
							{ objectMissing: { not_equals: true } },
							{ id: { not_equals: except } },
						],
					},
	})
	return { count: docs.length, bytes: docs.reduce((total, doc) => total + (doc.filesize ?? 0), 0) }
}

/**
 * Two photos of one makeup artist wait for each other (ticket 996): the second reads her usage once the
 * first has committed. Without it, two sends at the same moment both read the same count and both passed
 * the limit. A lock of PostgreSQL held until the end of the transaction of the send, on her account alone:
 * two other accounts never wait for each other. Outside a transaction there is nothing to wait for.
 */
export async function lockPhotoUsage(req: PayloadRequest, owner: number | string): Promise<void> {
	const id = await req.transactionID
	// The adapter of the configuration is the PostgreSQL one; `sessions` holds the transaction of each request.
	const { sessions } = req.payload.db as unknown as Pick<PostgresAdapter, 'sessions'>
	const transaction = id === undefined || id === null ? undefined : sessions?.[id]
	await transaction?.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`media.photo-usage:${owner}`}))`)
}
