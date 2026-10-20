import { describe, expect, test } from 'bun:test'
import { ACCOUNTS_ADAPTER, ACCOUNTS_IN_SERVICE_ADAPTER } from '../../scripts/migration/import/accounts'
import { readArguments } from '../../scripts/migration/import/arguments'
import { cutoverMessage, withoutDeletedAccounts } from '../../scripts/migration/import/cutover-guard'
import {
	differentFields,
	documentsFingerprint,
	type Expected,
	planActions,
} from '../../scripts/migration/import/engine'
import { keptConsents, PROFILES_ADAPTER, PROFILES_IN_SERVICE_ADAPTER } from '../../scripts/migration/import/profiles'

/**
 * Ticket 227: a run of the import does not undo what the v3 wrote. The guard of a target in service,
 * the accounts left as they are with `--cible-en-service`, and the date of consent kept. No database:
 * the runs are in tests/integration/import-rejeux.test.ts. Every value here is fictional.
 */

describe('la garde d’une cible déjà utilisée par la v3 (ticket 227)', () => {
	test('aucune trace : aucun refus', () => {
		expect(cutoverMessage({ connexions: 0, comptesConnectes: 0, hashEfface: [], supprimes: [] })).toBeNull()
	})

	test('une connexion réussie ou un hash effacé : refus en français, avec le nom de l’option, sans valeur', () => {
		const connexions = cutoverMessage({ connexions: 3, comptesConnectes: 0, hashEfface: [], supprimes: [] })
		const hash = cutoverMessage({ connexions: 0, comptesConnectes: 0, hashEfface: [1, 4], supprimes: [] })

		expect(connexions).toContain('3 connexions')
		expect(connexions).toContain('Rien n’est écrit')
		expect(connexions).toContain('--cible-en-service')
		expect(hash).toContain('2 comptes dont le hash hérité a déjà été effacé')
		expect(hash).toContain('1, 4')
		expect(cutoverMessage({ connexions: 1, comptesConnectes: 0, hashEfface: [7], supprimes: [] })).toMatch(
			/1 connexion .*1 compte /
		)
		// The journal is purged after 90 days: the date of last sign-in of the accounts is a trace of its own.
		const date = cutoverMessage({ connexions: 0, comptesConnectes: 2, hashEfface: [], supprimes: [] })
		expect(date).toContain('2 comptes avec une date de dernière connexion')
		expect(`${connexions}${hash}${date}`).not.toMatch(/\$2[aby]\$|@/)
	})

	test('l’option se lit sur la ligne de commande, une seule fois', () => {
		expect(readArguments(['--reel', '--cible-en-service'])).toMatchObject({ mode: 'reel', cibleEnService: true })
		expect(readArguments(['--reel'])?.cibleEnService).toBeUndefined()
		expect(readArguments(['--cible-en-service', '--cible-en-service'])).toBeNull()
	})

	test('--controle avec --cible-en-service est refusé : les comptes ne sont pas comparés, le contrôle serait un faux vert', () => {
		expect(readArguments(['--controle', '--cible-en-service'])).toBeNull()
		expect(readArguments(['--controle'])).toMatchObject({ controle: true })
	})
})

describe('sur une cible en service, un compte déjà repris reste tel quel (ticket 227)', () => {
	const compte = (valeurs: Record<string, unknown>, strapiId = 1): Expected => ({
		strapiId,
		valeurs: {
			strapiId,
			email: 'ancien@example.test',
			name: 'Ancien nom',
			legacyProvider: 'local',
			legacyBcrypt: 'hash-herite-fictif',
			blocked: false,
			_verified: true,
			createdAt: '2024-01-01T10:00:00.000Z',
			updatedAt: '2024-02-01T10:00:00.000Z',
			...valeurs,
		},
		ecarts: [],
	})
	const devenu = compte({
		email: 'nouveau@example.test',
		legacyBcrypt: null,
		blocked: true,
		updatedAt: '2026-11-03T10:00:00.000Z',
	})

	test('par défaut, la source fait loi : l’email et le hash reviennent', () => {
		const attendu = compte({})

		expect(differentFields(ACCOUNTS_ADAPTER, attendu, { id: 5, valeurs: devenu.valeurs })).toEqual([
			'email',
			'legacyBcrypt',
			'blocked',
			'updatedAt',
		])
	})

	test('en service, aucun champ du compte n’est comparé ni réécrit', () => {
		const attendu = compte({})

		expect(differentFields(ACCOUNTS_IN_SERVICE_ADAPTER, attendu, { id: 5, valeurs: devenu.valeurs })).toEqual([])
		const plan = planActions(
			ACCOUNTS_IN_SERVICE_ADAPTER,
			[attendu, compte({}, 2)],
			[{ id: 5, valeurs: devenu.valeurs }]
		)
		// The account the target holds is untouched; the one it misses is still created.
		expect(plan.actions.map(({ genre }) => genre)).toEqual(['inchange', 'creation'])
	})

	test('l’empreinte ne compte pas les champs laissés tels quels : le contrôle ne voit pas la v3 comme un écart', () => {
		const source = [{ strapiId: 1, valeurs: compte({}).valeurs }]
		const cible = [{ strapiId: 1, valeurs: devenu.valeurs }]

		expect(documentsFingerprint(ACCOUNTS_IN_SERVICE_ADAPTER, cible)).toBe(
			documentsFingerprint(ACCOUNTS_IN_SERVICE_ADAPTER, source)
		)
		expect(documentsFingerprint(ACCOUNTS_ADAPTER, cible)).not.toBe(documentsFingerprint(ACCOUNTS_ADAPTER, source))
	})
})

describe('la date de consentement déjà posée est gardée (ticket 227)', () => {
	const PREMIERE = '2026-11-02T08:00:00.000Z'
	const AUTRE = '2026-11-09T08:00:00.000Z'
	const profil = (strapiId: number, consentiLe: string | null): Expected => ({
		strapiId,
		valeurs: { strapiId, publicContact: consentiLe !== null, consentedAt: consentiLe },
		ecarts: [],
	})

	test('la date est une amorce : écrite sur un profil qui n’en a pas, jamais par-dessus une date posée', () => {
		expect(PROFILES_ADAPTER.amorces).toContain('consentedAt')
		const existants = [
			{ id: 1, valeurs: { strapiId: 1, publicContact: true, consentedAt: PREMIERE } },
			{ id: 2, valeurs: { strapiId: 2, publicContact: false, consentedAt: null } },
		]

		const plan = planActions(
			{ ...PROFILES_ADAPTER, champs: { publicContact: 'booleen', consentedAt: 'date' } },
			[profil(1, AUTRE), profil(2, AUTRE)],
			existants
		)

		expect(plan.actions.map(action => [action.genre, 'champs' in action ? action.champs : []])).toEqual([
			['inchange', []],
			['modification', ['publicContact', 'consentedAt']],
		])
	})

	test('le rapport compte les profils dont la date demandée diffère de la date gardée, par identifiant', () => {
		const existants = [
			{ valeurs: { strapiId: 1, consentedAt: PREMIERE } },
			{ valeurs: { strapiId: 2, consentedAt: new Date(PREMIERE) } },
			{ valeurs: { strapiId: 3, consentedAt: null } },
			{ valeurs: { strapiId: 4, consentedAt: PREMIERE } },
		]
		const attendus = [profil(4, AUTRE), profil(1, AUTRE), profil(2, PREMIERE), profil(3, AUTRE), profil(5, AUTRE)]

		// 2 asks the date it holds; 3 holds none (the run fills it in); 5 is new; 4 and 1 differ.
		expect(keptConsents(attendus, existants)).toEqual([1, 4])
		expect(keptConsents([profil(1, null)], existants)).toEqual([])
	})
})

describe('un compte supprimé dans la v3 ne revient pas (ticket 227)', () => {
	test('un compte de la source supprimé suffit à refuser, avec son ancien identifiant et sans autre valeur', () => {
		const message = cutoverMessage({ connexions: 0, comptesConnectes: 0, hashEfface: [], supprimes: [5, 9] })

		expect(message).toContain('2 comptes de l’ancien site supprimés dans la v3')
		expect(message).toContain('5, 9')
		expect(message).toContain('Rien n’est écrit')
		expect(message).toContain('--cible-en-service')
		expect(message).not.toMatch(/\$2[aby]\$|@/)
	})

	test('avec l’option, le compte supprimé et son profil sortent de ce que la source donne ; les autres restent', () => {
		const lu = {
			comptes: [{ id: 1 }, { id: 2 }, { id: 3 }],
			profils: [
				{ id: 11, compte: 1 },
				{ id: 12, compte: 2 },
				{ id: 13, compte: null },
			],
			ailleurs: 'inchangé',
		}

		const reste = withoutDeletedAccounts(lu, new Set([2, 99]))

		expect(reste.comptes.map(({ id }) => id)).toEqual([1, 3])
		expect(reste.profils.map(({ id }) => id)).toEqual([11, 13])
		expect(reste.ailleurs).toBe('inchangé')
		expect(withoutDeletedAccounts(lu, new Set())).toBe(lu)
	})
})

describe('sur une cible en service, un profil déjà repris reste tel quel (ticket 227)', () => {
	const profil = (valeurs: Record<string, unknown>): Expected => ({
		strapiId: 1,
		valeurs: { strapiId: 1, ...valeurs },
		ecarts: [],
	})
	const existant = { id: 7, valeurs: { strapiId: 1, publicContact: false, contactDetails: { phone: null } } }

	test('ce que la maquilleuse a fermé dans la v3 n’est pas rouvert : aucun champ n’est comparé', () => {
		const attendu = profil({
			publicContact: true,
			contactDetails: { phone: '0100000000' },
			consentSource: 'import',
		})

		expect(differentFields(PROFILES_ADAPTER, attendu, existant)).toContain('publicContact')
		expect(differentFields(PROFILES_IN_SERVICE_ADAPTER, attendu, existant)).toEqual([])
		const plan = planActions(PROFILES_IN_SERVICE_ADAPTER, [attendu], [existant])
		expect(plan.actions.map(({ genre }) => genre)).toEqual(['inchange'])
	})

	test('un profil qui manque est créé, avec tous ses champs', () => {
		const plan = planActions(PROFILES_IN_SERVICE_ADAPTER, [profil({ publicContact: false })], [])

		expect(plan.actions.map(({ genre }) => genre)).toEqual(['creation'])
	})
})
