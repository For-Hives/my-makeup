/**
 * The whole fictional set, loaded in one call (tickets 052 and 053): the twelve profile types
 * (./chargement.ts), then three talents and three articles, one of them a draft (./redaction.ts).
 *
 *   const bilan = await placeDemoData(payload)
 *
 * The call fills the local test bench, and nowhere else: the guard
 * (./garde.ts) is asked before anything is read or written.
 *
 * - A talent or an article is found by its slug. One that is there is left as it is, a draft
 *   included: a second load creates nothing.
 * - Written like the import writes, with its context (src/lib/import-context.ts): no page of the
 *   site is refreshed, and no mail leaves.
 * - It holds no admin account: the admin accounts of the bench are the set of the tests
 *   (tests/fixtures/accounts.ts).
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import type { Payload } from 'payload'
import { IMPORT_CONTEXT } from '../lib/import-context'
import { DEMO_ARTICLES, DEMO_TALENTS } from './editorial'
import { type LoadingOptions, type ProfilesSummary, placeDemoProfiles, requireDemoTarget } from './loading'

export interface EditorialSummary {
	/** The slugs of the talents this load created. */
	talentsCrees: string[]
	/** The slugs of the articles this load created. */
	articlesCrees: string[]
	/** The slugs of the documents that were already there: left as they were. */
	presents: string[]
}

export interface DemoSummary {
	profils: ProfilesSummary
	redaction: EditorialSummary
}

/** True when a document of this collection already carries the slug, a draft included. */
async function exists(payload: Payload, collection: 'talents' | 'articles', slug: string): Promise<boolean> {
	const { totalDocs } = await payload.find({
		collection,
		depth: 0,
		draft: true,
		limit: 1,
		pagination: false,
		select: {},
		where: { slug: { equals: slug } },
	})
	return totalDocs > 0
}

/**
 * Loads the talents and the articles of the set that are not there yet. Outside the bench, it stops before it reads or writes anything (`DemoDataRefused`).
 */
export async function placeDemoEditorial(
	payload: Payload,
	{ variables = process.env }: Pick<LoadingOptions, 'variables'> = {}
): Promise<EditorialSummary> {
	requireDemoTarget(payload, variables)
	const summary: EditorialSummary = { talentsCrees: [], articlesCrees: [], presents: [] }

	for (const talent of DEMO_TALENTS) {
		if (await exists(payload, 'talents', talent.slug)) {
			summary.presents.push(talent.slug)
			continue
		}
		await payload.create({
			collection: 'talents',
			context: IMPORT_CONTEXT,
			data: { ...talent, _status: 'published' },
			depth: 0,
		})
		summary.talentsCrees.push(talent.slug)
	}

	for (const { statut: status, ...article } of DEMO_ARTICLES) {
		if (await exists(payload, 'articles', article.slug)) {
			summary.presents.push(article.slug)
			continue
		}
		await payload.create({
			collection: 'articles',
			context: IMPORT_CONTEXT,
			data: { ...article, _status: status },
			depth: 0,
		})
		summary.articlesCrees.push(article.slug)
	}
	return summary
}

/** The profile types, then the newsroom: the whole set, on an empty database or on a filled one. */
export async function placeDemoData(payload: Payload, options: LoadingOptions = {}): Promise<DemoSummary> {
	const profiles = await placeDemoProfiles(payload, options)
	const editorial = await placeDemoEditorial(payload, options)
	return { profils: profiles, redaction: editorial }
}
