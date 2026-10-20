import {
	APIError,
	type CollectionAfterChangeHook,
	type CollectionAfterDeleteHook,
	type CollectionBeforeDeleteHook,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type PayloadRequest,
	type Plugin,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { isImport } from '../lib/import-context'
import { idOf, namedPhotos } from '../lib/profile/photos'
import { type MediaObjects, moveToTrash, type ObjectStorage, objectKeys, StorageOutage } from '../lib/trash'

/**
 * A photo that no longer serves goes to the bin, never to a direct deletion (ticket 045; plan 01
 * §1.8; docs/migration/SCHEMA.md, §8). The rule of the bin itself, the move and the putting back,
 * is in src/lib/trash.ts; this file decides when a photo no longer serves.
 *
 * - **A media deleted** (by its owner, by an admin, by the newsroom, or by the clean-up below): its
 *   objects, the original and each derived size, move to the bin.
 * - **The file of a media replaced**: the objects of the former file move to the bin, once the new
 *   one is written.
 * - **The clean-up of a profile** (`menage`): when a save takes a photo out of a profile, its main
 *   photo replaced or a photo taken out of its gallery, or when a profile is deleted, each photo
 *   that nothing references any more (no profile, no article, no version of an article) is deleted,
 *   and its objects move to the bin. A photo still referenced stays where it is. A deleted profile
 *   takes with it every photo of its account that nothing references.
 * - **Under the context of the import** (`estUnImport`), nothing of this happens: no media is
 *   deleted, no object moves.
 * - **Without an object storage** (S3_ENDPOINT not set), no object can move: the clean-up of a
 *   profile deletes no media, so that no record is lost while its object stays where it is.
 *
 * The moves come last, inside the transaction of the request: if the storage fails, what has
 * already moved is put back, and the request fails (503) with every document as it was. Nothing of
 * the request is kept.
 *
 * That holds for an operation on one document only. Payload runs an operation on several documents
 * at once (by a `where`, as the list view of the admin panel deletes) document by document, keeps
 * the error of one of them in its answer, and commits the writes of all the others, and of that
 * one. So `media` and `profils` refuse it (`oneAtATime`), by every API, outside the import; the
 * admin panel no longer offers it.
 *
 * The storage plugin deletes the objects itself, after a deletion or a replacement: its own
 * deletions are taken away (`withoutPluginDeletion`). `withTrash` wraps the plugin, and
 * src/payload.config.ts uses nothing else.
 */

/** The answer to a request whose photos the storage could not move: nothing was changed. */
export const STORAGE_OUTAGE_MESSAGE =
	'Le stockage des photos ne répond pas : rien n’a été modifié. Réessaie dans quelques minutes.'

/** The answer to a deletion or a change of several media, or of several profiles, at once. */
export const ONE_AT_A_TIME_MESSAGE =
	'Les photos et les profils se suppriment et se modifient un par un, depuis leur fiche : rien n’a été modifié.'

/** The objects of one request that wait for the bin while a caller holds it (`heldTrash`). */
interface Pending {
	cles: string[]
	/** How many callers hold the bin: the objects move when the last one lets go. */
	retenue: number
	stockage: ObjectStorage | undefined
}

/** Keyed by the request itself: every nested operation of the Local API gets the same object. */
const PENDING = new WeakMap<PayloadRequest, Pending>()

/** The name of an error, and the status the storage gave: never its message, which may name a key. */
function errorSummary(erreur: unknown): string {
	const { name, $metadata } = (erreur ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
	const status = typeof $metadata?.httpStatusCode === 'number' ? ` (${$metadata.httpStatusCode})` : ''
	return `${typeof name === 'string' ? name : 'Error'}${status}`
}

/**
 * Moves these objects to the bin now. Without a storage (S3_ENDPOINT not set), there is no object
 * to move: a log line says so. When the storage fails, the error the request gets is a 503 in
 * French; the log says how many objects were put back, never which.
 */
async function moveObjects(req: PayloadRequest, stockage: ObjectStorage | undefined, cles: string[], sujet: string) {
	if (cles.length === 0) return
	const { logger } = req.payload
	if (!stockage) {
		logger.warn(`[corbeille] ${sujet}: no object storage, ${cles.length} object(s) left where they are`)
		return
	}
	try {
		const { deplacees, absentes } = await moveToTrash(stockage, cles)
		logger.info(
			`[corbeille] ${sujet}: ${deplacees.length} object(s) moved to the bin${absentes.length > 0 ? `, ${absentes.length} already missing` : ''}`
		)
	} catch (error) {
		const outage = error instanceof StorageOutage ? error : undefined
		logger.error(
			`[corbeille] ${sujet}: the storage failed (${errorSummary(outage?.cause ?? error)}); ${outage?.remises.length ?? 0} object(s) put back, ${outage?.nonRemises.length ?? 0} left in the bin`
		)
		throw new APIError(STORAGE_OUTAGE_MESSAGE, 503)
	}
}

/** Sends these objects to the bin: now, or when the caller that holds the bin lets go. */
async function toTrash(
	req: PayloadRequest,
	stockage: ObjectStorage | undefined,
	cles: string[],
	sujet: string
): Promise<void> {
	const pending = PENDING.get(req)
	if (pending && pending.retenue > 0) {
		pending.cles.push(...cles)
		pending.stockage ??= stockage
		return
	}
	await moveObjects(req, stockage, cles, sujet)
}

/**
 * Runs `travail`, holding back every move to the bin it asks for, then moves them all at once, as
 * the last step: when `travail` fails, nothing has moved; when the storage fails, nothing stays
 * moved. A deletion that takes several documents with it (a profile and its photos, an account and
 * its profile) runs in here, so that its objects move after the last document is written.
 *
 * The holds of one request run one inside the other, never side by side: a failed `travail` drops
 * every move asked since it began. Payload would run them side by side for the documents of one
 * operation on several at once, which `oneAtATime` refuses on `media` and `profils`.
 */
export async function heldTrash<T>(req: PayloadRequest, sujet: string, travail: () => Promise<T>): Promise<T> {
	const pending = PENDING.get(req) ?? { cles: [], retenue: 0, stockage: undefined }
	PENDING.set(req, pending)
	const start = pending.cles.length
	pending.retenue += 1
	let result: T
	try {
		result = await travail()
	} catch (error) {
		pending.cles.length = start
		throw error
	} finally {
		pending.retenue -= 1
	}
	if (pending.retenue === 0) await moveObjects(req, pending.stockage, pending.cles.splice(0), sujet)
	return result
}

/** The photos of a profile, main photo first, by identifier: the profile as Payload hands it, populated or not. */
const profilePhotos = (profil: { mainPicture?: unknown; gallery?: unknown } | undefined): (number | string)[] => [
	...namedPhotos(profil?.mainPicture),
	...namedPhotos(profil?.gallery),
]

/**
 * Which of these media something still references: a profile, by its main photo or its gallery; an
 * article, by its gallery, in its current state or in any of its versions (a published version, a
 * draft, a version an admin may restore). Read in the transaction of the request, without access
 * control.
 */
async function stillReferenced(req: PayloadRequest, ids: (number | string)[]): Promise<Set<string>> {
	const readOptions = { depth: 0, overrideAccess: true, pagination: false, req } as const
	const [profiles, articles, versions] = await Promise.all([
		req.payload.find({
			...readOptions,
			collection: 'profiles',
			select: { mainPicture: true, gallery: true },
			where: { or: [{ mainPicture: { in: ids } }, { gallery: { in: ids } }] },
		}),
		req.payload.find({
			...readOptions,
			collection: 'articles',
			select: { gallery: true },
			where: { gallery: { in: ids } },
		}),
		req.payload.findVersions({ ...readOptions, collection: 'articles', where: { 'version.gallery': { in: ids } } }),
	])
	return new Set(
		[
			...profiles.docs.flatMap(profilePhotos),
			...articles.docs.flatMap(({ gallery }) => namedPhotos(gallery)),
			...versions.docs.flatMap(({ version }) => namedPhotos(version?.gallery)),
		].map(String)
	)
}

/**
 * The clean-up of a profile: each of these media that nothing references any more is deleted, and
 * its objects go to the bin, all at once after the last deletion. A media that no longer exists is
 * left alone. Without a storage, no media is deleted: its object could not move, and the record is
 * all that would still say where it is.
 */
async function cleanup(
	req: PayloadRequest,
	stockage: ObjectStorage | undefined,
	candidates: (number | string)[],
	sujet: string
): Promise<void> {
	const ids = [...new Map(candidates.map(id => [String(id), id])).values()]
	if (ids.length === 0) return
	if (!stockage) {
		req.payload.logger.warn(
			`[corbeille] ${sujet}: no object storage, the clean-up is skipped and ${ids.length} media kept`
		)
		return
	}
	const referenced = await stillReferenced(req, ids)
	const unused = ids.filter(id => !referenced.has(String(id)))
	if (unused.length === 0) return
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { filename: true },
		where: { id: { in: unused } },
	})
	await heldTrash(req, sujet, async () => {
		// One by one: a deletion that fails throws, where a deletion of several would only list it.
		for (const { id } of docs)
			await req.payload.delete({ collection: 'media', id, depth: 0, overrideAccess: true, req })
	})
}

/** `afterChange` of `profils`: the photos a save takes out of the profile go through the clean-up. */
export const cleanupAfterSave =
	(stockage: ObjectStorage | undefined): CollectionAfterChangeHook =>
	async ({ context, doc, operation, previousDoc, req }) => {
		if (operation !== 'update' || isImport(context)) return doc
		const kept = new Set(profilePhotos(doc).map(String))
		const removed = profilePhotos(previousDoc).filter(id => !kept.has(String(id)))
		await cleanup(req, stockage, removed, `profile ${doc.id}`)
		return doc
	}

/** `afterDelete` of `profils`: its photos, and every photo of its account, go through the clean-up. */
export const cleanupAfterDeletion =
	(stockage: ObjectStorage | undefined): CollectionAfterDeleteHook =>
	async ({ context, doc, id, req }) => {
		if (isImport(context)) return doc
		const account = idOf((doc as { pro?: unknown }).pro)
		const accountPhotos =
			account === undefined || !stockage
				? []
				: (
						await req.payload.find({
							collection: 'media',
							depth: 0,
							overrideAccess: true,
							pagination: false,
							req,
							select: { owner: true },
							where: { owner: { equals: account } },
						})
					).docs.map(media => media.id)
		await cleanup(req, stockage, [...profilePhotos(doc), ...accountPhotos], `profile ${id}`)
		return doc
	}

/**
 * `beforeDelete` of `pros`: every photo of the account that nothing references goes through the
 * clean-up, before the database clears its owner. An account with a profile has them taken by the
 * deletion of the profile; this is for an account without one (ticket 167: no orphan photo).
 */
export const cleanupBeforeAccountDeletion =
	(stockage: ObjectStorage | undefined): CollectionBeforeDeleteHook =>
	async ({ context, id, req }) => {
		if (isImport(context) || !stockage) return
		const { docs } = await req.payload.find({
			collection: 'media',
			depth: 0,
			overrideAccess: true,
			pagination: false,
			req,
			select: {},
			where: { owner: { equals: id } },
		})
		await cleanup(
			req,
			stockage,
			docs.map(media => media.id),
			`account ${id}`
		)
	}

/**
 * `beforeOperation` of `media` and `profils`: a deletion or a change goes one document at a time,
 * by its identifier. An operation on several at once (by a `where`) is refused before anything is
 * read or written, whoever asks and by every API, the Local API without access control included:
 * Payload would commit it even when the storage fails for one of its documents. The import, which
 * moves nothing, writes as it likes.
 */
export const oneAtATime: CollectionBeforeOperationHook = ({ args, context, operation }) => {
	if (isImport(context) || (operation !== 'delete' && operation !== 'update')) return args
	if ((args as { id?: unknown }).id !== undefined) return args
	throw new APIError(ONE_AT_A_TIME_MESSAGE, 403, null, true)
}

/** `afterDelete` of `media`: its objects go to the bin. */
export const onDeletion =
	(stockage: ObjectStorage | undefined): CollectionAfterDeleteHook =>
	async ({ context, doc, id, req }) => {
		if (isImport(context)) return doc
		await toTrash(req, stockage, objectKeys(doc as MediaObjects), `media ${id}`)
		return doc
	}

/**
 * `afterChange` of `media`: when its file is replaced, the objects of the former file go to the
 * bin. It comes after the hook of the storage plugin, once the new file is written. An internal
 * write of the plugin (`skipCloudStorage`) moves nothing: it does not change the file.
 */
export const onReplacement =
	(stockage: ObjectStorage | undefined): CollectionAfterChangeHook =>
	async ({ context, doc, operation, previousDoc, req }) => {
		if (operation !== 'update' || isImport(context) || context.skipCloudStorage) return doc
		const kept = new Set(objectKeys(doc as MediaObjects))
		const previousKeys = objectKeys(previousDoc as MediaObjects).filter(cle => !kept.has(cle))
		await toTrash(req, stockage, previousKeys, `media ${doc.id}`)
		return doc
	}

type Hooks = NonNullable<CollectionConfig['hooks']>

/** Hides the former document from a hook of the storage plugin: it then uploads, and deletes nothing. */
const withoutPreviousDoc =
	(crochet: CollectionAfterChangeHook): CollectionAfterChangeHook =>
	args =>
		crochet({ ...args, previousDoc: undefined as unknown as typeof args.previousDoc })

/**
 * Takes the deletions of the storage plugin away from a collection: its `afterDelete` hooks, which
 * delete the objects of a deleted document, are dropped; its `afterChange` hooks, which upload a new
 * file and then delete the former one, no longer see the former document. `avant` is the collection
 * before the plugin: a hook it already had is left as it is.
 */
export function withoutPluginDeletion(collection: CollectionConfig, avant: Hooks | undefined): CollectionConfig {
	const added = (nom: 'afterChange' | 'afterDelete'): Set<unknown> =>
		new Set((collection.hooks?.[nom] ?? []).filter(crochet => !(avant?.[nom] ?? []).some(ancien => ancien === crochet)))
	const [changeHooks, deletionHooks] = [added('afterChange'), added('afterDelete')]
	if (changeHooks.size === 0 && deletionHooks.size === 0) return collection
	return {
		...collection,
		hooks: {
			...collection.hooks,
			afterChange: (collection.hooks?.afterChange ?? []).map(crochet =>
				changeHooks.has(crochet) ? withoutPreviousDoc(crochet) : crochet
			),
			afterDelete: (collection.hooks?.afterDelete ?? []).filter(crochet => !deletionHooks.has(crochet)),
		},
	}
}

/**
 * Gives a collection the bin: one document at a time first, before its own `beforeOperation`
 * hooks; these hooks after its own `afterChange` and `afterDelete`, so that the bin comes last.
 * The list view of the admin panel no longer offers to delete or change several documents at once
 * (`disableBulkDelete`, `disableBulkEdit`): Payload then refuses it by REST too, before `oneAtATime`.
 */
const withHooks = (
	collection: CollectionConfig,
	crochets: Pick<Hooks, 'afterChange' | 'afterDelete'>
): CollectionConfig => ({
	...collection,
	disableBulkDelete: true,
	disableBulkEdit: true,
	hooks: {
		...collection.hooks,
		beforeOperation: [oneAtATime, ...(collection.hooks?.beforeOperation ?? [])],
		afterChange: [...(collection.hooks?.afterChange ?? []), ...(crochets.afterChange ?? [])],
		afterDelete: [...(collection.hooks?.afterDelete ?? []), ...(crochets.afterDelete ?? [])],
	},
})

/**
 * The storage plugin (`greffon`, `@payloadcms/storage-s3`), with the bin in place of its
 * deletions: its own deletions are taken away from every collection it touches, then `media` and
 * `profils` get the bin (`withHooks`). `stockage` is the storage the bin moves the objects
 * in, or nothing when the application has none.
 */
export const withTrash =
	(greffon: Plugin, stockage: ObjectStorage | undefined): Plugin =>
	async config => {
		const before = new Map((config.collections ?? []).map(collection => [collection.slug, collection.hooks]))
		const configured = await greffon(config)
		return {
			...configured,
			collections: (configured.collections ?? []).map(collection => {
				const withoutPlugin = withoutPluginDeletion(collection, before.get(collection.slug))
				if (withoutPlugin.slug === 'media')
					return withHooks(withoutPlugin, {
						afterChange: [onReplacement(stockage)],
						afterDelete: [onDeletion(stockage)],
					})
				if (withoutPlugin.slug === 'profiles')
					return withHooks(withoutPlugin, {
						afterChange: [cleanupAfterSave(stockage)],
						afterDelete: [cleanupAfterDeletion(stockage)],
					})
				if (withoutPlugin.slug === 'pros')
					return {
						...withoutPlugin,
						hooks: {
							...withoutPlugin.hooks,
							beforeDelete: [...(withoutPlugin.hooks?.beforeDelete ?? []), cleanupBeforeAccountDeletion(stockage)],
						},
					}
				return withoutPlugin
			}),
		}
	}
