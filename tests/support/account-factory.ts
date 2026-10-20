/**
 * The account factory of the bench: one call creates a made-up account in the bench database
 * and gives back a session that is ready to use, by an HTTP client as by a browser.
 *
 *   const compte = await creerCompte('admin')
 *   await fetch(`${adresse}/api/admins/me`, { headers: compte.session.enTetes })
 *
 * Nobody types a password: the factory draws one at random, uses it once to open the session,
 * and forgets it. It is neither returned nor printed.
 *
 * It knows every kind of account the site holds (ticket 050): the two roles of the admin panel,
 * makeup artists with or without a profile, not confirmed, blocked, and the accounts the old site
 * brings — with the bcrypt hash of a fixture password, from Google with or without a hash, from
 * Facebook.
 *
 * Outside the bench the factory stops before it writes anything.
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { AuthCollectionSlug, Payload, RequestContext, RequiredDataFromCollectionSlug } from 'payload'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import type { Variables } from './bench'
import { requireBench, requireBenchSignIn, testPayload } from './payload-test'
import { openSession, openSessionWithoutPassword, type Session } from './session'

/** Reserved for tests (RFC 6761): no mail can ever be delivered to it. */
export const ACCOUNT_DOMAIN = 'example.test'

/** How an account logged in on the old site: what `pros.legacyProvider` holds. */
export type LegacyProvider = 'local' | 'google' | 'facebook'

/**
 * An account the old site brings, as the import writes it (plan 01 §2.4, M1; ticket 025):
 * confirmed, with its provider and its id on the old site, a password drawn at random that nobody
 * knows — not even a test that chose its own — and the bcrypt hash of the old site when it had one.
 */
export interface Retry {
	fournisseur: LegacyProvider
	/** It brings a bcrypt hash: always the hash of `MOT_DE_PASSE_HERITE_DE_FIXTURE`, never a real one. */
	hashHerite: boolean
}

/**
 * How an account of this type gets its session:
 * - absent, the default: by Payload's login, with the password the factory drew;
 * - `'sans-mot-de-passe'`: without a password, the way a login by Google opens one;
 * - `false`: never, the account cannot log in.
 */
export type SignIn = 'sans-mot-de-passe' | false

/** One type of account: the collection it lives in, and what it holds besides its address and its password. */
export interface AccountDeclaration<Slug extends AuthCollectionSlug> {
	collection: Slug
	donnees: () => Omit<RequiredDataFromCollectionSlug<Slug>, 'email' | 'password'>
	/** Handed to Payload with the creation (`context`): what the hooks of the collection read. */
	contexte?: RequestContext
	/** The account comes from the old site. */
	reprise?: Retry
	connexion?: SignIn
}

const declare = <Slug extends AuthCollectionSlug>(declaration: AccountDeclaration<Slug>) => declaration

/**
 * A type of account that cannot log in (an address not confirmed yet, a blocked account…): no
 * session is opened, and the account comes back with `session: null`.
 */
const declareWithoutSession = <Slug extends AuthCollectionSlug>(declaration: AccountDeclaration<Slug>) => ({
	...declaration,
	connexion: false as const,
})

/** A type of account that logs in without a password (by Google): its session is opened without one. */
const declareWithoutPassword = <Slug extends AuthCollectionSlug>(declaration: AccountDeclaration<Slug>) => ({
	...declaration,
	connexion: 'sans-mot-de-passe' as const,
})

/** A made-up display name, different at each call: two accounts made side by side never share one. */
const fakeName = (prefixe: string) => `${prefixe} ${randomUUID().slice(0, 8)}`

/**
 * The types of account the factory knows. A collection of accounts adds its own here, one
 * declaration each: nothing else changes in this file. Each type also has its account in the
 * fixed set of the bench (tests/fixtures/accounts.ts), which the compiler asks for.
 */
export const ACCOUNT_TYPES = {
	/** An account of the admin panel with the role `admin`: it may do everything. */
	admin: declare({ collection: 'admins', donnees: () => ({ role: 'admin' as const }) }),
	/** An account of the admin panel with the role `editor`: articles and talents, and its own account. */
	redaction: declare({ collection: 'admins', donnees: () => ({ role: 'editor' as const }) }),
	/** The account of a makeup artist, address confirmed, with its empty profile. Call it twice for « A » and « B ». */
	maquilleuse: declare({ collection: 'pros', donnees: () => ({ name: fakeName('Maquilleuse'), _verified: true }) }),
	/** The account of a makeup artist who has not confirmed her address: it cannot log in. */
	'maquilleuse-non-verifiee': declareWithoutSession({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Non vérifiée'), _verified: false }),
	}),
	/** The account of a makeup artist without a profile, as some accounts of the old site come. */
	'maquilleuse-sans-profil': declare({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Sans profil'), _verified: true }),
		contexte: NO_PROFILE_CONTEXT,
	}),
	/**
	 * A makeup artist an admin has blocked, with her profile. No session: blocking closes them, and
	 * the login turns her away (ticket 089). Her password is the drawn one, so that a test that
	 * gives its own (`motDePasse`) can try the right password on her.
	 */
	'maquilleuse-bloquee': declareWithoutSession({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Bloquée'), _verified: true, blocked: true }),
	}),
	/**
	 * An account of the old site with its bcrypt hash, and its profile. She logs in with her old
	 * password through the legacy path of the site (ticket 087): until then, no session.
	 */
	'reprise-avec-hash': declareWithoutSession({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Reprise'), _verified: true }),
		reprise: { fournisseur: 'local', hashHerite: true },
	}),
	/** An old Google account without a password, and its profile: she logs in by Google. */
	'reprise-google': declareWithoutPassword({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Reprise Google'), _verified: true }),
		reprise: { fournisseur: 'google', hashHerite: false },
	}),
	/** An old Google account that also has a bcrypt hash, as one real account has: by Google, or by her old password. */
	'reprise-google-avec-hash': declareWithoutPassword({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Reprise Google avec hash'), _verified: true }),
		reprise: { fournisseur: 'google', hashHerite: true },
	}),
	/**
	 * An old Facebook account, and its profile. Facebook is gone and she has no password: she cannot
	 * log in until she sets one through « mot de passe oublié » (ticket 093).
	 */
	'reprise-facebook': declareWithoutSession({
		collection: 'pros',
		donnees: () => ({ name: fakeName('Reprise Facebook'), _verified: true }),
		reprise: { fournisseur: 'facebook', hashHerite: false },
	}),
}

export type AccountType = keyof typeof ACCOUNT_TYPES

/** `null` for a type of account that cannot log in, a session for every other one. */
export type SessionOf<Type extends AccountType> = Type extends unknown
	? (typeof ACCOUNT_TYPES)[Type] extends { connexion: false }
		? null
		: Session
	: never

/** The types of account that log in: their session is never `null`. */
export type TypeWithSession = { [Type in AccountType]: SessionOf<Type> extends null ? never : Type }[AccountType]

/** An account made by the factory, without its session: what the fixed set of the bench holds. */
export interface FixedAccount<Type extends AccountType = AccountType> {
	type: Type
	collection: AuthCollectionSlug
	id: number | string
	/** Always in `@example.test`. */
	email: string
}

export interface TestAccount<Type extends AccountType = AccountType> extends FixedAccount<Type> {
	/** Unique: two calls never give the same account. */
	email: string
	session: SessionOf<Type>
}

/** What a test may replace. Nothing to give in an integration test: the defaults are the bench. */
export interface Dependencies {
	payload?: () => Promise<Payload>
	/** The password of an account that logs in by password. An account of the old site never gets it. */
	motDePasse?: () => string
	variables?: Variables
}

/** What a caller may fix in an account: the fixed set of the bench gives the same ones every time. */
export interface AccountValues {
	/** In `@example.test`, and nowhere else. */
	email: string
	/** The display name of a makeup artist. Without it, a made-up one. */
	nom?: string
	/** The id on the old site of an account it brings. Without it, `strapiIdDeTest()`. */
	strapiId?: number
}

export const testUrl = (type: AccountType): string => `${type}-${randomUUID()}@${ACCOUNT_DOMAIN}`

/** 32 characters drawn at random: never typed, never shown. */
export const randomPassword = (): string => randomBytes(24).toString('base64url')

/**
 * The id on the old site of an account a test makes: from 1 000 000 up, far above the ids of the
 * fake Strapi source and of the fixed set of the bench, so that a test never takes one of theirs.
 */
export const testStrapiId = (): number => randomInt(1_000_000, 2_000_000_000)

/**
 * The password of the old site behind every fixture hash. Fictional and public: it opens nothing
 * but an account of the bench, through the legacy path of the site.
 */
export const FIXTURE_LEGACY_PASSWORD = 'fixture-ancien-site-du-banc'

/**
 * The salt of the fixture hash. Fixed, so that the hash is the same at every creation, on every
 * bench; version `2a` and cost 10, like every hash of the old site (plan 01 §2.4).
 */
export const FIXTURE_SALT_BCRYPT = '$2a$10$FabriqueDeComptesDuBa.'

let fixtureHash: Promise<string> | undefined

/**
 * The fixture hash, worked out by the PostgreSQL of the bench with pgcrypto, as the fake Strapi
 * source does: no hash written in a file, and an oracle that does not share the bcryptjs the site checks it with. pgcrypto lives
 * inside one transaction, which is rolled back: the bench database keeps nothing of it. Worked out
 * once per process.
 */
function fixtureHashLegacy(payload: Payload): Promise<string> {
	fixtureHash ??= computeFixtureHash(payload).catch((erreur: unknown) => {
		fixtureHash = undefined
		throw erreur
	})
	return fixtureHash
}

async function computeFixtureHash(payload: Payload): Promise<string> {
	const client = await payload.db.pool.connect()
	try {
		await client.query('BEGIN')
		await client.query('CREATE SCHEMA fabrique_bcrypt')
		await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA fabrique_bcrypt')
		// Wherever pgcrypto lives: in the schema above, or where a database that already had it keeps it.
		const { rows: extensions } = await client.query<{ schema: string }>(
			`SELECT quote_ident(n.nspname) AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
			 WHERE e.extname = 'pgcrypto'`
		)
		const schema = extensions[0]?.schema ?? 'fabrique_bcrypt'
		const { rows } = await client.query<{ hash: string }>(`SELECT ${schema}.crypt($1, $2) AS hash`, [
			FIXTURE_LEGACY_PASSWORD,
			FIXTURE_SALT_BCRYPT,
		])
		const hash = rows[0]?.hash
		if (!hash) throw new Error('PostgreSQL n’a rendu aucun hash bcrypt pour le compte de fixture.')
		return hash
	} finally {
		const canceled = await client.query('ROLLBACK').then(
			() => true,
			() => false
		)
		client.release(!canceled)
	}
}

/**
 * Writes an account of this type in the bench database. The password goes back to this module
 * only: it opens the session, then is forgotten.
 */
async function writeAccount(
	payload: Payload,
	type: AccountType,
	valeurs: AccountValues,
	tirer: () => string
): Promise<{ id: number | string; motDePasse: string }> {
	if (!valeurs.email.endsWith(`@${ACCOUNT_DOMAIN}`))
		throw new Error(`Un compte de test a une adresse en @${ACCOUNT_DOMAIN}, et nulle part ailleurs.`)
	const {
		collection,
		donnees: data,
		contexte: context,
		reprise: retry,
	}: AccountDeclaration<AuthCollectionSlug> = ACCOUNT_TYPES[type]
	// An account of the old site has a password nobody knows, as the import gives it.
	const password = retry ? randomPassword() : tirer()
	const heritage = retry
		? {
				legacyProvider: retry.fournisseur,
				strapiId: valeurs.strapiId ?? testStrapiId(),
				...(retry.hashHerite ? { legacyBcrypt: await fixtureHashLegacy(payload) } : {}),
			}
		: {}
	// One call for every collection of accounts: the compiler has checked each declaration already.
	const create = payload.create.bind(payload) as unknown as (options: {
		collection: AuthCollectionSlug
		data: Record<string, unknown>
		context?: RequestContext
		disableVerificationEmail: boolean
	}) => Promise<{ id: number | string }>
	const account = await create({
		collection,
		data: {
			...data(),
			...(valeurs.nom === undefined ? {} : { name: valeurs.nom }),
			...heritage,
			email: valeurs.email,
			password: password,
		},
		context: context,
		disableVerificationEmail: true,
	})
	return { id: account.id, motDePasse: password }
}

/**
 * Creates an account of this type in the bench database and opens its session. No mail leaves:
 * the confirmation email Payload would send for a new makeup artist is not sent.
 */
export async function createAccount<Type extends AccountType = 'admin'>(
	type: Type = 'admin' as Type,
	dependances: Dependencies = {}
): Promise<TestAccount<Type>> {
	const { payload: getPayload = testPayload, motDePasse: draw = randomPassword, variables } = dependances
	// Twice, and both before the first write: the environment before Payload is even loaded,
	// then the database Payload is really connected to.
	requireBench(variables)
	const payload = await getPayload()
	requireBenchSignIn(payload, variables)

	const { collection, connexion: signIn }: AccountDeclaration<AuthCollectionSlug> = ACCOUNT_TYPES[type]
	const email = testUrl(type)
	const { id, motDePasse: password } = await writeAccount(payload, type, { email }, draw)
	let session: Session | null = null
	if (signIn === 'sans-mot-de-passe') session = await openSessionWithoutPassword(payload, { collection, id }, variables)
	else if (signIn !== false)
		session = await openSession(payload, { collection, email, motDePasse: password }, variables)
	return { type, collection, id, email, session: session as SessionOf<Type> }
}

/**
 * Creates an account of this type with the values the caller fixes, and opens no session: for a
 * set of accounts that must be the same every time (tests/fixtures/accounts.ts). Its password is
 * drawn and forgotten at once.
 */
export async function createFixedAccount<Type extends AccountType>(
	type: Type,
	valeurs: AccountValues,
	dependances: Omit<Dependencies, 'motDePasse'> = {}
): Promise<FixedAccount<Type>> {
	const { payload: getPayload = testPayload, variables } = dependances
	requireBench(variables)
	const payload = await getPayload()
	requireBenchSignIn(payload, variables)

	const { id } = await writeAccount(payload, type, valeurs, randomPassword)
	return { type, collection: ACCOUNT_TYPES[type].collection, id, email: valeurs.email }
}
