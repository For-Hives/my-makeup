/**
 * Reads what the reconciliation (src/lib/rapprochement.ts) compares: the media, what uses them,
 * and the objects of the storage. Read only, without access control: it is a tool of the
 * operators, never an answer to a request. Ticket 137.
 */
import type { Payload } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { photosNommees } from './profil/photos'
import { type MediaLu, type Rapprochement, rapprocher } from './rapprochement'
import type { ObjetDuStockage } from './stockage'

const PAGE = 500

/** Every document of a collection, page after page. */
async function toutLire<T>(lire: (page: number) => Promise<{ docs: T[]; hasNextPage: boolean }>): Promise<T[]> {
	const docs: T[] = []
	for (let page = 1; ; page++) {
		const lue = await lire(page)
		docs.push(...lue.docs)
		if (!lue.hasNextPage) return docs
	}
}

/** The media, the identifiers a profile or an article uses (an article in any version), and the storage, compared. */
export async function rapprocherLeStockageEtLaBase(
	payload: Payload,
	lister: () => Promise<readonly ObjetDuStockage[]>
): Promise<Rapprochement> {
	const lecture = { depth: 0, limit: PAGE, overrideAccess: true } as const
	const [objets, medias, profils, articles, versions] = await Promise.all([
		lister(),
		toutLire<MediaLu>(async page => {
			const { docs, hasNextPage } = await payload.find({
				...lecture,
				collection: 'media',
				page,
				select: { prefix: true, _objectKey: true, filename: true, sizes: true, strapiFormats: true, strapiId: true },
				sort: 'id',
			})
			return { docs: docs as MediaLu[], hasNextPage }
		}),
		toutLire<{ mainPicture?: unknown; gallery?: unknown }>(page =>
			payload.find({
				...lecture,
				collection: 'profiles',
				page,
				select: { mainPicture: true, gallery: true },
				sort: 'id',
			})
		),
		toutLire<{ gallery?: unknown }>(page =>
			payload.find({ ...lecture, collection: 'articles', page, select: { gallery: true }, sort: 'id' })
		),
		toutLire<{ version?: { gallery?: unknown } }>(page =>
			payload.findVersions({ ...lecture, collection: 'articles', page, sort: 'id' })
		),
	])
	const utilises = new Set(
		[
			...profils.flatMap(({ mainPicture, gallery }) => [...photosNommees(mainPicture), ...photosNommees(gallery)]),
			...articles.flatMap(({ gallery }) => photosNommees(gallery)),
			...versions.flatMap(({ version }) => photosNommees(version?.gallery)),
		].map(String)
	)
	return rapprocher({ objets, medias, mediasUtilises: utilises })
}
