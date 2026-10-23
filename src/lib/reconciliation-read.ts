/**
 * Reads what the reconciliation (src/lib/reconciliation.ts) compares: the media, what uses them,
 * and the objects of the storage. Read only, without access control: it is a tool of the
 * operators, never an answer to a request. Ticket 137.
 */
import type { Payload } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { namedPhotos } from './profile/photos'
import { type ReadMedia, type Reconciliation, reconcile } from './reconciliation'
import type { StorageObject } from './storage'

const PAGE = 500

/** Every document of a collection, page after page. */
async function readAll<T>(lire: (page: number) => Promise<{ docs: T[]; hasNextPage: boolean }>): Promise<T[]> {
	const docs: T[] = []
	for (let page = 1; ; page++) {
		const readItem = await lire(page)
		docs.push(...readItem.docs)
		if (!readItem.hasNextPage) return docs
	}
}

/** The media, the identifiers a profile or an article uses (an article in any version), and the storage, compared. */
export async function reconcileStorageAndDatabase(
	payload: Payload,
	lister: () => Promise<readonly StorageObject[]>
): Promise<Reconciliation> {
	const reading = { depth: 0, limit: PAGE, overrideAccess: true } as const
	const [objects, media, profiles, articles, versions] = await Promise.all([
		lister(),
		readAll<ReadMedia>(async page => {
			const { docs, hasNextPage } = await payload.find({
				...reading,
				collection: 'media',
				page,
				select: { prefix: true, _objectKey: true, filename: true, sizes: true, strapiFormats: true, strapiId: true },
				sort: 'id',
			})
			return { docs: docs as ReadMedia[], hasNextPage }
		}),
		readAll<{ mainPicture?: unknown; gallery?: unknown }>(page =>
			payload.find({
				...reading,
				collection: 'profiles',
				page,
				select: { mainPicture: true, gallery: true },
				sort: 'id',
			})
		),
		readAll<{ gallery?: unknown }>(page =>
			payload.find({ ...reading, collection: 'articles', page, select: { gallery: true }, sort: 'id' })
		),
		readAll<{ version?: { gallery?: unknown } }>(page =>
			payload.findVersions({ ...reading, collection: 'articles', page, sort: 'id' })
		),
	])
	const used = new Set(
		[
			...profiles.flatMap(({ mainPicture, gallery }) => [...namedPhotos(mainPicture), ...namedPhotos(gallery)]),
			...articles.flatMap(({ gallery }) => namedPhotos(gallery)),
			...versions.flatMap(({ version }) => namedPhotos(version?.gallery)),
		].map(String)
	)
	return reconcile({ objets: objects, medias: media, mediasUtilises: used })
}
