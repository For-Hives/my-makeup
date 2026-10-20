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
const FORME_DE_HASH = `$2a$10$${'a'.repeat(53)}`

const ligne = (id: number, modif: Partial<AccountRow> = {}): AccountRow => ({
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
		const attendu = expectedAccount(
			ligne(7, { email: ' Compte.Sept@Example.Test ', provider: 'google', password: FORME_DE_HASH }),
			() => 'tire-au-hasard'
		)

		expect(attendu).toEqual({
			strapiId: 7,
			values: {
				strapiId: 7,
				email: 'compte.sept@example.test',
				name: 'Compte 7',
				legacyProvider: 'google',
				legacyBcrypt: FORME_DE_HASH,
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
		for (const password of ['$2a$10$court', 'texte-en-clair', '', `${FORME_DE_HASH}a`]) {
			const attendu = expectedAccount(ligne(1, { password }))
			expect(attendu.values.legacyBcrypt, password).toBeNull()
			expect(attendu.gaps).toContainEqual({ field: 'legacyBcrypt', reference: 'SCHEMA.md §5.1 (password)' })
		}
		expect(expectedAccount(ligne(1, { password: null })).gaps).toEqual([])
		for (const version of ['2a', '2b', '2y'])
			expect(
				expectedAccount(ligne(1, { password: `$${version}$10$${'b'.repeat(53)}` })).values.legacyBcrypt
			).not.toBeNull()
	})

	test('un compte non confirmé à la source arrive confirmé ; nul reste nul ailleurs', () => {
		const attendu = expectedAccount(ligne(2, { confirmed: false, blocked: null, username: null }))

		expect(attendu.values).toMatchObject({ _verified: true, blocked: null, name: null })
		expect(attendu.gaps).toEqual([{ field: '_verified', reference: 'confirmation-email' }])
	})

	test('le mot de passe tiré par défaut fait 32 octets aléatoires, jamais deux fois le même', () => {
		const un = expectedAccount(ligne(1)).onCreation?.password
		const deux = expectedAccount(ligne(1)).onCreation?.password
		expect(String(un)).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(un).not.toBe(deux)
	})

	test('l’email se compare sans espaces de bord ni majuscules', () => {
		expect(normalizedEmail(' Lea.Martin@Example.TEST ')).toBe('lea.martin@example.test')
		expect(normalizedEmail(null)).toBeNull()
	})

	test('la répartition compte les fournisseurs et les seuls hash complets', () => {
		const documents = [
			expectedAccount(ligne(1, { password: FORME_DE_HASH })),
			expectedAccount(ligne(2, { provider: 'google' })),
			expectedAccount(ligne(3, { provider: 'google', password: 'pas-un-hash' })),
		]
		expect(accountDistribution(documents)).toEqual({ providers: { local: 1, google: 2 }, legacyHashes: 1 })
	})
})

describe('les comptes au même email', () => {
	const lignes = [
		ligne(9, { email: 'chloe@example.test' }),
		ligne(10, { email: 'Chloe@Example.test' }),
		ligne(3),
		ligne(12, { email: ' chloe@example.test' }),
		ligne(4, { email: 'autre@example.test' }),
		ligne(5, { email: 'AUTRE@example.test' }),
	]

	test('ils se groupent sans espaces de bord ni majuscules, chaque groupe trié', () => {
		expect(sharedEmailGroups(lignes)).toEqual([
			[4, 5],
			[9, 10, 12],
		])
	})

	test('sans décision, chaque groupe arrête l’import, et aucun de ses comptes n’est attendu', () => {
		const resultat = expectedAccounts(lignes, NO_DECISION)
		expect(resultat.withoutDecision).toEqual([
			[4, 5],
			[9, 10, 12],
		])
		expect(resultat.expected.map(({ strapiId }) => strapiId)).toEqual([3])
	})

	test('avec une décision par groupe, seul le compte retenu est attendu ; les autres sont écartés', () => {
		const resultat = expectedAccounts(lignes, {
			sharedEmails: [
				{ accounts: [12, 9, 10], kept: 10 },
				{ accounts: [4, 5], kept: 4 },
			],
		})
		expect(resultat).toMatchObject({ withoutDecision: [], excluded: [5, 9, 12], pointless: 0 })
		expect(resultat.expected.map(({ strapiId }) => strapiId)).toEqual([10, 3, 4])
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
		const AUTRE_HASH = `$2a$10$${'b'.repeat(53)}`
		const TROISIEME_HASH = `$2a$10$${'c'.repeat(53)}`
		const hashDe = (resultat: ReturnType<typeof expectedAccounts>, id: number) =>
			resultat.expected.find(({ strapiId }) => strapiId === id)?.values.legacyBcrypt

		test('un compte local écarté ne prête pas son hash au compte Google gardé sans décision explicite', () => {
			const resultat = expectedAccounts(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'A@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
		})

		test('un compte local écarté prête son hash au compte Google gardé quand la décision l’accorde (pretDuHash vrai), qui garde son fournisseur', () => {
			const resultat = expectedAccounts(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'A@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1, lendHash: true }] }
			)
			expect(resultat.expected.map(({ strapiId }) => strapiId)).toEqual([1])
			expect(hashDe(resultat, 1)).toBe(FORME_DE_HASH)
			expect(resultat.expected[0]?.values.legacyProvider).toBe('google')
			expect(resultat.expected[0]?.gaps).toContainEqual({
				field: 'legacyBcrypt',
				reference: REFERENCES.comptesEmailPartage,
			})
			expect(resultat).toMatchObject({ attachedHashes: [1], unattachedHashes: 0 })
		})

		test('le compte gardé qui a déjà son hash le garde ; celui de l’écarté est compté comme non rattaché', () => {
			const resultat = expectedAccounts(
				[
					ligne(1, { email: 'a@example.test', password: FORME_DE_HASH }),
					ligne(2, { email: 'a@example.test', password: AUTRE_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBe(FORME_DE_HASH)
			expect(resultat).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
		})

		test('deux comptes écartés qui ont chacun un hash : le plus ancien est pris, l’autre est compté', () => {
			const resultat = expectedAccounts(
				[
					ligne(3, { email: 'a@example.test' }),
					ligne(1, { email: 'a@example.test', password: AUTRE_HASH }),
					ligne(2, { email: 'a@example.test', password: TROISIEME_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2, 3], kept: 3 }] }
			)
			expect(hashDe(resultat, 3)).toBe(AUTRE_HASH)
			expect(resultat).toMatchObject({ attachedHashes: [3], unattachedHashes: 1 })
		})

		test('une décision qui refuse le prêt (pretDuHash faux) laisse le compte gardé sans hash, le hash écarté est compté', () => {
			const resultat = expectedAccounts(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'a@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1, lendHash: false }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ attachedHashes: [], unattachedHashes: 1 })
			expect(resultat.expected[0]?.gaps).not.toContainEqual(expect.objectContaining({ champ: 'legacyBcrypt' }))
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
			const resultat = expectedAccounts(
				[ligne(1, { email: 'a@example.test' }), ligne(2, { email: 'a@example.test', password: 'pas-un-hash' })],
				{ sharedEmails: [{ accounts: [1, 2], kept: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ attachedHashes: [], unattachedHashes: 0 })
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
		const refusees = [
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
		for (const texte of refusees) {
			expect(() => readDecisions(texte), texte).toThrow(ImportRefuse)
			try {
				readDecisions(texte)
			} catch (erreur) {
				expect((erreur as Error).message).not.toContain('example.test')
			}
		}
	})

	test('la table du banc garde le compte 9 parmi les quatre qui partagent un email, et écarte le profil 29 du compte 11', () => {
		const texte = readFileSync(path.resolve(import.meta.dir, '../fixtures/import/decisions-du-banc.json'), 'utf8')
		expect(readDecisions(texte)).toEqual({
			sharedEmails: [{ accounts: [9, 10, 11, 12], kept: 9 }],
			excludedProfiles: [29],
		})
	})
})

describe('chaque écart de l’import se lit contre une règle écrite', () => {
	const registre = readFileSync(path.join(DOCS, 'CHANGEMENTS-VOULUS.md'), 'utf8')
	const schema = readFileSync(path.join(DOCS, 'SCHEMA.md'), 'utf8')

	/**
	 * The part of the frozen schema under a heading `### <numéro>` (`5.1`), or `## <numéro>.` (`8`),
	 * up to the next heading.
	 */
	const sectionDuSchema = (numero: string): string => {
		const debut = schema.indexOf(numero.includes('.') ? `\n### ${numero} ` : `\n## ${numero}. `)
		if (debut < 0) return ''
		const fin = schema.indexOf('\n#', debut + 1)
		return schema.slice(debut, fin < 0 ? undefined : fin)
	}

	test('un repère est une ligne du registre ; une section du schéma nomme l’attribut', () => {
		for (const reference of Object.values(REFERENCES)) {
			const duSchema = /^SCHEMA\.md §(\d+(?:\.\d+)?) \((\w+)\)$/.exec(reference)
			if (duSchema) expect(sectionDuSchema(duSchema[1] ?? ''), reference).toContain(`| \`${duSchema[2]}\` |`)
			else expect(registre, reference).toContain(`| \`${reference}\` |`)
		}
	})
})
