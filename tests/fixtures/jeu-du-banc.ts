/**
 * The whole set of the bench (ticket 052): the fixed accounts of the site (./comptes.ts), the
 * twelve profile types with their photos, the three talents and the three articles, one of them a
 * draft (src/demo-data/). `bun run banc:complet` and `bun run banc:reinitialiser` load it; a test
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

import { type BilanDuJeu as BilanDeLaRedactionEtDesProfils, poserLeJeu } from '../../src/demo-data/dataset'
import { PROFILS_DU_JEU } from '../../src/demo-data/profiles'
import { ARTICLES_DU_JEU, TALENTS_DU_JEU } from '../../src/demo-data/editorial'
import { payloadDeTest } from '../outils/payload-test'
import { type BilanDuJeu as BilanDesComptes, poserLesComptesDuJeu } from './comptes'

/** What the admin panel counts after a load of the set on an empty bench. */
export const CONTENU_DU_BANC = {
	/** The profile types: the accounts `jeu-profil-*`. */
	profilsTypes: PROFILS_DU_JEU.length,
	talents: TALENTS_DU_JEU.length,
	articles: ARTICLES_DU_JEU.length,
	/** Of which drafts. */
	brouillons: ARTICLES_DU_JEU.filter(({ statut }) => statut === 'draft').length,
} as const

export interface BilanDuBanc {
	comptes: BilanDesComptes
	jeu: BilanDeLaRedactionEtDesProfils
}

/** Loads the fixed accounts, then the set. The accounts come first: nothing of the set depends on them. */
export async function poserLeJeuDuBanc(): Promise<BilanDuBanc> {
	const comptes = await poserLesComptesDuJeu()
	const jeu = await poserLeJeu(await payloadDeTest())
	return { comptes, jeu }
}
