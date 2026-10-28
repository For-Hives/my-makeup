import { revalidatePath, revalidateTag } from 'next/cache.js'
import type {
	CollectionAfterChangeHook,
	CollectionAfterDeleteHook,
	CollectionBeforeChangeHook,
	CollectionBeforeDeleteHook,
	PayloadRequest,
	RequestContext,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { isImport } from '../lib/import-context'
import { PUBLISHED_STATUS } from '../lib/profile/status'
import { changeTargets, mergeTargets, type PublicContent, type PublicState, type Targets } from '../lib/revalidate'
import { changedUrls, keyIfSubmitAllowed, reportLater } from '../lib/seo/indexnow'

/**
 * The refresh of the public pages (ticket 047): when a profile, an article or a talent is created,
 * changed or deleted, the server tells Next which cached pages are stale, by the rule of
 * src/lib/revalidate.ts: the page of the document, the pages that list its collection, the
 * sitemap.
 *
 * - The public state is read from the stored row, before and after the write, in the transaction
 *   of the request: what the public is shown, whatever the request selected or may read. For an
 *   article or a talent, it is the published document, never a draft version saved over it.
 * - The import (src/lib/import-context.ts) refreshes nothing, and reads nothing for it.
 * - Next can only take a revalidation inside one of its requests: the REST API, the admin panel, a
 *   Server Action. A write outside of one (a script, a test, a job) is saved, and the pages keep
 *   their cache until it expires.
 * - A refresh that fails never undoes the save: it is logged, and the pages expire on their own.
 */

/** The field of the stored row that says whether the document is shown, and its public value. */
const VISIBILITY: Readonly<Record<PublicContent, { champ: 'status' | '_status'; valeur: string }>> = {
	profiles: { champ: 'status', valeur: PUBLISHED_STATUS },
	articles: { champ: '_status', valeur: 'published' },
	talents: { champ: '_status', valeur: 'published' },
}

type StoredRow = { id: number | string; slug?: unknown; indexable?: unknown } & Partial<
	Record<'status' | '_status', unknown>
>

/** The public state of a document, from its stored row; `null` when there is no row. */
async function readPublicState(
	req: PayloadRequest,
	contenu: PublicContent,
	id: number | string
): Promise<PublicState | null> {
	const { champ: field, valeur: value } = VISIBILITY[contenu]
	// query-keys: ignore `contenu` is profiles, articles or talents; their keys are read in tests/unit/query-keys.test.ts
	const row = await req.payload.db.findOne<StoredRow>({
		collection: contenu,
		req,
		select: { slug: true, [field]: true, ...(contenu === 'profiles' && { indexable: true }) },
		where: { id: { equals: id } },
	})
	if (!row) return null
	const visible = row[field] === value
	// A profile is in the sitemap when it is indexable (IndexNow, ticket 219); the others when published.
	return {
		slug: String(row.slug ?? ''),
		visible,
		indexable: contenu === 'profiles' ? row.indexable === true : visible,
	}
}

/**
 * Where the state read before a write waits for the hook that runs after it: in the context of
 * the request, which Payload hands to both hooks, nested writes included.
 */
const CONTEXT_KEY = 'etatsPublicsAvantEcriture'

function keptStates(context: RequestContext): Map<string, PublicState | null> {
	const kept = context[CONTEXT_KEY]
	if (kept instanceof Map) return kept as Map<string, PublicState | null>
	const fresh = new Map<string, PublicState | null>()
	context[CONTEXT_KEY] = fresh
	return fresh
}

const key = (contenu: PublicContent, id: number | string) => `${contenu}:${id}`

/** The state read before the write of this document, once: `null` when none was read. */
function resume(context: RequestContext, contenu: PublicContent, id: number | string): PublicState | null {
	const kept = keptStates(context)
	const state = kept.get(key(contenu, id)) ?? null
	kept.delete(key(contenu, id))
	return state
}

/**
 * True for the refusal of Next outside one of its requests: « Invariant: static generation store missing in
 * revalidateTag(…) » (or `revalidatePath(…)`). Next 16.3 put the code `E263` on this error; Next 16.4 no longer
 * does, so the refusal is told by its message, which names the function that was refused.
 */
export const outsideNextRequest = (erreur: unknown): boolean =>
	erreur instanceof Error &&
	/^Invariant: static generation store missing in revalidate(Tag|Path)\(/.test(erreur.message)

/**
 * Tells Next which pages are stale. A tag expires at once, rather than being served stale one last
 * time: a profile hidden, or contact details withdrawn, leave at the next visit.
 */
export function revalidateChange(req: PayloadRequest, { chemins, etiquettes }: Targets): void {
	if (chemins.length === 0 && etiquettes.length === 0) return
	// One call at a time: a refusal of one tag or path leaves the others refreshed, and never reaches the save.
	const calls = [
		...etiquettes.map(tag => () => revalidateTag(tag, { expire: 0 })),
		...chemins.map(path => () => revalidatePath(path)),
	]
	let failed = 0
	let first: unknown
	for (const call of calls) {
		try {
			call()
		} catch (error) {
			if (outsideNextRequest(error)) {
				req.payload.logger.debug('[revalidation] written outside of a request of Next: no page refreshed')
				return
			}
			failed += 1
			first ??= error
		}
	}
	if (failed > 0)
		req.payload.logger.error({
			err: first,
			msg: `[revalidation] ${failed} of ${calls.length} refreshes failed, the pages expire on their own: the save goes on`,
		})
}

/**
 * Tells IndexNow about the pages of a save (ticket 219), at the place where Next is told. Nothing leaves
 * without the key, off the site itself, or during the import (which never gets here). The request leaves
 * a few seconds later and never holds the save: a failure is logged by the queue.
 */
export function notifyEngines(
	req: PayloadRequest,
	contenu: PublicContent,
	avant: PublicState | null,
	apres: PublicState | null
): void {
	const key = keyIfSubmitAllowed()
	if (key === undefined) return
	try {
		reportLater(changedUrls(contenu, avant, apres), {
			cle: key,
			journal: {
				info: message => req.payload.logger.info(message),
				error: message => req.payload.logger.error(message),
			},
		})
	} catch (error) {
		req.payload.logger.error({ err: error, msg: '[indexnow] the addresses of this write were not queued' })
	}
}

/** The hooks of the refresh of one collection, to add to its own. */
export interface RefreshHooks {
	/** `beforeChange`: reads the public state before an update. */
	avantEcriture: CollectionBeforeChangeHook
	/** `afterChange`, after the hooks that change the document (the fallback slug of a profile). */
	apresEcriture: CollectionAfterChangeHook
	/** `beforeDelete`: reads the public state before a deletion. */
	avantSuppression: CollectionBeforeDeleteHook
	/** `afterDelete`. */
	apresSuppression: CollectionAfterDeleteHook
}

/**
 * Runs one step of a refresh, and never lets it reach the save: a failure (a read of the state, Next, the
 * queue of IndexNow) is logged, and the pages expire on their own at the end of their hour.
 */
async function safely<T>(req: PayloadRequest, step: string, run: () => Promise<T> | T, fallback: T): Promise<T> {
	try {
		return await run()
	} catch (error) {
		req.payload.logger.error({ err: error, msg: `[revalidation] ${step} failed: the save goes on` })
		return fallback
	}
}

export function refresh(contenu: PublicContent): RefreshHooks {
	return {
		avantEcriture: async ({ context, data, operation, originalDoc, req }) => {
			const id = originalDoc?.id
			if (isImport(context) || operation !== 'update' || id === undefined) return data
			const state = await safely(req, 'the read before the write', () => readPublicState(req, contenu, id), undefined)
			if (state !== undefined) keptStates(context).set(key(contenu, id), state)
			return data
		},
		apresEcriture: async ({ context, doc, operation, req }) => {
			if (isImport(context)) return doc
			const before = operation === 'create' ? null : resume(context, contenu, doc.id)
			await safely(
				req,
				'the refresh',
				async () => {
					const after = await readPublicState(req, contenu, doc.id)
					revalidateChange(req, changeTargets(contenu, before, after))
					notifyEngines(req, contenu, before, after)
				},
				undefined
			)
			return doc
		},
		avantSuppression: async ({ context, id, req }) => {
			if (isImport(context)) return
			const state = await safely(
				req,
				'the read before the deletion',
				() => readPublicState(req, contenu, id),
				undefined
			)
			if (state !== undefined) keptStates(context).set(key(contenu, id), state)
		},
		apresSuppression: async ({ context, doc, id, req }) => {
			if (isImport(context)) return doc
			const before = resume(context, contenu, id)
			await safely(
				req,
				'the refresh',
				() => {
					revalidateChange(req, changeTargets(contenu, before, null))
					notifyEngines(req, contenu, before, null)
				},
				undefined
			)
			return doc
		},
	}
}

/** The most documents a photo is looked up in: a photo belongs to one profile, or to a few articles. */
const MEDIA_USERS_MAX = 50

/** The pages that show a photo: the published profiles and articles that hold it, read from the stored rows. */
async function pagesShowing(req: PayloadRequest, id: number | string): Promise<Targets> {
	const profiles = await req.payload.db.find<StoredRow>({
		collection: 'profiles',
		limit: MEDIA_USERS_MAX,
		pagination: false,
		req,
		select: { slug: true, status: true },
		where: { or: [{ mainPicture: { equals: id } }, { gallery: { equals: id } }] },
	})
	const articles = await req.payload.db.find<StoredRow>({
		collection: 'articles',
		limit: MEDIA_USERS_MAX,
		pagination: false,
		req,
		select: { slug: true, _status: true },
		where: { gallery: { equals: id } },
	})
	const targets = (contenu: PublicContent, rows: readonly StoredRow[]): Targets[] =>
		rows.map(row => {
			const state: PublicState = {
				slug: String(row.slug ?? ''),
				visible: row[VISIBILITY[contenu].champ] === VISIBILITY[contenu].valeur,
			}
			return changeTargets(contenu, state, state)
		})
	return mergeTargets(...targets('profiles', profiles.docs), ...targets('articles', articles.docs))
}

/** The hooks of the refresh of the media (the photos): a photo changed or deleted refreshes the pages that show it. */
export interface MediaRefreshHooks {
	/** `afterChange`: a replaced file or a new alternative text. A creation shows nowhere yet: the save of the document that takes the photo refreshes. */
	apresEcriture: CollectionAfterChangeHook
	/** `beforeDelete`: reads the pages that show the photo, which the database forgets with the deletion. */
	avantSuppression: CollectionBeforeDeleteHook
	/** `afterDelete`. */
	apresSuppression: CollectionAfterDeleteHook
}

const MEDIA_KEY = 'pagesDuMediaAvantSuppression'

export function refreshMedia(): MediaRefreshHooks {
	return {
		apresEcriture: async ({ context, doc, operation, req }) => {
			// `skipCloudStorage` is the storage plugin writing the url of the file it has just uploaded: nothing shows it yet.
			if (isImport(context) || operation !== 'update' || context.skipCloudStorage) return doc
			await safely(
				req,
				'the refresh of a photo',
				async () => revalidateChange(req, await pagesShowing(req, doc.id)),
				undefined
			)
			return doc
		},
		avantSuppression: async ({ context, id, req }) => {
			if (isImport(context)) return
			const targets = await safely(req, 'the read of the pages of a photo', () => pagesShowing(req, id), undefined)
			if (targets !== undefined) context[`${MEDIA_KEY}:${id}`] = targets
		},
		apresSuppression: async ({ context, doc, id, req }) => {
			if (isImport(context)) return doc
			const targets = context[`${MEDIA_KEY}:${id}`] as Targets | undefined
			delete context[`${MEDIA_KEY}:${id}`]
			if (targets) await safely(req, 'the refresh of a photo', () => revalidateChange(req, targets), undefined)
			return doc
		},
	}
}
