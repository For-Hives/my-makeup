import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { AuthenticationError, UnverifiedEmail } from 'payload'
import { z } from 'zod'
import { DATASET_ACCOUNTS, DATASET_TYPES, datasetUrl, setDatasetAccounts } from '../fixtures/accounts'
import {
	ACCOUNT_TYPES,
	type AccountType,
	createAccount,
	FIXTURE_LEGACY_PASSWORD,
	type FixedAccount,
	type LegacyProvider,
} from '../support/account-factory'
import { countLines, emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { HASH_BCRYPT_FULL } from '../support/source-strapi/inventory'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Every type of account of the site, made by the factory, and the fixed set of the bench that
 * holds one of each (ticket 050). Written from what each type must be, not from the declarations
 * of the factory: a type added to the factory without its line in `ATTENDU` does not compile.
 */

/** How the account gets its session: by its password, without one (as by Google), or never. */
type Access = 'mot-de-passe' | 'sans-mot-de-passe' | 'aucun'

interface Expected {
	collection: 'admins' | 'pros'
	acces: Access
	/** For a makeup artist: what the database holds besides her address and her password. */
	pro?: {
		verifie: boolean
		blocked: boolean
		fournisseur: LegacyProvider | null
		hashHerite: boolean
		profils: 0 | 1
	}
}

const artist = (pro: Partial<NonNullable<Expected['pro']>> = {}): NonNullable<Expected['pro']> => ({
	verifie: true,
	blocked: false,
	fournisseur: null,
	hashHerite: false,
	profils: 1,
	...pro,
})

const EXPECTED: Record<AccountType, Expected> = {
	admin: { collection: 'admins', acces: 'mot-de-passe' },
	redaction: { collection: 'admins', acces: 'mot-de-passe' },
	maquilleuse: { collection: 'pros', acces: 'mot-de-passe', pro: artist() },
	'maquilleuse-non-verifiee': { collection: 'pros', acces: 'aucun', pro: artist({ verifie: false }) },
	'maquilleuse-sans-profil': { collection: 'pros', acces: 'mot-de-passe', pro: artist({ profils: 0 }) },
	'maquilleuse-bloquee': { collection: 'pros', acces: 'aucun', pro: artist({ blocked: true }) },
	'reprise-avec-hash': {
		collection: 'pros',
		acces: 'aucun',
		pro: artist({ fournisseur: 'local', hashHerite: true }),
	},
	'reprise-google': { collection: 'pros', acces: 'sans-mot-de-passe', pro: artist({ fournisseur: 'google' }) },
	'reprise-google-avec-hash': {
		collection: 'pros',
		acces: 'sans-mot-de-passe',
		pro: artist({ fournisseur: 'google', hashHerite: true }),
	},
	'reprise-facebook': { collection: 'pros', acces: 'aucun', pro: artist({ fournisseur: 'facebook' }) },
}

const TYPES = Object.keys(ACCOUNT_TYPES) as AccountType[]

const MyAccount = z.object({ user: z.object({ id: z.number(), email: z.string() }).nullable() })

/** The row of an account as the database holds it, the fields no API lets out included. */
interface Line {
	id: number
	email: string
	name?: string | null
	hash?: string | null
	salt?: string | null
	sessions?: { id: string }[] | null
	_verified?: boolean | null
	blocked?: boolean | null
	legacyProvider?: string | null
	legacyBcrypt?: string | null
	strapiId?: number | null
}

async function lineOf(compte: FixedAccount): Promise<Line> {
	const payload = await testPayload()
	const line = await payload.db.findOne<Line>({ collection: compte.collection, where: { id: { equals: compte.id } } })
	if (!line) throw new Error(`le compte ${compte.type} n’est pas en base`)
	return line
}

/** What a makeup artist holds, read in the database, in the shape of `Attendu['pro']`. */
async function artistState(compte: FixedAccount) {
	const payload = await testPayload()
	const line = await lineOf(compte)
	const { totalDocs } = await payload.count({ collection: 'profiles', where: { pro: { equals: compte.id } } })
	return {
		verifie: line._verified === true,
		blocked: line.blocked === true,
		fournisseur: (line.legacyProvider ?? null) as LegacyProvider | null,
		hashHerite: typeof line.legacyBcrypt === 'string',
		profils: totalDocs,
	}
}

/** The error Payload's own login throws for this address and password, or `null` when it lets the account in. */
async function signInRefusal(compte: FixedAccount, motDePasse: string): Promise<unknown> {
	const payload = await testPayload()
	try {
		await payload.login({ collection: compte.collection, data: { email: compte.email, password: motDePasse } })
		return null
	} catch (error) {
		return error
	}
}

beforeAll(async () => {
	// Payload starts before the clock of the first test does.
	await testPayload()
})

afterEach(emptyBase)

describe('La fabrique crée chaque type de compte du site', () => {
	test('toutes les variantes créées puis vidées en moins de 5 secondes', async () => {
		const start = performance.now()

		const accounts = await Promise.all(TYPES.map(type => createAccount(type)))
		await emptyBase()

		expect(performance.now() - start).toBeLessThan(5_000)
		expect(accounts.map(({ type }) => type)).toEqual(TYPES)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(0)
	})

	test.each(
		TYPES
	)('« %s » : sa session ouvre son compte, ou il n’en a pas et aucun mot de passe connu ne l’ouvre', async type => {
		const expected = EXPECTED[type]
		// The password this test knows: the factory gives it to every account that logs in by password.
		const known = `connu-${crypto.randomUUID()}`

		const account = await createAccount(type, { motDePasse: () => known })
		const line = await lineOf(account)

		expect(account.collection).toBe(expected.collection)
		expect(account.email).toMatch(new RegExp(`^${type}-[0-9a-f-]{36}@example\\.test$`))
		if (expected.acces === 'aucun') {
			expect(account.session).toBeNull()
			expect(line.sessions ?? []).toEqual([])
		} else {
			// A real session: the route « mon compte » of the application answers with this account.
			const { statut: status, corps } = await callRest('GET', `/api/${expected.collection}/me`, {
				enTetes: account.session?.enTetes ?? {},
			})
			expect({ statut: status, user: MyAccount.parse(corps).user }).toEqual({
				statut: 200,
				user: { id: Number(account.id), email: account.email },
			})
			expect(line.sessions?.length).toBe(1)
		}
		// Every account has a password in Payload: the import gives one too, drawn at random.
		expect(typeof line.hash === 'string' && typeof line.salt === 'string').toBe(true)

		if (expected.pro) expect(await artistState(account)).toEqual(expected.pro)
		if (expected.pro?.fournisseur) {
			// No password anybody knows opens it through Payload: neither the one this test chose,
			// nor the one of the old site, which only the site's legacy path reads (ticket 087).
			expect(await signInRefusal(account, known)).toBeInstanceOf(AuthenticationError)
			expect(await signInRefusal(account, FIXTURE_LEGACY_PASSWORD)).toBeInstanceOf(AuthenticationError)
			expect(line.strapiId).toBeGreaterThanOrEqual(1_000_000)
		} else expect(line.strapiId ?? null).toBeNull()
		if (type === 'maquilleuse-non-verifiee')
			// The right password, an address not confirmed: Payload says so, and opens nothing.
			expect(await signInRefusal(account, known)).toBeInstanceOf(UnverifiedEmail)
	})

	test('le hash hérité vient du mot de passe fictif de fixture ; pgcrypto ne reste pas dans la base', async () => {
		const [locale, google, withoutHash] = await Promise.all([
			createAccount('reprise-avec-hash'),
			createAccount('reprise-google-avec-hash'),
			createAccount('reprise-google'),
		])
		const [hashLocal, hashGoogle] = [(await lineOf(locale)).legacyBcrypt, (await lineOf(google)).legacyBcrypt]

		for (const hash of [hashLocal, hashGoogle]) {
			expect(HASH_BCRYPT_FULL.test(hash ?? '')).toBe(true)
			// The format of every hash of the old site.
			expect(hash?.startsWith('$2a$10$')).toBe(true)
			expect(await Bun.password.verify(FIXTURE_LEGACY_PASSWORD, hash ?? '')).toBe(true)
			expect(await Bun.password.verify(`${FIXTURE_LEGACY_PASSWORD}-faux`, hash ?? '')).toBe(false)
		}
		// The same fixture hash, every time: a fixed salt and a fixed password.
		expect(hashGoogle).toBe(hashLocal)
		expect((await lineOf(withoutHash)).legacyBcrypt ?? null).toBeNull()
		// The hash was worked out in a transaction that was rolled back: nothing of pgcrypto is left.
		const payload = await testPayload()
		const { rows } = await payload.db.pool.query<{ extensions: number; schemas: number }>(
			`SELECT (SELECT count(*)::int FROM pg_extension WHERE extname = 'pgcrypto') AS extensions,
			        (SELECT count(*)::int FROM pg_namespace WHERE nspname = 'fabrique_bcrypt') AS schemas`
		)
		expect(rows[0]).toEqual({ extensions: 0, schemas: 0 })
	})
})

describe('Le jeu du banc : un compte fixe de chaque type', () => {
	test('un exemplaire de chaque type, en @example.test, à l’état de son type', async () => {
		const summary = await setDatasetAccounts()

		expect(summary.crees).toEqual(TYPES)
		expect(summary.presents).toEqual([])
		expect(DATASET_TYPES).toEqual(TYPES)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(2)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(TYPES.length - 2)
		for (const account of summary.comptes) {
			const expected = EXPECTED[account.type]
			expect({ type: account.type, collection: account.collection, email: account.email }).toEqual({
				type: account.type,
				collection: expected.collection,
				email: datasetUrl(account.type),
			})
			expect(account.email).toEndWith('@example.test')
			const line = await lineOf(account)
			// No session: the set only places the accounts.
			expect(line.sessions ?? []).toEqual([])
			if (!expected.pro) continue
			expect({ type: account.type, etat: await artistState(account) }).toEqual({
				type: account.type,
				etat: expected.pro,
			})
			const { nom: name, strapiId } = DATASET_ACCOUNTS[account.type]
			expect({ nom: line.name, strapiId: line.strapiId ?? undefined }).toEqual({ nom: name, strapiId })
		}
	})

	test('rejouer le jeu ne crée aucun doublon et ne touche à rien ; sur une base vide, il redonne les mêmes comptes', async () => {
		const first = await setDatasetAccounts()
		const lines = await countLines()
		const hashes = await Promise.all(first.comptes.map(async compte => (await lineOf(compte)).legacyBcrypt ?? null))

		const second = await setDatasetAccounts()

		expect(second.crees).toEqual([])
		expect(second.presents).toEqual(TYPES)
		expect(second.comptes).toEqual(first.comptes)
		expect(await countLines()).toEqual(lines)

		await emptyBase()
		const afterReset = await setDatasetAccounts()

		expect(afterReset.crees).toEqual(TYPES)
		expect(afterReset.comptes).toEqual(first.comptes)
		expect(
			await Promise.all(afterReset.comptes.map(async compte => (await lineOf(compte)).legacyBcrypt ?? null))
		).toEqual(hashes)
	})
})
