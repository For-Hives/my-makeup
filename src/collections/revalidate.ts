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
import { changeTargets, type PublicContent, type PublicState, type Targets } from '../lib/revalidate'
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

type StoredRow = { id: number | string; slug?: unknown; publishable?: unknown } & Partial<
	Record<'status' | '_status', unknown>
>

/** The public state of a document, from its stored row; `null` when there is no row. */
async function readPublicState(
	req: PayloadRequest,
	contenu: PublicContent,
	id: number | string
): Promise<PublicState | null> {
	const { champ: field, valeur: value } = VISIBILITY[contenu]
	const row = await req.payload.db.findOne<StoredRow>({
		collection: contenu,
		req,
		select: { slug: true, [field]: true, ...(contenu === 'profiles' && { publishable: true }) },
		where: { id: { equals: id } },
	})
	if (!row) return null
	const visible = row[field] === value
	// A profile is in the sitemap when it is publishable (IndexNow, ticket 219); the others when published.
	return {
		slug: String(row.slug ?? ''),
		visible,
		indexable: contenu === 'profiles' ? row.publishable === true : visible,
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

/** True for the refusal of Next outside one of its requests (`E263`, « static generation store missing »). */
export const outsideNextRequest = (erreur: unknown): boolean =>
	erreur instanceof Error && '__NEXT_ERROR_CODE' in erreur && erreur.__NEXT_ERROR_CODE === 'E263'

/**
 * Tells Next which pages are stale. A tag expires at once, rather than being served stale one last
 * time: a profile hidden, or contact details withdrawn, leave at the next visit.
 */
export function revalidateChange(req: PayloadRequest, { chemins, etiquettes }: Targets): void {
	if (chemins.length === 0 && etiquettes.length === 0) return
	try {
		for (const tag of etiquettes) revalidateTag(tag, { expire: 0 })
		for (const path of chemins) revalidatePath(path)
	} catch (error) {
		if (outsideNextRequest(error)) {
			req.payload.logger.debug('[revalidation] written outside of a request of Next: no page refreshed')
			return
		}
		req.payload.logger.error({ err: error, msg: '[revalidation] the public pages of this write were not refreshed' })
	}
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

export function refresh(contenu: PublicContent): RefreshHooks {
	return {
		avantEcriture: async ({ context, data, operation, originalDoc, req }) => {
			const id = originalDoc?.id
			if (isImport(context) || operation !== 'update' || id === undefined) return data
			keptStates(context).set(key(contenu, id), await readPublicState(req, contenu, id))
			return data
		},
		apresEcriture: async ({ context, doc, operation, req }) => {
			if (isImport(context)) return doc
			const before = operation === 'create' ? null : resume(context, contenu, doc.id)
			const after = await readPublicState(req, contenu, doc.id)
			revalidateChange(req, changeTargets(contenu, before, after))
			notifyEngines(req, contenu, before, after)
			return doc
		},
		avantSuppression: async ({ context, id, req }) => {
			if (isImport(context)) return
			keptStates(context).set(key(contenu, id), await readPublicState(req, contenu, id))
		},
		apresSuppression: ({ context, doc, id, req }) => {
			if (isImport(context)) return doc
			const before = resume(context, contenu, id)
			revalidateChange(req, changeTargets(contenu, before, null))
			notifyEngines(req, contenu, before, null)
			return doc
		},
	}
}
