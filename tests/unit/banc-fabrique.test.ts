import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { BancRefuse, environnementDuBanc, type Variables } from '../outils/banc'
import { adresseDeTest, creerCompte, motDePasseAleatoire, TYPES_DE_COMPTE } from '../outils/fabrique-comptes'
import { origineDuSite } from '../outils/session'

const BANC = environnementDuBanc({ nom: 'my-makeup-test', decalage: 0 })
const BASE_DU_BANC = BANC.DATABASE_URI ?? ''
const BASE_DE_DEVELOPPEMENT = 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev'

/**
 * A Payload that only remembers what was asked of it, connected to the given database: no
 * connection is opened, and every call that would write is recorded.
 */
function fauxPayload(connexion: string) {
	const ecritures: string[] = []
	const noter = (operation: string) => () => {
		ecritures.push(operation)
		return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
	}
	const payload = {
		config: { csrf: ['http://localhost:3100'], cookiePrefix: 'payload' },
		create: noter('create'),
		db: { poolOptions: { connectionString: connexion } },
		login: noter('login'),
	} as unknown as Payload
	return { ecritures, payload }
}

const refus = async (essai: () => Promise<unknown>): Promise<string> => {
	try {
		await essai()
	} catch (erreur) {
		if (erreur instanceof BancRefuse) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

describe('Hors du banc, la fabrique s’arrête avant toute écriture', () => {
	test('sans base réglée, elle s’arrête avant même de charger Payload, et dit quoi lancer', async () => {
		let charge = false
		const charger = () => {
			charge = true
			return Promise.resolve(fauxPayload(BASE_DU_BANC).payload)
		}

		const message = await refus(() => creerCompte('admin', { payload: charger, variables: {} }))

		expect(message).toContain('Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.')
		expect(message).toContain('« bun run test:integration »')
		expect(charge).toBe(false)
	})

	test.each([
		['la base de développement du poste', BASE_DE_DEVELOPPEMENT],
		[
			'une base distante, même nommée en _test',
			'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test',
		],
		['le banc d’une autre instance', BASE_DU_BANC.replace(':5443/', ':5463/')],
	])('quand l’environnement désigne %s, rien n’est écrit', async (_cas, base) => {
		const { ecritures, payload } = fauxPayload(base)
		const variables: Variables = { ...BANC, DATABASE_URI: base }

		const message = await refus(() => creerCompte('admin', { payload: () => Promise.resolve(payload), variables }))

		expect(message).toStartWith('DATABASE_URI ne désigne pas la base du banc de test : rien n’est écrit.')
		expect(message).not.toContain('postgres://')
		expect(ecritures).toEqual([])
	})

	test('quand Payload est branché ailleurs que l’environnement ne le dit, rien n’est écrit non plus', async () => {
		const { ecritures, payload } = fauxPayload(BASE_DE_DEVELOPPEMENT)

		const message = await refus(() =>
			creerCompte('admin', { payload: () => Promise.resolve(payload), variables: BANC })
		)

		expect(message).toBe('Payload n’est pas branché sur la base du banc de test : rien n’est écrit.')
		expect(ecritures).toEqual([])
	})

	test('sur le banc, la fabrique passe ces contrôles et commence par créer le compte', async () => {
		// The witness of the tests above: with the same fake Payload connected to the bench, the
		// factory goes on to its first write, which this fake one refuses.
		const { ecritures, payload } = fauxPayload(BASE_DU_BANC)

		await expect(creerCompte('admin', { payload: () => Promise.resolve(payload), variables: BANC })).rejects.toThrow(
			'create ne devait pas être appelé'
		)
		expect(ecritures).toEqual(['create'])
	})
})

describe('Ce que la fabrique tire au sort', () => {
	test('chaque type de compte vit dans une collection de comptes', () => {
		expect(Object.keys(TYPES_DE_COMPTE)).toEqual(['admin', 'redaction', 'maquilleuse', 'maquilleuse-non-verifiee'])
		expect(TYPES_DE_COMPTE.admin.collection).toBe('admins')
		expect(TYPES_DE_COMPTE.redaction.collection).toBe('admins')
		expect(TYPES_DE_COMPTE.maquilleuse.collection).toBe('pros')
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].collection).toBe('pros')
	})

	test('une maquilleuse confirmée, et une autre qui ne l’est pas et n’a donc pas de session', () => {
		expect(TYPES_DE_COMPTE.maquilleuse.donnees()).toMatchObject({ _verified: true })
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].donnees()).toMatchObject({ _verified: false })
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].connexion).toBe(false)
		expect('connexion' in TYPES_DE_COMPTE.maquilleuse).toBe(false)
		// Two accounts made side by side never share a display name.
		expect(TYPES_DE_COMPTE.maquilleuse.donnees().nom).not.toBe(TYPES_DE_COMPTE.maquilleuse.donnees().nom)
	})

	test('les deux rôles de l’administration : admin et redaction', () => {
		expect(TYPES_DE_COMPTE.admin.donnees()).toEqual({ role: 'admin' })
		expect(TYPES_DE_COMPTE.redaction.donnees()).toEqual({ role: 'redaction' })
	})

	test('une adresse en @example.test, jamais deux fois la même', () => {
		const adresses = Array.from({ length: 50 }, () => adresseDeTest('admin'))

		for (const adresse of adresses) expect(adresse).toMatch(/^admin-[0-9a-f-]{36}@example\.test$/)
		expect(new Set(adresses).size).toBe(50)
	})

	test('un mot de passe de 32 caractères, jamais deux fois le même', () => {
		const tirages = Array.from({ length: 50 }, motDePasseAleatoire)

		for (const tirage of tirages) expect(tirage).toMatch(/^[\w-]{32}$/)
		expect(new Set(tirages).size).toBe(50)
	})
})

describe('L’origine d’une session', () => {
	const { payload } = fauxPayload(BASE_DU_BANC)

	test('c’est l’adresse du site sur le banc, quand la configuration lui fait confiance', () => {
		expect(origineDuSite(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('http://localhost:3100')
	})

	test('une origine que la configuration ignorerait est refusée, plutôt que de rendre une session sans effet', () => {
		expect(() => origineDuSite(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3999' })).toThrow(BancRefuse)
		expect(() => origineDuSite(payload, {})).toThrow(BancRefuse)
	})
})
