/**
 * The whole fictional set, loaded in one call (tickets 052 and 053): the twelve profile types
 * (./chargement.ts), then three talents and three articles, one of them a draft (./redaction.ts).
 *
 *   const bilan = await poserLeJeu(payload)
 *
 * The same call fills the local test bench and the pre-production, and nowhere else: the guard
 * (./garde.ts) is asked before anything is read or written.
 *
 * - A talent or an article is found by its slug. One that is there is left as it is, a draft
 *   included: a second load creates nothing.
 * - Written like the import writes, with its context (src/lib/contexte-import.ts): no page of the
 *   site is refreshed, and no mail leaves.
 * - It holds no admin account: the admin accounts of the bench are the set of the tests
 *   (tests/fixtures/comptes.ts). On the pre-production, the first admin is the one Andy creates.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import type { Payload } from 'payload'
import { CONTEXTE_IMPORT } from '../lib/contexte-import'
import { type BilanDesProfils, exigerLaCibleDuJeu, type OptionsDuChargement, poserLesProfilsDuJeu } from './chargement'
import { ARTICLES_DU_JEU, TALENTS_DU_JEU } from './redaction'

export interface BilanDeLaRedaction {
	/** The slugs of the talents this load created. */
	talentsCrees: string[]
	/** The slugs of the articles this load created. */
	articlesCrees: string[]
	/** The slugs of the documents that were already there: left as they were. */
	presents: string[]
}

export interface BilanDuJeu {
	profils: BilanDesProfils
	redaction: BilanDeLaRedaction
}

/** True when a document of this collection already carries the slug, a draft included. */
async function existe(payload: Payload, collection: 'talents' | 'articles', slug: string): Promise<boolean> {
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
 * Loads the talents and the articles of the set that are not there yet. Outside the bench and the
 * pre-production, it stops before it reads or writes anything (`JeuFictifRefuse`).
 */
export async function poserLaRedactionDuJeu(
	payload: Payload,
	{ variables = process.env }: Pick<OptionsDuChargement, 'variables'> = {}
): Promise<BilanDeLaRedaction> {
	exigerLaCibleDuJeu(payload, variables)
	const bilan: BilanDeLaRedaction = { talentsCrees: [], articlesCrees: [], presents: [] }

	for (const talent of TALENTS_DU_JEU) {
		if (await existe(payload, 'talents', talent.slug)) {
			bilan.presents.push(talent.slug)
			continue
		}
		await payload.create({
			collection: 'talents',
			context: CONTEXTE_IMPORT,
			data: { ...talent, _status: 'published' },
			depth: 0,
		})
		bilan.talentsCrees.push(talent.slug)
	}

	for (const { statut, ...article } of ARTICLES_DU_JEU) {
		if (await existe(payload, 'articles', article.slug)) {
			bilan.presents.push(article.slug)
			continue
		}
		await payload.create({
			collection: 'articles',
			context: CONTEXTE_IMPORT,
			data: { ...article, _status: statut },
			depth: 0,
		})
		bilan.articlesCrees.push(article.slug)
	}
	return bilan
}

/** The profile types, then the newsroom: the whole set, on an empty database or on a filled one. */
export async function poserLeJeu(payload: Payload, options: OptionsDuChargement = {}): Promise<BilanDuJeu> {
	const profils = await poserLesProfilsDuJeu(payload, options)
	const redaction = await poserLaRedactionDuJeu(payload, options)
	return { profils, redaction }
}
