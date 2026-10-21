import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { NO_DECISION } from '../../scripts/migration/import/decisions'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import { BENCH_DECISION_FILE, BENCH_DECISIONS, importCommand, importOnBench } from '../support/import'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import {
	benchSource,
	COMPTES_DE_FIXTURE,
	createSourceStrapi,
	eraseSourceStrapi,
	sourceFingerprint,
} from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'
import { HASH_BCRYPT_FULL } from '../support/source-strapi/inventory'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 025: the accounts of the makeup artists are taken with their bcrypt hash, copied from base
 * to base (plan 01 §2.4, M1; plan 02, I39, I41, I44). Accounts that share one email stop the import
 * until the table of decisions says which one is kept: on the bench, account 9 of 9 to 12.
 */

const source = benchSource()

const SOURCE_ACCOUNTS = sourceDefinition(source.medias).lignes.up_users

/** The accounts the table of decisions of the bench sets aside: 10, 11 and 12 share the email of 9. */
const DISCARDED = [10, 11, 12]

const inIso = (horodatage: unknown): string => `${String(horodatage).replace(' ', 'T')}Z`

/** As the owner of the bench, the only one who may write into the source. */
async function withOwner<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const owner = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(owner)
	} finally {
		await owner.close()
	}
}

/** The password column of the source, account by account: in memory, for the comparison only. */
const sourceHash = (): Promise<Map<number, string | null>> =>
	withOwner(async sql => {
		const lines = (await sql.unsafe('SELECT id, password FROM up_users ORDER BY id')) as {
			id: number
			password: string | null
		}[]
		return new Map(lines.map(({ id, password }) => [id, password]))
	})

/** Every account of the target, hidden fields included: the legacy hash, Payload's own hash. */
async function targetAccounts() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'pros',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		showHiddenFields: true,
		sort: 'strapiId',
	})
	return docs
}

beforeEach(async () => {
	await emptyBase()
	await emptySink()
	await createSourceStrapi()
})

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Critère 1 : autant de comptes qu’à la source, hors comptes écartés ; répartition par fournisseur identique (I39)', () => {
	test('chaque compte repris porte son email en minuscules, son nom, son fournisseur, son blocage et ses dates', async () => {
		const report = await importOnBench()

		const taken = SOURCE_ACCOUNTS.filter(({ id }) => !DISCARDED.includes(Number(id)))
		const target = await targetAccounts()
		expect(target.map(({ strapiId }) => strapiId)).toEqual(taken.map(({ id }) => Number(id)))
		for (const [rank, line] of taken.entries())
			expect(target[rank]).toMatchObject({
				strapiId: line.id,
				email: String(line.email).trim().toLowerCase(),
				name: line.username,
				legacyProvider: line.provider,
				blocked: line.blocked,
				_verified: true,
				createdAt: inIso(line.created_at),
				updatedAt: inIso(line.updated_at),
			})
		expect(report.collections.pros).toMatchObject({ source: 17, created: 14, refused: [], excluded: DISCARDED })
		// The email of account 7 had capitals and edge spaces: one transformation, by its rule.
		expect(report.gaps['SCHEMA.md §5.1 (email)']).toBe(1)
	})

	test('la répartition par fournisseur de la cible est celle de la source, comptes écartés retirés', async () => {
		const report = await importOnBench()

		const expected: Record<string, number> = {}
		for (const { id, provider } of SOURCE_ACCOUNTS)
			if (!DISCARDED.includes(Number(id))) expected[String(provider)] = (expected[String(provider)] ?? 0) + 1
		const target: Record<string, number> = {}
		for (const { legacyProvider } of await targetAccounts())
			target[String(legacyProvider)] = (target[String(legacyProvider)] ?? 0) + 1

		expect(expected).toEqual({ local: 7, google: 5, facebook: 2 })
		expect(target).toEqual(expected)
		expect(report.parity?.pros?.distribution?.providers).toEqual(expected)
		expect(report.parity?.pros).toMatchObject({ expected: 14, equal: 14, different: [], missing: [], extra: [] })
	})

	test('un compte arrive confirmé, sans session, avec un mot de passe que personne ne connaît, et sans email envoyé', async () => {
		await importOnBench()
		const payload = await testPayload()

		const accounts = await targetAccounts()
		for (const account of accounts) {
			expect(account._verified, String(account.strapiId)).toBe(true)
			expect(account.sessions ?? [], String(account.strapiId)).toEqual([])
		}
		// Each one has a password of its own: Payload's hashes all differ, and none is the old one.
		const hashes = accounts.map(({ hash }) => hash)
		expect(new Set(hashes).size).toBe(accounts.length)
		for (const hash of hashes) expect(hash).not.toMatch(/^\$2[aby]\$/)
		// Neither the password of the old site nor any other opens Payload's own login.
		for (const { email, motDePasse: passwordValue } of COMPTES_DE_FIXTURE)
			await expect(payload.login({ collection: 'pros', data: { email, password: passwordValue } })).rejects.toThrow()
		expect(await countMails()).toBe(0)
	})

	test('un compte non confirmé à la source arrive confirmé, et il est listé', async () => {
		await withOwner(sql => sql.unsafe('UPDATE up_users SET confirmed = false WHERE id = 14'))

		const report = await importOnBench()

		expect(report.collections.pros?.unconfirmed).toEqual([14])
		expect(report.gaps['confirmation-email']).toBe(1)
		expect((await targetAccounts()).find(({ strapiId }) => strapiId === 14)?._verified).toBe(true)
	})
})

describe('Critère 2 : autant de hash hérités que de comptes source avec un hash complet ; aucun hash dans un fichier ou un journal (I44)', () => {
	test('chaque hash complet de la source est copié tel quel, et il ouvre encore le mot de passe de l’ancien site', async () => {
		const report = await importOnBench()
		const hashes = await sourceHash()

		const full = [...hashes].filter(
			([id, hash]) => !DISCARDED.includes(id) && hash !== null && HASH_BCRYPT_FULL.test(hash)
		)
		const target = await targetAccounts()
		const legacy = target.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string')
		expect(full).toHaveLength(8)
		expect(legacy).toHaveLength(full.length)
		for (const account of target)
			expect(account.legacyBcrypt === (hashes.get(Number(account.strapiId)) ?? null), String(account.strapiId)).toBe(
				true
			)
		for (const { strapiId, motDePasse: passwordValue } of COMPTES_DE_FIXTURE) {
			const hash = target.find(compte => compte.strapiId === strapiId)?.legacyBcrypt ?? ''
			expect(await Bun.password.verify(passwordValue, hash), String(strapiId)).toBe(true)
		}
		expect(report.collections.pros?.distribution?.legacyHashes).toBe(8)
		expect(report.parity?.pros?.distribution?.legacyHashes).toBe(8)
	})

	test('un mot de passe qui n’est pas un hash bcrypt complet ne donne aucun hash hérité', async () => {
		await withOwner(sql => sql.unsafe("UPDATE up_users SET password = '$2a$10$coupé' WHERE id = 17"))

		const report = await importOnBench()

		expect((await targetAccounts()).find(({ strapiId }) => strapiId === 17)?.legacyBcrypt ?? null).toBeNull()
		expect(report.gaps['SCHEMA.md §5.1 (password)']).toBe(1)
		expect(report.parity?.pros?.distribution?.legacyHashes).toBe(7)
	})

	test('le compte gardé sans hash prend celui d’un compte écarté : écrit en base, compté, jamais dans le rapport (prêt de 066)', async () => {
		await withOwner(async sql => {
			await sql.unsafe('UPDATE up_users SET password = NULL WHERE id = 9')
			await sql.unsafe('UPDATE up_users SET password = (SELECT password FROM up_users WHERE id = 1) WHERE id = 10')
		})
		const hashes = await sourceHash()

		const report = await importOnBench()

		const target = await targetAccounts()
		expect(target.find(({ strapiId }) => strapiId === 9)?.legacyBcrypt).toBe(hashes.get(10) ?? 'absent')
		expect(report.collections.pros?.attachedHashes).toEqual([9])
		expect(report.gaps['comptes-email-partage']).toBeGreaterThanOrEqual(1)
		// Account 10 is set aside: its hash is on account 9 only, so the count is one more than without the loan.
		expect(target.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string')).toHaveLength(8)
		expect(JSON.stringify(report)).not.toMatch(/\$2[aby]\$/)
	})

	test('une décision qui refuse le prêt (pretDuHash faux) laisse le compte gardé sans hash', async () => {
		await withOwner(async sql => {
			await sql.unsafe('UPDATE up_users SET password = NULL WHERE id = 9')
			await sql.unsafe('UPDATE up_users SET password = (SELECT password FROM up_users WHERE id = 1) WHERE id = 10')
		})

		const report = await importOnBench('real', {
			decisions: {
				...BENCH_DECISIONS,
				sharedEmails: [{ accounts: [9, 10, 11, 12], kept: 9, lendHash: false }],
			},
		})

		const target = await targetAccounts()
		expect(target.find(({ strapiId }) => strapiId === 9)?.legacyBcrypt ?? null).toBeNull()
		expect(report.collections.pros?.attachedHashes ?? []).toEqual([])
		expect(report.collections.pros?.unattachedHashes).toBeGreaterThanOrEqual(1)
	})

	test('ni la sortie de la commande ni son rapport JSON ne portent un hash, un email ou un nom', async () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'rapport-import-'))
		try {
			const file = path.join(folder, 'rapport.json')
			const { code, sortie: output } = await importCommand([
				'--real',
				'--decisions',
				BENCH_DECISION_FILE,
				'--report',
				file,
			])
			const json = readFileSync(file, 'utf8')

			expect(code).toBe(0)
			expect(output).toContain('Comptes : 17 à la source ; 14 créations')
			expect(output).toContain('par fournisseur : facebook 2, google 5, local 7 ; 8 hash hérités')
			for (const text of [output, json]) {
				expect(text).not.toMatch(/\$2[aby]\$/)
				expect(text).not.toMatch(/@example\.test/i)
				for (const { username } of SOURCE_ACCOUNTS) expect(text).not.toContain(String(username))
				for (const { motDePasse: passwordValue } of COMPTES_DE_FIXTURE) expect(text).not.toContain(passwordValue)
			}
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}
	}, 60_000)

	test('une erreur de la base en cours d’écriture arrête la commande, qui ne dit ni hash, ni email, ni nom', async () => {
		// Account 2 has a complete hash at the source: the query that fails carries it, with its email.
		const account = COMPTES_DE_FIXTURE[1]?.strapiId ?? 0
		const payload = await testPayload()
		await payload.db.pool.query(
			`CREATE FUNCTION banc_refus_d_un_compte() RETURNS trigger LANGUAGE plpgsql AS $$
			 BEGIN IF NEW.strapi_id = ${account} THEN RAISE EXCEPTION 'refus du banc' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $$`
		)
		await payload.db.pool.query(
			'CREATE TRIGGER banc_refus_d_un_compte BEFORE INSERT ON pros FOR EACH ROW EXECUTE FUNCTION banc_refus_d_un_compte()'
		)
		try {
			const { code, sortie: output } = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE])

			expect(code).toBe(6)
			expect(output).toContain(`le document ${account} de « pros »`)
			expect(output).toContain('code P0001')
			expect(output).not.toMatch(/\$2[aby]\$/)
			expect(output).not.toMatch(/@example\.test/i)
			expect(output).not.toContain('pbkdf2')
			expect(output).not.toContain('refus du banc')
			for (const { username } of SOURCE_ACCOUNTS) expect(output).not.toContain(String(username))
		} finally {
			await payload.db.pool.query('DROP TRIGGER IF EXISTS banc_refus_d_un_compte ON pros')
			await payload.db.pool.query('DROP FUNCTION IF EXISTS banc_refus_d_un_compte()')
		}
	}, 60_000)
})

describe('Un compte que la cible refuse : listé, et la parité le dit (I39)', () => {
	test('un email déjà pris dans la v3 : le compte est refusé, la parité est incomplète, la commande sort en 5', async () => {
		const payload = await testPayload()
		const line = SOURCE_ACCOUNTS.find(({ id }) => Number(id) === 4)
		await payload.create({
			collection: 'pros',
			data: { email: String(line?.email).trim().toLowerCase(), password: randomBytes(24).toString('base64url') },
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
			overrideAccess: true,
		})

		const { code, sortie: output } = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE])

		expect(code, output).toBe(5)
		expect(output).toContain('  - refusé : identifiant 4 (refuse-par-payload : email)')
		expect(output).toContain('Comptes : 13 sur 14 égaux, parité incomplète : 1 refusé (4)')
		// Its profile has no account to point at: refused as well, and counted.
		expect(output).toContain('  - refusé : identifiant 24 (refuse-par-payload : pro)')
		expect(output).toMatch(/Profils : \d+ sur \d+ égaux, parité incomplète : 1 refusé \(24\)/)
		expect(output).not.toMatch(/@example\.test/i)
	}, 60_000)
})

describe('Critère 3 : un compte sans profil reste sans profil (I41)', () => {
	test('aucun compte repris ne reçoit le profil vide qu’une inscription crée', async () => {
		await importOnBench()
		const payload = await testPayload()

		const withoutProfileAtSource = (await targetAccounts()).find(({ strapiId }) => strapiId === 8)
		expect(withoutProfileAtSource).toBeDefined()
		const ofThisAccount = await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { pro: { equals: withoutProfileAtSource?.id } },
		})
		expect(ofThisAccount.totalDocs).toBe(0)
		// An automatic profile has no `strapiId`: none was created.
		const automatic = await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { strapiId: { exists: false } },
		})
		expect(automatic.totalDocs).toBe(0)
	})
})

describe('Critère 4 : même email sans décision, arrêt et rapport par identifiants ; avec la table, seul le compte retenu', () => {
	test('sans table de décision, l’import s’arrête avant toute écriture et liste le groupe par identifiants', async () => {
		const before = await sourceFingerprint()

		const report = await importOnBench('real', { decisions: NO_DECISION })

		expect(report.halt).toEqual({
			sharedEmails: [[9, 10, 11, 12]],
			profilesOfExcludedAccounts: [],
			profilesWithoutAccount: [],
		})
		expect(report.parity).toBeNull()
		expect(await targetAccounts()).toEqual([])
		const payload = await testPayload()
		expect((await payload.count({ collection: 'talents', overrideAccess: true })).totalDocs).toBe(0)
		expect((await sourceFingerprint()).empreinte).toBe(before.empreinte)
	})

	test('la commande sans table sort en 3, nomme le groupe par identifiants, et ne dit aucun email', async () => {
		const { code, sortie: output } = await importCommand(['--real'])

		expect(code).toBe(3)
		expect(output).toContain('Import arrêté avant toute écriture')
		expect(output).toContain('[9, 10, 11, 12]')
		expect(output).not.toMatch(/@example\.test/i)
		expect(await targetAccounts()).toEqual([])
	}, 60_000)

	test('avec la table, seul le compte retenu est repris, quel qu’il soit', async () => {
		// Account 9 is set aside this time: the table says what becomes of its profile, 28.
		const report = await importOnBench('real', {
			decisions: { sharedEmails: [{ accounts: [12, 11, 10, 9], kept: 11 }], excludedProfiles: [28] },
		})

		const group = (await targetAccounts()).filter(({ strapiId }) => [9, 10, 11, 12].includes(Number(strapiId)))
		expect(group.map(({ strapiId }) => strapiId)).toEqual([11])
		expect(report.collections.profiles?.excluded).toEqual([28])
	})

	test('une décision qui ne nomme pas exactement le groupe ne vaut pas : l’import s’arrête', async () => {
		const report = await importOnBench('real', {
			decisions: { sharedEmails: [{ accounts: [9, 10, 11], kept: 9 }], excludedProfiles: [] },
		})

		expect(report.halt).toEqual({
			sharedEmails: [[9, 10, 11, 12]],
			profilesOfExcludedAccounts: [],
			profilesWithoutAccount: [],
		})
		expect(report.pointlessDecisions).toBe(1)
		expect(await targetAccounts()).toEqual([])
	})

	test('une table de décision mal formée est refusée avant toute écriture', async () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'decisions-import-'))
		try {
			const file = path.join(folder, 'decisions.json')
			writeFileSync(file, JSON.stringify({ sharedEmails: [{ accounts: [9, 10, 11, 12], kept: 13 }] }))

			const { code, sortie: output } = await importCommand(['--real', '--decisions', file])

			expect(code).toBe(1)
			expect(output).toContain('La table de décision est refusée')
			expect(await targetAccounts()).toEqual([])
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}
	})
})

describe('Critère 5 : second passage, 0 création, 0 mise à jour', () => {
	test('relancé, l’import n’écrit rien : ni les comptes, ni leur mot de passe, ni leurs dates', async () => {
		await importOnBench()
		const target = await targetAccounts()

		const second = await importOnBench()

		expect(second.collections.pros).toMatchObject({ created: 0, updated: 0, unchanged: 14, refused: [] })
		expect(second.collections.talents).toMatchObject({ created: 0, updated: 0 })
		expect(await targetAccounts()).toEqual(target)
		expect(second.source.unchanged).toBe(true)
	})

	test('un email changé à la source est mis à jour une fois, sans toucher au mot de passe, puis plus rien', async () => {
		await importOnBench()
		const before = (await targetAccounts()).find(({ strapiId }) => strapiId === 4)
		await withOwner(sql =>
			sql.unsafe(
				"UPDATE up_users SET email = 'Camille.B@Example.Test', updated_at = '2026-10-02 10:00:00' WHERE id = 4"
			)
		)

		const afterChange = await importOnBench()
		const third = await importOnBench()

		expect(afterChange.collections.pros).toMatchObject({ created: 0, updated: 1, unchanged: 13 })
		const after = (await targetAccounts()).find(({ strapiId }) => strapiId === 4)
		expect(after).toMatchObject({ email: 'camille.b@example.test', updatedAt: '2026-10-02T10:00:00.000Z' })
		expect([after?.hash, after?.salt]).toEqual([before?.hash, before?.salt])
		expect(third.collections.pros).toMatchObject({ created: 0, updated: 0, unchanged: 14 })
	})
})
