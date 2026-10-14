import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImportRefuse } from '../../scripts/migration/import/cible'
import {
	compteAttendu,
	comptesAttendus,
	emailNormalise,
	groupesDEmailPartage,
	type LigneCompte,
	repartitionDesComptes,
} from '../../scripts/migration/import/comptes'
import { AUCUNE_DECISION, appliquerLesDecisions, lireLesDecisions } from '../../scripts/migration/import/decisions'
import { REFERENCES } from '../../scripts/migration/import/ecarts'

/**
 * Ticket 025: what the import makes of an account of the old site, and the table of decisions of
 * the accounts that share one email. No database: the runs are in
 * tests/integration/import-comptes.test.ts. Every value here is fictional.
 */

const DOCS = path.resolve(import.meta.dir, '../../docs/migration')

/** The shape of a complete bcrypt hash, made of one repeated character: no real hash. */
const FORME_DE_HASH = `$2a$10$${'a'.repeat(53)}`

const ligne = (id: number, modif: Partial<LigneCompte> = {}): LigneCompte => ({
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
		const attendu = compteAttendu(
			ligne(7, { email: ' Compte.Sept@Example.Test ', provider: 'google', password: FORME_DE_HASH }),
			() => 'tire-au-hasard'
		)

		expect(attendu).toEqual({
			strapiId: 7,
			valeurs: {
				strapiId: 7,
				email: 'compte.sept@example.test',
				nom: 'Compte 7',
				legacyProvider: 'google',
				legacyBcrypt: FORME_DE_HASH,
				bloque: false,
				_verified: true,
				createdAt: '2023-05-12T09:14:03.211Z',
				updatedAt: '2023-05-12T09:14:03.211Z',
			},
			aLaCreation: { password: 'tire-au-hasard' },
			ecarts: [{ champ: 'email', reference: 'SCHEMA.md §5.1 (email)' }],
		})
	})

	test('seul un hash bcrypt complet est copié : toute autre valeur ne donne rien, et c’est compté', () => {
		for (const password of ['$2a$10$court', 'texte-en-clair', '', `${FORME_DE_HASH}a`]) {
			const attendu = compteAttendu(ligne(1, { password }))
			expect(attendu.valeurs.legacyBcrypt, password).toBeNull()
			expect(attendu.ecarts).toContainEqual({ champ: 'legacyBcrypt', reference: 'SCHEMA.md §5.1 (password)' })
		}
		expect(compteAttendu(ligne(1, { password: null })).ecarts).toEqual([])
		for (const version of ['2a', '2b', '2y'])
			expect(
				compteAttendu(ligne(1, { password: `$${version}$10$${'b'.repeat(53)}` })).valeurs.legacyBcrypt
			).not.toBeNull()
	})

	test('un compte non confirmé à la source arrive confirmé ; nul reste nul ailleurs', () => {
		const attendu = compteAttendu(ligne(2, { confirmed: false, blocked: null, username: null }))

		expect(attendu.valeurs).toMatchObject({ _verified: true, bloque: null, nom: null })
		expect(attendu.ecarts).toEqual([{ champ: '_verified', reference: 'confirmation-email' }])
	})

	test('le mot de passe tiré par défaut fait 32 octets aléatoires, jamais deux fois le même', () => {
		const un = compteAttendu(ligne(1)).aLaCreation?.password
		const deux = compteAttendu(ligne(1)).aLaCreation?.password
		expect(String(un)).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(un).not.toBe(deux)
	})

	test('l’email se compare sans espaces de bord ni majuscules', () => {
		expect(emailNormalise(' Lea.Martin@Example.TEST ')).toBe('lea.martin@example.test')
		expect(emailNormalise(null)).toBeNull()
	})

	test('la répartition compte les fournisseurs et les seuls hash complets', () => {
		const documents = [
			compteAttendu(ligne(1, { password: FORME_DE_HASH })),
			compteAttendu(ligne(2, { provider: 'google' })),
			compteAttendu(ligne(3, { provider: 'google', password: 'pas-un-hash' })),
		]
		expect(repartitionDesComptes(documents)).toEqual({ fournisseurs: { local: 1, google: 2 }, hashHerites: 1 })
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
		expect(groupesDEmailPartage(lignes)).toEqual([
			[4, 5],
			[9, 10, 12],
		])
	})

	test('sans décision, chaque groupe arrête l’import, et aucun de ses comptes n’est attendu', () => {
		const resultat = comptesAttendus(lignes, AUCUNE_DECISION)
		expect(resultat.sansDecision).toEqual([
			[4, 5],
			[9, 10, 12],
		])
		expect(resultat.attendus.map(({ strapiId }) => strapiId)).toEqual([3])
	})

	test('avec une décision par groupe, seul le compte retenu est attendu ; les autres sont écartés', () => {
		const resultat = comptesAttendus(lignes, {
			emailsPartages: [
				{ comptes: [12, 9, 10], retenu: 10 },
				{ comptes: [4, 5], retenu: 4 },
			],
		})
		expect(resultat).toMatchObject({ sansDecision: [], ecartes: [5, 9, 12], sansObjet: 0 })
		expect(resultat.attendus.map(({ strapiId }) => strapiId)).toEqual([10, 3, 4])
	})

	test('une décision vaut pour le groupe exact qu’elle nomme ; sinon elle est sans objet', () => {
		expect(
			appliquerLesDecisions([[9, 10, 12]], {
				emailsPartages: [
					{ comptes: [9, 10], retenu: 9 },
					{ comptes: [9, 10, 12, 13], retenu: 9 },
				],
			})
		).toEqual({ ecartes: [], rattaches: [], sansDecision: [[9, 10, 12]], sansObjet: 2 })
	})

	describe('les moyens de connexion des comptes écartés (défaut du ticket 066)', () => {
		const AUTRE_HASH = `$2a$10$${'b'.repeat(53)}`
		const TROISIEME_HASH = `$2a$10$${'c'.repeat(53)}`
		const hashDe = (resultat: ReturnType<typeof comptesAttendus>, id: number) =>
			resultat.attendus.find(({ strapiId }) => strapiId === id)?.valeurs.legacyBcrypt

		test('un compte local écarté ne prête pas son hash au compte Google gardé sans décision explicite', () => {
			const resultat = comptesAttendus(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'A@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ emailsPartages: [{ comptes: [1, 2], retenu: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ hashRattaches: [], hashNonRattaches: 1 })
		})

		test('un compte local écarté prête son hash au compte Google gardé quand la décision l’accorde (pretDuHash vrai), qui garde son fournisseur', () => {
			const resultat = comptesAttendus(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'A@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ emailsPartages: [{ comptes: [1, 2], retenu: 1, pretDuHash: true }] }
			)
			expect(resultat.attendus.map(({ strapiId }) => strapiId)).toEqual([1])
			expect(hashDe(resultat, 1)).toBe(FORME_DE_HASH)
			expect(resultat.attendus[0]?.valeurs.legacyProvider).toBe('google')
			expect(resultat.attendus[0]?.ecarts).toContainEqual({
				champ: 'legacyBcrypt',
				reference: REFERENCES.comptesEmailPartage,
			})
			expect(resultat).toMatchObject({ hashRattaches: [1], hashNonRattaches: 0 })
		})

		test('le compte gardé qui a déjà son hash le garde ; celui de l’écarté est compté comme non rattaché', () => {
			const resultat = comptesAttendus(
				[
					ligne(1, { email: 'a@example.test', password: FORME_DE_HASH }),
					ligne(2, { email: 'a@example.test', password: AUTRE_HASH }),
				],
				{ emailsPartages: [{ comptes: [1, 2], retenu: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBe(FORME_DE_HASH)
			expect(resultat).toMatchObject({ hashRattaches: [], hashNonRattaches: 1 })
		})

		test('deux comptes écartés qui ont chacun un hash : le plus ancien est pris, l’autre est compté', () => {
			const resultat = comptesAttendus(
				[
					ligne(3, { email: 'a@example.test' }),
					ligne(1, { email: 'a@example.test', password: AUTRE_HASH }),
					ligne(2, { email: 'a@example.test', password: TROISIEME_HASH }),
				],
				{ emailsPartages: [{ comptes: [1, 2, 3], retenu: 3 }] }
			)
			expect(hashDe(resultat, 3)).toBe(AUTRE_HASH)
			expect(resultat).toMatchObject({ hashRattaches: [3], hashNonRattaches: 1 })
		})

		test('une décision qui refuse le prêt (pretDuHash faux) laisse le compte gardé sans hash, le hash écarté est compté', () => {
			const resultat = comptesAttendus(
				[
					ligne(1, { email: 'a@example.test', provider: 'google' }),
					ligne(2, { email: 'a@example.test', provider: 'local', password: FORME_DE_HASH }),
				],
				{ emailsPartages: [{ comptes: [1, 2], retenu: 1, pretDuHash: false }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ hashRattaches: [], hashNonRattaches: 1 })
			expect(resultat.attendus[0]?.ecarts).not.toContainEqual(expect.objectContaining({ champ: 'legacyBcrypt' }))
		})

		test('la table de décision lit pretDuHash et refuse une valeur qui n’est pas un booléen', () => {
			expect(
				lireLesDecisions('{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 9, "pretDuHash": false }] }')
					.emailsPartages[0]
			).toMatchObject({ pretDuHash: false })
			expect(() =>
				lireLesDecisions('{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 9, "pretDuHash": "non" }] }')
			).toThrow()
		})

		test('un mot de passe incomplet n’est pas prêté, et un groupe sans hash ne change rien', () => {
			const resultat = comptesAttendus(
				[ligne(1, { email: 'a@example.test' }), ligne(2, { email: 'a@example.test', password: 'pas-un-hash' })],
				{ emailsPartages: [{ comptes: [1, 2], retenu: 1 }] }
			)
			expect(hashDe(resultat, 1)).toBeNull()
			expect(resultat).toMatchObject({ hashRattaches: [], hashNonRattaches: 0 })
		})
	})
})

describe('la table de décision', () => {
	test('elle se lit, et une table vide ne décide rien', () => {
		expect(lireLesDecisions('{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 10 }] }')).toEqual({
			emailsPartages: [{ comptes: [9, 10], retenu: 10 }],
			profilsEcartes: [],
		})
		expect(lireLesDecisions('{ "profilsEcartes": [29] }')).toEqual({ emailsPartages: [], profilsEcartes: [29] })
		expect(lireLesDecisions('{}')).toEqual(AUCUNE_DECISION)
	})

	test('une table mal formée est refusée, avec ce qui ne va pas, jamais une valeur', () => {
		const refusees = [
			'pas du json',
			'{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 11 }] }',
			'{ "emailsPartages": [{ "comptes": [9], "retenu": 9 }] }',
			'{ "emailsPartages": [{ "comptes": [9, 9], "retenu": 9 }] }',
			'{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 9, "email": "x@example.test" }] }',
			'{ "emailsPartages": [{ "comptes": [9, 10], "retenu": 9 }, { "comptes": [10, 11], "retenu": 11 }] }',
			'{ "autre": [] }',
			'{ "profilsEcartes": [29, 29] }',
			'{ "profilsEcartes": [0] }',
			'{ "profilsEcartes": "29" }',
		]
		for (const texte of refusees) {
			expect(() => lireLesDecisions(texte), texte).toThrow(ImportRefuse)
			try {
				lireLesDecisions(texte)
			} catch (erreur) {
				expect((erreur as Error).message).not.toContain('example.test')
			}
		}
	})

	test('la table du banc garde le compte 9 parmi les quatre qui partagent un email, et écarte le profil 29 du compte 11', () => {
		const texte = readFileSync(path.resolve(import.meta.dir, '../fixtures/import/decisions-du-banc.json'), 'utf8')
		expect(lireLesDecisions(texte)).toEqual({
			emailsPartages: [{ comptes: [9, 10, 11, 12], retenu: 9 }],
			profilsEcartes: [29],
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
