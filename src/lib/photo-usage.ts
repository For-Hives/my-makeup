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
