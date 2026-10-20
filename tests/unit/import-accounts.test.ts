import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	type AccountRow,
	accountDistribution,
	expectedAccount,
	expectedAccounts,
	normalizedEmail,
	sharedEmailGroups,
} from '../../scripts/migration/import/accounts'
import { applyDecisions, NO_DECISION, readDecisions } from '../../scripts/migration/import/decisions'
import { REFERENCES } from '../../scripts/migration/import/gaps'
import { ImportRefuse } from '../../scripts/migration/import/target'

/**
 * Ticket 025: what the import makes of an account of the old site, and the table of decisions of
 * the accounts that share one email. No database: the runs are in
 * tests/integration/import-comptes.test.ts. Every value here is fictional.
 */

const DOCS = path.resolve(import.meta.dir, '../../docs/migration')

/** The shape of a complete bcrypt hash, made of one repeated character: no real hash. */
const HASH_SHAPE = `$2a$10$${'a'.repeat(53)}`

const line = (id: number, modif: Partial<AccountRow> = {}): AccountRow => ({
	id,
	username: `Compte ${id}`,
	email: `compte.${id}@example.test`,
	provider: 'local',
	password: null,
	confirmed: true,
	blocked: false,
	created_at: '2023-05-12T09:14:03.211Z',
	updated_at: '2023-05-12T09:14:03.211Z',
	...modif,
})

describe('un compte de l’ancien site, tel que l’import le reprend', () => {
	test('email en minuscules, nom, fournisseur, blocage, dates ; confirmé ; un mot de passe tiré à la création', () => {
		const expected = expectedAccount(
			line(7, { email: ' Compte.Sept@Example.Test ', provider: 'google', password: HASH_SHAPE }),
			() => 'tire-au-hasard'
		)

		expect(expected).toEqual({
			strapiId: 7,
			values: {
				strapiId: 7,
				email: 'compte.sept@example.test',
				name: 'Compte 7',
				legacyProvider: 'google',
				legacyBcrypt: HASH_SHAPE,
				blocked: false,
				_verified: true,
				createdAt: '2023-05-12T09:14:03.211Z',
				updatedAt: '2023-05-12T09:14:03.211Z',
			},
			onCreation: { password: 'tire-au-hasard' },
			gaps: [{ field: 'email', reference: 'SCHEMA.md §5.1 (email)' }],
		})
	})

	test('seul un hash bcrypt complet est copié : toute autre valeur ne donne rien, et c’est compté', () => {
		for (const password of ['$2a$10$court', 'texte-en-clair', '', `${HASH_SHAPE}a`]) {
			const expected = expectedAccount(line(1, { password }))
			expect(expected.values.legacyBcrypt, password).toBeNull()
			expect(expected.gaps).toContainEqual({ field: 'legacyBcrypt', reference: 'SCHEMA.md §5.1 (password)' })
		}
		expect(expectedAccount(line(1, { password: null })).gaps).toEqual([])
		for (const version of ['2a', '2b', '2y'])
			expect(
				expectedAccount(line(1, { password: `$${version}$10$${'b'.repeat(53)}` })).values.legacyBcrypt
			).not.toBeNull()
	})

	test('un compte non confirmé à la source arrive confirmé ; nul reste nul ailleurs', () => {
		const expected = expectedAccount(line(2, { confirmed: false, blocked: null, username: null }))

		expect(expected.values).toMatchObject({ _verified: true, blocked: null, name: null })
		expect(expected.gaps).toEqual([{ field: '_verified', reference: 'confirmation-email' }])
	})

	test('le mot de passe tiré par défaut fait 32 octets aléatoires, jamais deux fois le même', () => {
		const one = expectedAccount(line(1)).onCreation?.password
		const two = expectedAccount(line(1)).onCreation?.password
		expect(String(one)).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(one).not.toBe(two)
	})

	test('l’email se compare sans espaces de bord ni majuscules', () => {
		expect(normalizedEmail(' Lea.Martin@Example.TEST ')).toBe('lea.martin@example.test')
		expect(normalizedEmail(null)).toBeNull()
	})

	test('la répartition compte les fournisseurs et les seuls hash complets', () => {
		const documents = [
			expectedAccount(line(1, { password: HASH_SHAPE })),
			expectedAccount(line(2, { provider: 'google' })),
			expectedAccount(line(3, { provider: 'google', password: 'pas-un-hash' })),
		]
		expect(accountDistribution(documents)).toEqual({ providers: { local: 1, google: 2 }, legacyHashes: 1 })
	})
})

describe('les comptes au même email', () => {
	const lines = [
		line(9, { email: 'chloe@example.test' }),
		line(10, { email: 'Chloe@Example.test' }),
		line(3),
		line(12, { email: ' chloe@example.test' }),
		line(4, { email: 'autre@example.test' }),
		line(5, { email: 'AUTRE@example.test' }),
	]

	test('ils se groupent sans espaces de bord ni majuscules, chaque groupe trié', () => {
		expect(sharedEmailGroups(lines)).toEqual([
			[4, 5],
			[9, 10, 12],
		])
	})

	test('sans décision, chaque groupe arrête l’import, et aucun de ses comptes n’est attendu', () => {
		const result = expectedAccounts(lines, NO_DECISION)
		expect(result.withoutDecision).toEqual([
			[4, 5],
			[9, 10, 12],
		])
		expect(result.expected.map(({ strapiId }) => strapiId)).toEqual([3])
	})

	test('avec une décision par groupe, seul le compte retenu est attendu ; les autres sont écartés', () => {
		const result = expectedAccounts(lines, {
			sharedEmails: [
				{ accounts: [12, 9, 10], kept: 10 },
				{ accounts: [4, 5], kept: 4 },
			],
		})
		expect(result).toMatchObject({ withoutDecision: [], excluded: [5, 9, 12], pointless: 0 })
		expect(result.expected.map(({ strapiId }) => strapiId)).toEqual([10, 3, 4])
	})

	test('une décision vaut pour le groupe exact qu’elle nomme ; sinon elle est sans objet', () => {
		expect(
			applyDecisions([[9, 10, 12]], {
				sharedEmails: [
					{ accounts: [9, 10], kept: 9 },
					{ accounts: [9, 10, 12, 13], kept: 9 },
				],
			})
		).toEqual({ excluded: [], attached: [], withoutDecision: [[9, 10, 12]], pointless: 2 })
	})

	describe('les moyens de connexion des comptes écartés (défaut du ticket 066)', () => {
		const OTHER_HASH = `$2a$10$${'b'.repeat(53)}`
		const THIRD_HASH = `$2a$10$${'c'.repeat(53)}`
		const hashOf = (resultat: ReturnType<typeof expectedAccounts>, id: number) =>
			resultat.expected.find(({ strapiId }) => strapiId === id)?.values.legacyBcrypt

		test('un compte local écarté ne prête pas son hash au compte Google gardé sans décision explicite', () => {
			const result = expectedAccounts(
				[
					line(1, { email: 'a@example.test', provider: 'google' }),
					line(2, { email: 'A@example.test', provider: 'local', password: HASH_SHAPE }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashOf(result, 1)).toBeNull()
			expect(result).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
		})

		test('un compte local écarté prête son hash au compte Google gardé quand la décision l’accorde (pretDuHash vrai), qui garde son fournisseur', () => {
			const result = expectedAccounts(
				[
					line(1, { email: 'a@example.test', provider: 'google' }),
					line(2, { email: 'A@example.test', provider: 'local', password: HASH_SHAPE }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1, lendHash: true }] }
			)
			expect(result.expected.map(({ strapiId }) => strapiId)).toEqual([1])
			expect(hashOf(result, 1)).toBe(HASH_SHAPE)
			expect(result.expected[0]?.values.legacyProvider).toBe('google')
			expect(result.expected[0]?.gaps).toContainEqual({
				field: 'legacyBcrypt',
				reference: REFERENCES.comptesEmailPartage,
			})
			expect(result).toMatchObject({ attachedHashes: [1], unattachedHashes: 0 })
		})

		test('le compte gardé qui a déjà son hash le garde ; celui de l’écarté est compté comme non rattaché', () => {
			const result = expectedAccounts(
				[
					line(1, { email: 'a@example.test', password: HASH_SHAPE }),
					line(2, { email: 'a@example.test', password: OTHER_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashOf(result, 1)).toBe(HASH_SHAPE)
			expect(result).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
		})

		test('deux comptes écartés qui ont chacun un hash : le plus ancien est pris, l’autre est compté', () => {
			const result = expectedAccounts(
				[
					line(3, { email: 'a@example.test' }),
					line(1, { email: 'a@example.test', password: OTHER_HASH }),
					line(2, { email: 'a@example.test', password: THIRD_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2, 3], kept: 3 }] }
			)
			expect(hashOf(result, 3)).toBe(OTHER_HASH)
			expect(result).toMatchObject({ attachedHashes: [3], unattachedHashes: 1 })
		})

		test('une décision qui refuse le prêt (pretDuHash faux) laisse le compte gardé sans hash, le hash écarté est compté', () => {
			const result = expectedAccounts(
				[
					line(1, { email: 'a@example.test', provider: 'google' }),
					line(2, { email: 'a@example.test', provider: 'local', password: HASH_SHAPE }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1, lendHash: false }] }
			)
			expect(hashOf(result, 1)).toBeNull()
			expect(result).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
			expect(result.expected[0]?.gaps).not.toContainEqual(expect.objectContaining({ champ: 'legacyBcrypt' }))
		})

		test('la table de décision lit pretDuHash et refuse une valeur qui n’est pas un booléen', () => {
			expect(
				readDecisions('{ "sharedEmails": [{ "accounts": [9, 10], "kept": 9, "lendHash": false }] }').sharedEmails[0]
			).toMatchObject({ lendHash: false })
			expect(() =>
				readDecisions('{ "sharedEmails": [{ "accounts": [9, 10], "kept": 9, "lendHash": "non" }] }')
			).toThrow()
		})

		test('un mot de passe incomplet n’est pas prêté, et un groupe sans hash ne change rien', () => {
			const result = expectedAccounts(
				[line(1, { email: 'a@example.test' }), line(2, { email: 'a@example.test', password: 'pas-un-hash' })],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashOf(result, 1)).toBeNull()
			expect(result).toMatchObject({ attachedHashes: [], unattachedHashes: 0 })
		})
	})
})

describe('la table de décision', () => {
	test('elle se lit, et une table vide ne décide rien', () => {
		expect(readDecisions('{ "sharedEmails": [{ "accounts": [9, 10], "kept": 10 }] }')).toEqual({
			sharedEmails: [{ accounts: [9, 10], kept: 10 }],
			excludedProfiles: [],
		})
		expect(readDecisions('{ "excludedProfiles": [29] }')).toEqual({ sharedEmails: [], excludedProfiles: [29] })
		expect(readDecisions('{}')).toEqual(NO_DECISION)
	})

	test('une table mal formée est refusée, avec ce qui ne va pas, jamais une valeur', () => {
		const refused = [
			'pas du json',
			'{ "sharedEmails": [{ "accounts": [9, 10], "kept": 11 }] }',
			'{ "sharedEmails": [{ "accounts": [9], "kept": 9 }] }',
			'{ "sharedEmails": [{ "accounts": [9, 9], "kept": 9 }] }',
			'{ "sharedEmails": [{ "accounts": [9, 10], "kept": 9, "email": "x@example.test" }] }',
			'{ "sharedEmails": [{ "accounts": [9, 10], "kept": 9 }, { "accounts": [10, 11], "kept": 11 }] }',
			'{ "autre": [] }',
			'{ "excludedProfiles": [29, 29] }',
			'{ "excludedProfiles": [0] }',
			'{ "excludedProfiles": "29" }',
		]
		for (const text of refused) {
			expect(() => readDecisions(text), text).toThrow(ImportRefuse)
			try {
				readDecisions(text)
			} catch (error) {
				expect((error as Error).message).not.toContain('example.test')
			}
		}
	})

	test('la table du banc garde le compte 9 parmi les quatre qui partagent un email, et écarte le profil 29 du compte 11', () => {
		const text = readFileSync(path.resolve(import.meta.dir, '../fixtures/import/bench-decisions.json'), 'utf8')
		expect(readDecisions(text)).toEqual({
			sharedEmails: [{ accounts: [9, 10, 11, 12], kept: 9 }],
			excludedProfiles: [29],
		})
	})
})

describe('chaque écart de l’import se lit contre une règle écrite', () => {
	const registry = readFileSync(path.join(DOCS, 'CHANGEMENTS-VOULUS.md'), 'utf8')
	const schema = readFileSync(path.join(DOCS, 'SCHEMA.md'), 'utf8')

	/**
	 * The part of the frozen schema under a heading `### <numéro>` (`5.1`), or `## <numéro>.` (`8`),
	 * up to the next heading.
	 */
	const schemaSection = (numero: string): string => {
		const startedAt = schema.indexOf(numero.includes('.') ? `\n### ${numero} ` : `\n## ${numero}. `)
		if (startedAt < 0) return ''
		const end = schema.indexOf('\n#', startedAt + 1)
		return schema.slice(startedAt, end < 0 ? undefined : end)
	}

	test('un repère est une ligne du registre ; une section du schéma nomme l’attribut', () => {
		for (const reference of Object.values(REFERENCES)) {
			const schemaValue = /^SCHEMA\.md §(\d+(?:\.\d+)?) \((\w+)\)$/.exec(reference)
			if (schemaValue) expect(schemaSection(schemaValue[1] ?? ''), reference).toContain(`| \`${schemaValue[2]}\` |`)
			else expect(registry, reference).toContain(`| \`${reference}\` |`)
		}
	})
})
