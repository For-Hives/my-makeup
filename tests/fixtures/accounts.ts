/**
 * The fixed set of accounts of the bench (plan 02 §6; ticket 050): one account of each type the
 * factory knows, always the same — same address, same name, same id on the old site. Loaded on an
 * empty bench, it gives a bench where every kind of account of the site exists; loaded again, it
 * creates nothing.
 *
 * No password, as everywhere on the bench: each account gets one drawn at random and forgotten at
 * once. A test that needs the session of one of them opens it with `ouvrirSessionSansMotDePasse`
 * (tests/support/session.ts); an account that cannot log in is there to be found, not to log in.
 *
 * Everything is made up: addresses in `@example.test`, names that say what the account is, ids on
 * the old site from 900 001, which neither the fake Strapi source nor the factory ever gives.
 *
 * Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
 */

import type { AuthCollectionSlug } from 'payload'
import {
	ACCOUNT_DOMAIN,
	ACCOUNT_TYPES,
	type AccountType,
	type AccountValues,
	createFixedAccount,
	type Dependencies,
	type FixedAccount,
} from '../support/account-factory'
import { requireBench, requireBenchSignIn, testPayload } from '../support/payload-test'

/** The address of the account of this type in the set: the same at every load. */
export const datasetUrl = (type: AccountType): string => `jeu-${type}@${ACCOUNT_DOMAIN}`

/**
 * What each account of the set holds besides its address, in the order the set creates them. A
 * type the factory adds has its line here: the compiler asks for it.
 */
export const DATASET_ACCOUNTS: { readonly [Type in AccountType]: Omit<AccountValues, 'email'> } = {
	admin: {},
	redaction: {},
	maquilleuse: { nom: 'Maquilleuse du jeu' },
	'maquilleuse-non-verifiee': { nom: 'Non vérifiée du jeu' },
	'maquilleuse-sans-profil': { nom: 'Sans profil du jeu' },
	'maquilleuse-bloquee': { nom: 'Bloquée du jeu' },
	'reprise-avec-hash': { nom: 'Reprise du jeu', strapiId: 900_001 },
	'reprise-google': { nom: 'Reprise Google du jeu', strapiId: 900_002 },
	'reprise-google-avec-hash': { nom: 'Reprise Google avec hash du jeu', strapiId: 900_003 },
	'reprise-facebook': { nom: 'Reprise Facebook du jeu', strapiId: 900_004 },
}

export const DATASET_TYPES = Object.keys(DATASET_ACCOUNTS) as AccountType[]

export interface DatasetSummary {
	/** Every account of the set, in its order, whether this load created it or found it. */
	comptes: FixedAccount[]
	/** The types whose account this load created. */
	crees: AccountType[]
	/** The types whose account was already there, found by its address: left as it was. */
	presents: AccountType[]
}

/**
 * Loads the set into the bench database: creates each account the set holds that is not there
 * yet, one after the other, so that an empty bench always gives the same identifiers. Outside the
 * bench, it stops before it reads or writes anything.
 */
export async function setDatasetAccounts(dependances: Omit<Dependencies, 'motDePasse'> = {}): Promise<DatasetSummary> {
	const { payload: getPayload = testPayload, variables } = dependances
	requireBench(variables)
	const payload = await getPayload()
	requireBenchSignIn(payload, variables)

	const summary: DatasetSummary = { comptes: [], crees: [], presents: [] }
	for (const type of DATASET_TYPES) {
		const collection: AuthCollectionSlug = ACCOUNT_TYPES[type].collection
		const email = datasetUrl(type)
		const { docs } = await payload.find({
			collection,
			depth: 0,
			limit: 1,
			pagination: false,
			select: {},
			where: { email: { equals: email } },
		})
		const present = docs[0]
		if (present) {
			summary.comptes.push({ type, collection, id: present.id, email })
			summary.presents.push(type)
			continue
		}
		summary.comptes.push(await createFixedAccount(type, { email, ...DATASET_ACCOUNTS[type] }, dependances))
		summary.crees.push(type)
	}
	return summary
}
