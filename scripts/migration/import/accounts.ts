/**
 * The accounts of the makeup artists, `up_users` → `pros` (docs/migration/SCHEMA.md, §5.1;
 * plan 01 §2.4, M1).
 *
 * - The email is the login: edge spaces removed, lower case (§5.1, one of the two transformations
 *   that change no page). Accounts that share one email stop the import until the table of
 *   decisions says which one is kept (./decisions.ts); the others are set aside.
 * - The account arrives confirmed, without a session, with a password drawn at random that
 *   nobody knows, and without a profile: the profiles are taken from the source on their own.
 * - The bcrypt hash of the old site is copied from base to base (rule 4): read into memory,
 *   written into `pros.legacyBcrypt`, and never into a file, a log or the report. Only a complete
 *   bcrypt hash is copied; any other value gives nothing. The one-time tokens are never read.
 */

import { randomBytes } from 'node:crypto'
import { NO_PROFILE_CONTEXT } from '../../../src/collections/Profiles'
import { applyDecisions, type Decisions, type DecisionsApplication } from './decisions'
import type { Adapter, Expected, Gap } from './engine'
import { REFERENCES } from './gaps'
import { iso, type Query } from './source'

/** A row of `up_users`, as the import reads it: never its tokens. */
export interface AccountRow {
	id: number
	username: string | null
	email: string | null
	provider: string | null
	password: string | null
	confirmed: boolean | null
	blocked: boolean | null
	created_at: string
	updated_at: string
}

export const ACCOUNTS_QUERY = `SELECT id, username, email, provider, password, confirmed, blocked,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at
	FROM up_users ORDER BY id`

export const readAccounts = (requete: Query): Promise<AccountRow[]> => requete<AccountRow>(ACCOUNTS_QUERY)

/** A complete bcrypt hash, the only one copied: version, cost, then 53 characters of salt and digest. */
export const FULL_BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

/** The login of an account: edge spaces removed, lower case. */
export const normalizedEmail = (email: string | null): string | null =>
	email === null ? null : email.trim().toLowerCase()

/** The password of a taken account: 32 random bytes, used by nobody, written nowhere but in Payload's hash. */
export const randomPassword = (): string => randomBytes(32).toString('base64url')

export const ACCOUNTS_ADAPTER: Adapter = {
	collection: 'pros',
	champs: {
		email: 'texte',
		name: 'texte',
		legacyProvider: 'texte',
		legacyBcrypt: 'texte',
		blocked: 'booleen',
		_verified: 'booleen',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// No confirmation email, and no automatic empty profile: the profile comes from the source.
	options: () => ({ disableVerificationEmail: true, contexte: NO_PROFILE_CONTEXT }),
}

/**
 * The accounts on a target the v3 already uses (`--cible-en-service`, ticket 227): an account the
 * target holds is left exactly as it is, every field of it, so that the import puts back neither the
 * legacy hash a sign-in erased, nor the email, the confirmation or the block the v3 changed. Only an
 * account the target misses is created.
 */
export const ACCOUNTS_IN_SERVICE_ADAPTER: Adapter = {
	...ACCOUNTS_ADAPTER,
	figes: Object.keys(ACCOUNTS_ADAPTER.champs),
}

/** The account the target must hold. The password is given at the creation only. */
export function expectedAccount(ligne: AccountRow, tirer: () => string = randomPassword): Expected {
	const email = normalizedEmail(ligne.email)
	const legacyBcrypt = ligne.password !== null && FULL_BCRYPT_HASH.test(ligne.password) ? ligne.password : null
	const gaps: Gap[] = []
	if (email !== ligne.email) gaps.push({ champ: 'email', reference: REFERENCES.emailEnMinuscules })
	if (legacyBcrypt !== ligne.password) gaps.push({ champ: 'legacyBcrypt', reference: REFERENCES.hashIncomplet })
	if (ligne.confirmed !== true) gaps.push({ champ: '_verified', reference: REFERENCES.compteConfirme })
	return {
		strapiId: ligne.id,
		valeurs: {
			strapiId: ligne.id,
			email,
			name: ligne.username,
			legacyProvider: ligne.provider,
			legacyBcrypt,
			blocked: ligne.blocked,
			_verified: true,
			createdAt: ligne.created_at,
			updatedAt: ligne.updated_at,
		},
		aLaCreation: { password: tirer() },
		ecarts: gaps,
	}
}

/** The groups of accounts that share one email, each one sorted, in the order of their first account. */
export function sharedEmailGroups(lignes: readonly AccountRow[]): number[][] {
	const byEmail = new Map<string, number[]>()
	for (const row of [...lignes].sort((a, b) => a.id - b.id)) {
		const email = normalizedEmail(row.email)
		if (email === null) continue
		byEmail.set(email, [...(byEmail.get(email) ?? []), row.id])
	}
	return [...byEmail.values()].filter(groupe => groupe.length > 1)
}

export interface ExpectedAccounts extends DecisionsApplication {
	attendus: Expected[]
	/** Kept accounts that received the legacy hash of an account set aside (ticket 066). */
	hashRattaches: number[]
	/** Legacy hashes of accounts set aside that no kept account could take. */
	hashNonRattaches: number
	/** Accounts not confirmed at the source: taken confirmed, and listed. */
	nonConfirmes: number[]
}

/** The accounts the import takes, those the decisions set aside, and the groups that stop it. */
export function expectedAccounts(
	lignes: readonly AccountRow[],
	decisions: Pick<Decisions, 'emailsPartages'>,
	tirer: () => string = randomPassword
): ExpectedAccounts {
	const application = applyDecisions(sharedEmailGroups(lignes), decisions)
	const pending = new Set([...application.ecartes, ...application.sansDecision.flat()])
	const taken = lignes.filter(({ id }) => !pending.has(id))
	const byId = new Map(lignes.map(ligne => [ligne.id, ligne]))
	// The kept account that has no hash of its own takes the one of the first account set aside (lowest identifier) that has one.
	const borrowedHashes = new Map<number, string>()
	let unattachedHashes = 0
	for (const { retenu: kept, ecartes: excluded, pretDuHash: lendHash } of application.rattaches) {
		const excludedHashes = excluded.flatMap(id => {
			const password = byId.get(id)?.password
			return password != null && FULL_BCRYPT_HASH.test(password) ? [password] : []
		})
		const keptPassword = byId.get(kept)?.password
		const alreadyHasOwn = keptPassword != null && FULL_BCRYPT_HASH.test(keptPassword)
		// Without an explicit decision, only a local kept account takes a loan: a Google or Facebook one never had a password.
		const ready = lendHash ?? (byId.get(kept)?.provider ?? 'local') === 'local'
		const [first, ...rest] = excludedHashes
		if (first !== undefined && !alreadyHasOwn && ready) {
			borrowedHashes.set(kept, first)
			unattachedHashes += rest.length
		} else unattachedHashes += excludedHashes.length
	}
	return {
		...application,
		hashRattaches: [...borrowedHashes.keys()].sort((a, b) => a - b),
		hashNonRattaches: unattachedHashes,
		attendus: taken.map(ligne => {
			const expected = expectedAccount(ligne, tirer)
			const borrowed = borrowedHashes.get(ligne.id)
			if (borrowed === undefined) return expected
			return {
				...expected,
				valeurs: { ...expected.valeurs, legacyBcrypt: borrowed },
				ecarts: [...expected.ecarts, { champ: 'legacyBcrypt', reference: REFERENCES.comptesEmailPartage }],
			}
		}),
		nonConfirmes: taken.filter(({ confirmed }) => confirmed !== true).map(({ id }) => id),
	}
}

/** How many accounts per provider of the old site, and how many legacy hashes, among these values. */
export function accountDistribution(documents: readonly { valeurs: Readonly<Record<string, unknown>> }[]): {
	fournisseurs: Record<string, number>
	hashHerites: number
} {
	const providers: Record<string, number> = {}
	let legacyHash = 0
	for (const { valeurs: values } of documents) {
		const provider = String(values.legacyProvider ?? 'aucun')
		providers[provider] = (providers[provider] ?? 0) + 1
		if (typeof values.legacyBcrypt === 'string' && FULL_BCRYPT_HASH.test(values.legacyBcrypt)) legacyHash++
	}
	return { fournisseurs: providers, hashHerites: legacyHash }
}
