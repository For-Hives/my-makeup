import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { DATASET_ACCOUNTS, DATASET_TYPES, datasetUrl, setDatasetAccounts } from '../fixtures/accounts'
import {
	ACCOUNT_TYPES,
	type AccountDeclaration,
	createAccount,
	createFixedAccount,
	FIXTURE_LEGACY_PASSWORD,
	FIXTURE_SALT_BCRYPT,
	randomPassword,
	testStrapiId,
	testUrl,
} from '../support/account-factory'
import { benchEnvironment, RefusedBench, ROOT, type Variables } from '../support/bench'
import { siteOrigin } from '../support/session'
import { HASH_BCRYPT_FULL } from '../support/source-strapi/inventory'

/** The types of account the old site brings. */
const TYPE_RESUMED = ['reprise-avec-hash', 'reprise-google', 'reprise-google-avec-hash', 'reprise-facebook'] as const

const BENCH = benchEnvironment({ nom: 'my-makeup-test', decalage: 0 })
const BENCH_BASE = BENCH.DATABASE_URI ?? ''
const DEVELOPMENT_BASE = 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev'

/**
 * A Payload that only remembers what was asked of it, connected to the given database: no
 * connection is opened, and every call that would write is recorded.
 */
function fakePayload(connexion: string) {
	const writes: string[] = []
	const note = (operation: string) => () => {
		writes.push(operation)
		return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
	}
	const payload = {
		config: { csrf: ['http://localhost:3100'], cookiePrefix: 'payload' },
		create: note('create'),
		db: { poolOptions: { connectionString: connexion } },
		login: note('login'),
	} as unknown as Payload
	return { ecritures: writes, payload }
}

const refusal = async (essai: () => Promise<unknown>): Promise<string> => {
	try {
		await essai()
	} catch (error) {
		if (error instanceof RefusedBench) return error.message
		throw error
	}
	throw new Error('rien n’a été refusé')
}

describe('Hors du banc, la fabrique s’arrête avant toute écriture', () => {
	test('sans base réglée, elle s’arrête avant même de charger Payload, et dit quoi lancer', async () => {
		let charge = false
		const load = () => {
			charge = true
			return Promise.resolve(fakePayload(BENCH_BASE).payload)
		}

		const message = await refusal(() => createAccount('admin', { payload: load, variables: {} }))

		expect(message).toContain('Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.')
		expect(message).toContain('« bun run test:integration »')
		expect(charge).toBe(false)
	})

	test.each([
		['la base de développement du poste', DEVELOPMENT_BASE],
		[
			'une base distante, même nommée en _test',
			'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test',
		],
		['le banc d’une autre instance', BENCH_BASE.replace(':5443/', ':5463/')],
	])('quand l’environnement désigne %s, rien n’est écrit', async (_cas, base) => {
		const { ecritures: writes, payload } = fakePayload(base)
		const variables: Variables = { ...BENCH, DATABASE_URI: base }

		const message = await refusal(() => createAccount('admin', { payload: () => Promise.resolve(payload), variables }))

		expect(message).toStartWith('DATABASE_URI ne désigne pas la base du banc de test : rien n’est écrit.')
		expect(message).not.toContain('postgres://')
		expect(writes).toEqual([])
	})

	test('quand Payload est branché ailleurs que l’environnement ne le dit, rien n’est écrit non plus', async () => {
		const { ecritures: writes, payload } = fakePayload(DEVELOPMENT_BASE)

		const message = await refusal(() =>
			createAccount('admin', { payload: () => Promise.resolve(payload), variables: BENCH })
		)

		expect(message).toBe('Payload n’est pas branché sur la base du banc de test : rien n’est écrit.')
		expect(writes).toEqual([])
	})

	test('sur le banc, la fabrique passe ces contrôles et commence par créer le compte', async () => {
		// The witness of the tests above: with the same fake Payload connected to the bench, the
		// factory goes on to its first write, which this fake one refuses.
		const { ecritures: writes, payload } = fakePayload(BENCH_BASE)

		await expect(createAccount('admin', { payload: () => Promise.resolve(payload), variables: BENCH })).rejects.toThrow(
			'create ne devait pas être appelé'
		)
		expect(writes).toEqual(['create'])
	})

	test('le jeu du banc et ses comptes fixes s’arrêtent de même hors du banc, avant de charger Payload', async () => {
		let charge = false
		const load = () => {
			charge = true
			return Promise.resolve(fakePayload(BENCH_BASE).payload)
		}

		const forDataset = await refusal(() => setDatasetAccounts({ payload: load, variables: {} }))
		const forAccount = await refusal(() =>
			createFixedAccount('admin', { email: datasetUrl('admin') }, { payload: load, variables: {} })
		)

		for (const message of [forDataset, forAccount])
			expect(message).toContain('Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.')
		expect(charge).toBe(false)
	})

	test('sur le banc, une adresse qui n’est pas en @example.test est refusée avant toute écriture', async () => {
		const { ecritures: writes, payload } = fakePayload(BENCH_BASE)

		await expect(
			createFixedAccount(
				'admin',
				{ email: 'admin@exemple.fr' },
				{ payload: () => Promise.resolve(payload), variables: BENCH }
			)
		).rejects.toThrow('Un compte de test a une adresse en @example.test, et nulle part ailleurs.')
		expect(writes).toEqual([])
	})
})

describe('Le jeu du banc : un compte fixe de chaque type', () => {
	test('chaque type de la fabrique y a son compte, dans le même ordre', () => {
		expect(DATASET_TYPES).toEqual(Object.keys(ACCOUNT_TYPES) as typeof DATASET_TYPES)
	})

	test('des adresses fixes en @example.test, une par type', () => {
		const urls = DATASET_TYPES.map(datasetUrl)

		for (const url of urls) expect(url).toMatch(/^jeu-[a-z-]+@example\.test$/)
		expect(new Set(urls).size).toBe(DATASET_TYPES.length)
		expect(datasetUrl('reprise-google')).toBe('jeu-reprise-google@example.test')
	})

	test('les comptes repris, et eux seuls, ont un identifiant fixe de l’ancien site, sous ceux de la fabrique', () => {
		const resumed = DATASET_TYPES.filter(
			type => ACCOUNT_TYPES[type].collection === 'pros' && 'reprise' in ACCOUNT_TYPES[type]
		)
		const identifiers = DATASET_TYPES.flatMap(type => {
			const { strapiId } = DATASET_ACCOUNTS[type]
			return strapiId === undefined ? [] : [{ type, strapiId }]
		})

		expect(identifiers.map(({ type }) => type)).toEqual(resumed)
		expect(resumed).toEqual([...TYPE_RESUMED])
		for (const { strapiId } of identifiers) {
			expect(strapiId).toBeGreaterThanOrEqual(900_000)
			expect(strapiId).toBeLessThan(1_000_000)
		}
		expect(new Set(identifiers.map(({ strapiId }) => strapiId)).size).toBe(identifiers.length)
	})

	test('chaque maquilleuse du jeu a un nom fixe, différent des autres ; les comptes admin n’en ont pas', () => {
		const names = DATASET_TYPES.map(type => ({ type, nom: DATASET_ACCOUNTS[type].nom }))
		const artists = names.filter(({ type }) => ACCOUNT_TYPES[type].collection === 'pros')

		for (const { nom: name } of artists) expect(name).toEndWith(' du jeu')
		expect(new Set(artists.map(({ nom: name }) => name)).size).toBe(artists.length)
		expect(names.filter(({ type }) => ACCOUNT_TYPES[type].collection === 'admins')).toEqual([
			{ type: 'admin', nom: undefined },
			{ type: 'redaction', nom: undefined },
		])
	})
})

describe('Aucun hash réel dans le dépôt', () => {
	test('aucun fichier versionné ne contient un hash bcrypt complet : le hash de fixture se calcule sur le banc', async () => {
		const listing = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: ROOT })
		expect(listing.exitCode).toBe(0)
		const files = listing.stdout.toString().split('\0').filter(Boolean)
		// Anywhere in a line, not only a whole value: the pattern of the inventory, without its anchors.
		const pattern = new RegExp(HASH_BCRYPT_FULL.source.replace(/^\^/, '').replace(/\$$/, ''))
		const carriers: string[] = []

		for (const file of files) {
			const content = Bun.file(`${ROOT}/${file}`)
			// A file removed from the working tree but not from the index yet holds nothing.
			if (!(await content.exists())) continue
			const bytes = new Uint8Array(await content.arrayBuffer())
			// A picture or a font is not text: it cannot hold a hash written by hand.
			if (bytes.includes(0)) continue
			if (pattern.test(new TextDecoder().decode(bytes))) carriers.push(file)
		}

		expect(files.length).toBeGreaterThan(100)
		expect(carriers).toEqual([])
	})
})

describe('Ce que la fabrique tire au sort', () => {
	test('chaque type de compte vit dans une collection de comptes', () => {
		expect(Object.keys(ACCOUNT_TYPES)).toEqual([
			'admin',
			'redaction',
			'maquilleuse',
			'maquilleuse-non-verifiee',
			'maquilleuse-sans-profil',
			'maquilleuse-bloquee',
			'reprise-avec-hash',
			'reprise-google',
			'reprise-google-avec-hash',
			'reprise-facebook',
		])
		expect(ACCOUNT_TYPES.admin.collection).toBe('admins')
		expect(ACCOUNT_TYPES.redaction.collection).toBe('admins')
		expect(ACCOUNT_TYPES.maquilleuse.collection).toBe('pros')
		expect(ACCOUNT_TYPES['maquilleuse-non-verifiee'].collection).toBe('pros')
		expect(ACCOUNT_TYPES['maquilleuse-sans-profil'].collection).toBe('pros')
		for (const type of TYPE_RESUMED) expect(ACCOUNT_TYPES[type].collection).toBe('pros')
		expect(ACCOUNT_TYPES['maquilleuse-bloquee'].collection).toBe('pros')
	})

	test('une maquilleuse bloquée : confirmée, bloquée, sans session, avec le mot de passe tiré', () => {
		const blocked: AccountDeclaration<'pros'> = ACCOUNT_TYPES['maquilleuse-bloquee']
		expect(blocked.donnees()).toMatchObject({ _verified: true, blocked: true })
		expect(blocked.connexion).toBe(false)
		expect(blocked.reprise).toBeUndefined()
	})

	test('les comptes de l’ancien site : leur fournisseur, leur hash, et comment chacun se connecte', () => {
		const portraits = TYPE_RESUMED.map(type => {
			const declaration: AccountDeclaration<'pros'> = ACCOUNT_TYPES[type]
			return {
				type,
				...declaration.reprise,
				connexion: declaration.connexion,
				verifie: declaration.donnees()._verified,
			}
		})

		expect(portraits).toEqual([
			{ type: 'reprise-avec-hash', fournisseur: 'local', hashHerite: true, connexion: false, verifie: true },
			{
				type: 'reprise-google',
				fournisseur: 'google',
				hashHerite: false,
				connexion: 'sans-mot-de-passe',
				verifie: true,
			},
			{
				type: 'reprise-google-avec-hash',
				fournisseur: 'google',
				hashHerite: true,
				connexion: 'sans-mot-de-passe',
				verifie: true,
			},
			{ type: 'reprise-facebook', fournisseur: 'facebook', hashHerite: false, connexion: false, verifie: true },
		])
	})

	test('le hash de fixture : un sel fixe au format de l’ancien site, et un mot de passe fictif', () => {
		// Version 2a, cost 10, then 22 characters of the alphabet of bcrypt: a salt, never a hash.
		expect(FIXTURE_SALT_BCRYPT).toMatch(/^\$2a\$10\$[./A-Za-z0-9]{22}$/)
		expect(FIXTURE_LEGACY_PASSWORD).toStartWith('fixture-')
	})

	test('un identifiant de l’ancien site pour un compte de test, loin de ceux de la fausse source et du jeu', () => {
		const draws = Array.from({ length: 50 }, testStrapiId)

		for (const draw of draws) {
			expect(Number.isInteger(draw)).toBe(true)
			expect(draw).toBeGreaterThanOrEqual(1_000_000)
		}
		expect(new Set(draws).size).toBe(50)
	})

	test('une maquilleuse sans profil : sa création le dit à Payload, et elle se connecte', () => {
		expect(ACCOUNT_TYPES['maquilleuse-sans-profil'].contexte).toEqual({ profilAutomatique: false })
		expect(ACCOUNT_TYPES['maquilleuse-sans-profil'].donnees()).toMatchObject({ _verified: true })
		expect('connexion' in ACCOUNT_TYPES['maquilleuse-sans-profil']).toBe(false)
	})

	test('une maquilleuse confirmée, et une autre qui ne l’est pas et n’a donc pas de session', () => {
		expect(ACCOUNT_TYPES.maquilleuse.donnees()).toMatchObject({ _verified: true })
		expect(ACCOUNT_TYPES['maquilleuse-non-verifiee'].donnees()).toMatchObject({ _verified: false })
		expect(ACCOUNT_TYPES['maquilleuse-non-verifiee'].connexion).toBe(false)
		expect('connexion' in ACCOUNT_TYPES.maquilleuse).toBe(false)
		// Two accounts made side by side never share a display name.
		expect(ACCOUNT_TYPES.maquilleuse.donnees().name).not.toBe(ACCOUNT_TYPES.maquilleuse.donnees().name)
	})

	test('les deux rôles de l’administration : admin et redaction', () => {
		expect(ACCOUNT_TYPES.admin.donnees()).toEqual({ role: 'admin' })
		expect(ACCOUNT_TYPES.redaction.donnees()).toEqual({ role: 'editor' })
	})

	test('une adresse en @example.test, jamais deux fois la même', () => {
		const urls = Array.from({ length: 50 }, () => testUrl('admin'))

		for (const url of urls) expect(url).toMatch(/^admin-[0-9a-f-]{36}@example\.test$/)
		expect(new Set(urls).size).toBe(50)
	})

	test('un mot de passe de 32 caractères, jamais deux fois le même', () => {
		const draws = Array.from({ length: 50 }, randomPassword)

		for (const draw of draws) expect(draw).toMatch(/^[\w-]{32}$/)
		expect(new Set(draws).size).toBe(50)
	})
})

describe('L’origine d’une session', () => {
	const { payload } = fakePayload(BENCH_BASE)

	test('c’est l’adresse du site sur le banc, quand la configuration lui fait confiance', () => {
		expect(siteOrigin(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('http://localhost:3100')
	})

	test('une origine que la configuration ignorerait est refusée, plutôt que de rendre une session sans effet', () => {
		expect(() => siteOrigin(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3999' })).toThrow(RefusedBench)
		expect(() => siteOrigin(payload, {})).toThrow(RefusedBench)
	})
})
