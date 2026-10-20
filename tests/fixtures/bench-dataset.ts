/**
 * The whole set of the bench (ticket 052): the fixed accounts of the site (./comptes.ts), the
 * twelve profile types with their photos, the three talents and the three articles, one of them a
 * draft (src/demo-data/). `bun run bench:full` and `bun run bench:reset` load it; a test
 * that wants it calls `poserLeJeuDuBanc()`.
 *
 * Loaded on an empty bench it always gives the same content. Loaded on a filled one it creates
 * nothing. Outside the bench it stops before it reads or writes anything.
 *
 * What the admin panel then counts: 12 profile types (the accounts `jeu-profil-*`), 3 talents and
 * 3 articles. The profiles list holds 7 more, the empty profiles that the server creates with the
 * accounts of the fixed set (./comptes.ts): `COMPTES_DU_BANC` says it.
 *
 * Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
 */

import { type DemoSummary as BilanDeLaRedactionEtDesProfils, placeDemoData } from '../../src/demo-data/dataset'
import { DEMO_ARTICLES, DEMO_TALENTS } from '../../src/demo-data/editorial'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { testPayload } from '../support/payload-test'
import { type DatasetSummary as BilanDesComptes, setDatasetAccounts } from './accounts'

/** What the admin panel counts after a load of the set on an empty bench. */
export const BENCH_CONTENT = {
	/** The profile types: the accounts `jeu-profil-*`. */
	profilsTypes: DEMO_PROFILES.length,
	talents: DEMO_TALENTS.length,
	articles: DEMO_ARTICLES.length,
	/** Of which drafts. */
	brouillons: DEMO_ARTICLES.filter(({ statut }) => statut === 'draft').length,
} as const

export interface BenchSummary {
	comptes: BilanDesComptes
	jeu: BilanDeLaRedactionEtDesProfils
}

/** Loads the fixed accounts, then the set. The accounts come first: nothing of the set depends on them. */
export async function setBenchDataset(): Promise<BenchSummary> {
	const accounts = await setDatasetAccounts()
	const dataset = await placeDemoData(await testPayload())
	return { comptes: accounts, jeu: dataset }
}
