import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { NO_DECISION } from '../../scripts/migration/import/decisions'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import { commandeDImport, DECISIONS_DU_BANC, FICHIER_DES_DECISIONS_DU_BANC, importerSurLeBanc } from '../outils/import'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import {
	COMPTES_DE_FIXTURE,
	creerLaSourceStrapi,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
	sourceDuBanc,
} from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'
import { HASH_BCRYPT_COMPLET } from '../outils/source-strapi/inventaire'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 025: the accounts of the makeup artists are taken with their bcrypt hash, copied from base
 * to base (plan 01 §2.4, M1; plan 02, I39, I41, I44). Accounts that share one email stop the import
 * until the table of decisions says which one is kept: on the bench, account 9 of 9 to 12.
 */

const source = sourceDuBanc()

const COMPTES_DE_LA_SOURCE = definitionDeLaSource(source.medias).lignes.up_users

/** The accounts the table of decisions of the bench sets aside: 10, 11 and 12 share the email of 9. */
const ECARTES = [10, 11, 12]

const enIso = (horodatage: unknown): string => `${String(horodatage).replace(' ', 'T')}Z`

/** As the owner of the bench, the only one who may write into the source. */
async function avecLeProprietaire<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const proprietaire = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(proprietaire)
	} finally {
		await proprietaire.close()
	}
}

/** The password column of the source, account by account: in memory, for the comparison only. */
const hashDeLaSource = (): Promise<Map<number, string | null>> =>
	avecLeProprietaire(async sql => {
		const lignes = (await sql.unsafe('SELECT id, password FROM up_users ORDER BY id')) as {
			id: number
			password: string | null
		}[]
		return new Map(lignes.map(({ id, password }) => [id, password]))
	})

/** Every account of the target, hidden fields included: the legacy hash, Payload's own hash. */
async function comptesDeLaCible() {
	const payload = await payloadDeTest()
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
	await viderLaBase()
	await viderLeCapteur()
	await creerLaSourceStrapi()
})

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Critère 1 : autant de comptes qu’à la source, hors comptes écartés ; répartition par fournisseur identique (I39)', () => {
	test('chaque compte repris porte son email en minuscules, son nom, son fournisseur, son blocage et ses dates', async () => {
		const rapport = await importerSurLeBanc()

		const pris = COMPTES_DE_LA_SOURCE.filter(({ id }) => !ECARTES.includes(Number(id)))
		const cible = await comptesDeLaCible()
		expect(cible.map(({ strapiId }) => strapiId)).toEqual(pris.map(({ id }) => Number(id)))
		for (const [rang, ligne] of pris.entries())
			expect(cible[rang]).toMatchObject({
				strapiId: ligne.id,
				email: String(ligne.email).trim().toLowerCase(),
				name: ligne.username,
				legacyProvider: ligne.provider,
				blocked: ligne.blocked,
				_verified: true,
				createdAt: enIso(ligne.created_at),
				updatedAt: enIso(ligne.updated_at),
			})
		expect(rapport.collections.pros).toMatchObject({ source: 17, crees: 14, refuses: [], ecartes: ECARTES })
		// The email of account 7 had capitals and edge spaces: one transformation, by its rule.
		expect(rapport.ecarts['SCHEMA.md §5.1 (email)']).toBe(1)
	})

	test('la répartition par fournisseur de la cible est celle de la source, comptes écartés retirés', async () => {
		const rapport = await importerSurLeBanc()

		const attendue: Record<string, number> = {}
		for (const { id, provider } of COMPTES_DE_LA_SOURCE)
			if (!ECARTES.includes(Number(id))) attendue[String(provider)] = (attendue[String(provider)] ?? 0) + 1
		const cible: Record<string, number> = {}
		for (const { legacyProvider } of await comptesDeLaCible())
			cible[String(legacyProvider)] = (cible[String(legacyProvider)] ?? 0) + 1

		expect(attendue).toEqual({ local: 7, google: 5, facebook: 2 })
		expect(cible).toEqual(attendue)
		expect(rapport.parite?.pros?.repartition?.fournisseurs).toEqual(attendue)
		expect(rapport.parite?.pros).toMatchObject({ attendus: 14, egaux: 14, differents: [], manquants: [], enTrop: [] })
	})

	test('un compte arrive confirmé, sans session, avec un mot de passe que personne ne connaît, et sans email envoyé', async () => {
		await importerSurLeBanc()
		const payload = await payloadDeTest()

		const comptes = await comptesDeLaCible()
		for (const compte of comptes) {
			expect(compte._verified, String(compte.strapiId)).toBe(true)
			expect(compte.sessions ?? [], String(compte.strapiId)).toEqual([])
		}
		// Each one has a password of its own: Payload's hashes all differ, and none is the old one.
		const hashes = comptes.map(({ hash }) => hash)
		expect(new Set(hashes).size).toBe(comptes.length)
		for (const hash of hashes) expect(hash).not.toMatch(/^\$2[aby]\$/)
		// Neither the password of the old site nor any other opens Payload's own login.
		for (const { email, motDePasse } of COMPTES_DE_FIXTURE)
			await expect(payload.login({ collection: 'pros', data: { email, password: motDePasse } })).rejects.toThrow()
		expect(await compterLesMails()).toBe(0)
	})

	test('un compte non confirmé à la source arrive confirmé, et il est listé', async () => {
		await avecLeProprietaire(sql => sql.unsafe('UPDATE up_users SET confirmed = false WHERE id = 14'))

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.pros?.nonConfirmes).toEqual([14])
		expect(rapport.ecarts['confirmation-email']).toBe(1)
		expect((await comptesDeLaCible()).find(({ strapiId }) => strapiId === 14)?._verified).toBe(true)
	})
})

describe('Critère 2 : autant de hash hérités que de comptes source avec un hash complet ; aucun hash dans un fichier ou un journal (I44)', () => {
	test('chaque hash complet de la source est copié tel quel, et il ouvre encore le mot de passe de l’ancien site', async () => {
		const rapport = await importerSurLeBanc()
		const hashes = await hashDeLaSource()

		const complets = [...hashes].filter(
			([id, hash]) => !ECARTES.includes(id) && hash !== null && HASH_BCRYPT_COMPLET.test(hash)
		)
		const cible = await comptesDeLaCible()
		const herites = cible.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string')
		expect(complets).toHaveLength(8)
		expect(herites).toHaveLength(complets.length)
		for (const compte of cible)
			expect(compte.legacyBcrypt === (hashes.get(Number(compte.strapiId)) ?? null), String(compte.strapiId)).toBe(true)
		for (const { strapiId, motDePasse } of COMPTES_DE_FIXTURE) {
			const hash = cible.find(compte => compte.strapiId === strapiId)?.legacyBcrypt ?? ''
			expect(await Bun.password.verify(motDePasse, hash), String(strapiId)).toBe(true)
		}
		expect(rapport.collections.pros?.repartition?.hashHerites).toBe(8)
		expect(rapport.parite?.pros?.repartition?.hashHerites).toBe(8)
	})

	test('un mot de passe qui n’est pas un hash bcrypt complet ne donne aucun hash hérité', async () => {
		await avecLeProprietaire(sql => sql.unsafe("UPDATE up_users SET password = '$2a$10$coupé' WHERE id = 17"))

		const rapport = await importerSurLeBanc()

		expect((await comptesDeLaCible()).find(({ strapiId }) => strapiId === 17)?.legacyBcrypt ?? null).toBeNull()
		expect(rapport.ecarts['SCHEMA.md §5.1 (password)']).toBe(1)
		expect(rapport.parite?.pros?.repartition?.hashHerites).toBe(7)
	})

	test('le compte gardé sans hash prend celui d’un compte écarté : écrit en base, compté, jamais dans le rapport (prêt de 066)', async () => {
		await avecLeProprietaire(async sql => {
			await sql.unsafe('UPDATE up_users SET password = NULL WHERE id = 9')
			await sql.unsafe('UPDATE up_users SET password = (SELECT password FROM up_users WHERE id = 1) WHERE id = 10')
		})
		const hashes = await hashDeLaSource()

		const rapport = await importerSurLeBanc()

		const cible = await comptesDeLaCible()
		expect(cible.find(({ strapiId }) => strapiId === 9)?.legacyBcrypt).toBe(hashes.get(10) ?? 'absent')
		expect(rapport.collections.pros?.hashRattaches).toEqual([9])
		expect(rapport.ecarts['comptes-email-partage']).toBeGreaterThanOrEqual(1)
		// Account 10 is set aside: its hash is on account 9 only, so the count is one more than without the loan.
		expect(cible.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string')).toHaveLength(8)
		expect(JSON.stringify(rapport)).not.toMatch(/\$2[aby]\$/)
	})

	test('une décision qui refuse le prêt (pretDuHash faux) laisse le compte gardé sans hash', async () => {
		await avecLeProprietaire(async sql => {
			await sql.unsafe('UPDATE up_users SET password = NULL WHERE id = 9')
			await sql.unsafe('UPDATE up_users SET password = (SELECT password FROM up_users WHERE id = 1) WHERE id = 10')
		})

		const rapport = await importerSurLeBanc('reel', {
			decisions: {
				...DECISIONS_DU_BANC,
				emailsPartages: [{ comptes: [9, 10, 11, 12], retenu: 9, pretDuHash: false }],
			},
		})

		const cible = await comptesDeLaCible()
		expect(cible.find(({ strapiId }) => strapiId === 9)?.legacyBcrypt ?? null).toBeNull()
		expect(rapport.collections.pros?.hashRattaches ?? []).toEqual([])
		expect(rapport.collections.pros?.hashNonRattaches).toBeGreaterThanOrEqual(1)
	})

	test('ni la sortie de la commande ni son rapport JSON ne portent un hash, un email ou un nom', async () => {
		const dossier = mkdtempSync(path.join(tmpdir(), 'rapport-import-'))
		try {
			const fichier = path.join(dossier, 'rapport.json')
			const { code, sortie } = await commandeDImport([
				'--reel',
				'--decisions',
				FICHIER_DES_DECISIONS_DU_BANC,
				'--rapport',
				fichier,
			])
			const json = readFileSync(fichier, 'utf8')

			expect(code).toBe(0)
			expect(sortie).toContain('Comptes : 17 à la source ; 14 créations')
			expect(sortie).toContain('par fournisseur : facebook 2, google 5, local 7 ; 8 hash hérités')
			for (const texte of [sortie, json]) {
				expect(texte).not.toMatch(/\$2[aby]\$/)
				expect(texte).not.toMatch(/@example\.test/i)
				for (const { username } of COMPTES_DE_LA_SOURCE) expect(texte).not.toContain(String(username))
				for (const { motDePasse } of COMPTES_DE_FIXTURE) expect(texte).not.toContain(motDePasse)
			}
		} finally {
			rmSync(dossier, { recursive: true, force: true })
		}
	}, 60_000)

	test('une erreur de la base en cours d’écriture arrête la commande, qui ne dit ni hash, ni email, ni nom', async () => {
		// Account 2 has a complete hash at the source: the query that fails carries it, with its email.
		const compte = COMPTES_DE_FIXTURE[1]?.strapiId ?? 0
		const payload = await payloadDeTest()
		await payload.db.pool.query(
			`CREATE FUNCTION banc_refus_d_un_compte() RETURNS trigger LANGUAGE plpgsql AS $$
			 BEGIN IF NEW.strapi_id = ${compte} THEN RAISE EXCEPTION 'refus du banc' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $$`
		)
		await payload.db.pool.query(
			'CREATE TRIGGER banc_refus_d_un_compte BEFORE INSERT ON pros FOR EACH ROW EXECUTE FUNCTION banc_refus_d_un_compte()'
		)
		try {
			const { code, sortie } = await commandeDImport(['--reel', '--decisions', FICHIER_DES_DECISIONS_DU_BANC])

			expect(code).toBe(6)
			expect(sortie).toContain(`le document ${compte} de « pros »`)
			expect(sortie).toContain('code P0001')
			expect(sortie).not.toMatch(/\$2[aby]\$/)
			expect(sortie).not.toMatch(/@example\.test/i)
			expect(sortie).not.toContain('pbkdf2')
			expect(sortie).not.toContain('refus du banc')
			for (const { username } of COMPTES_DE_LA_SOURCE) expect(sortie).not.toContain(String(username))
		} finally {
			await payload.db.pool.query('DROP TRIGGER IF EXISTS banc_refus_d_un_compte ON pros')
			await payload.db.pool.query('DROP FUNCTION IF EXISTS banc_refus_d_un_compte()')
		}
	}, 60_000)
})

describe('Un compte que la cible refuse : listé, et la parité le dit (I39)', () => {
	test('un email déjà pris dans la v3 : le compte est refusé, la parité est incomplète, la commande sort en 5', async () => {
		const payload = await payloadDeTest()
		const ligne = COMPTES_DE_LA_SOURCE.find(({ id }) => Number(id) === 4)
		await payload.create({
			collection: 'pros',
			data: { email: String(ligne?.email).trim().toLowerCase(), password: randomBytes(24).toString('base64url') },
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
			overrideAccess: true,
		})

		const { code, sortie } = await commandeDImport(['--reel', '--decisions', FICHIER_DES_DECISIONS_DU_BANC])

		expect(code, sortie).toBe(5)
		expect(sortie).toContain('  - refusé : 4 (refuse-par-payload : email)')
		expect(sortie).toContain('Comptes : 13 sur 14 égaux, parité incomplète : 1 refusé (4)')
		// Its profile has no account to point at: refused as well, and counted.
		expect(sortie).toContain('  - refusé : 24 (refuse-par-payload : pro)')
		expect(sortie).toMatch(/Profils : \d+ sur \d+ égaux, parité incomplète : 1 refusé \(24\)/)
		expect(sortie).not.toMatch(/@example\.test/i)
	}, 60_000)
})

describe('Critère 3 : un compte sans profil reste sans profil (I41)', () => {
	test('aucun compte repris ne reçoit le profil vide qu’une inscription crée', async () => {
		await importerSurLeBanc()
		const payload = await payloadDeTest()

		const sansProfilALaSource = (await comptesDeLaCible()).find(({ strapiId }) => strapiId === 8)
		expect(sansProfilALaSource).toBeDefined()
		const deCeCompte = await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { pro: { equals: sansProfilALaSource?.id } },
		})
		expect(deCeCompte.totalDocs).toBe(0)
		// An automatic profile has no `strapiId`: none was created.
		const automatiques = await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { strapiId: { exists: false } },
		})
		expect(automatiques.totalDocs).toBe(0)
	})
})

describe('Critère 4 : même email sans décision, arrêt et rapport par identifiants ; avec la table, seul le compte retenu', () => {
	test('sans table de décision, l’import s’arrête avant toute écriture et liste le groupe par identifiants', async () => {
		const avant = await empreinteDeLaSource()

		const rapport = await importerSurLeBanc('reel', { decisions: NO_DECISION })

		expect(rapport.arret).toEqual({
			emailsPartages: [[9, 10, 11, 12]],
			profilsDeComptesEcartes: [],
			profilsSansCompte: [],
		})
		expect(rapport.parite).toBeNull()
		expect(await comptesDeLaCible()).toEqual([])
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'talents', overrideAccess: true })).totalDocs).toBe(0)
		expect((await empreinteDeLaSource()).empreinte).toBe(avant.empreinte)
	})

	test('la commande sans table sort en 3, nomme le groupe par identifiants, et ne dit aucun email', async () => {
		const { code, sortie } = await commandeDImport(['--reel'])

		expect(code).toBe(3)
		expect(sortie).toContain('Import arrêté avant toute écriture')
		expect(sortie).toContain('[9, 10, 11, 12]')
		expect(sortie).not.toMatch(/@example\.test/i)
		expect(await comptesDeLaCible()).toEqual([])
	}, 60_000)

	test('avec la table, seul le compte retenu est repris, quel qu’il soit', async () => {
		// Account 9 is set aside this time: the table says what becomes of its profile, 28.
		const rapport = await importerSurLeBanc('reel', {
			decisions: { emailsPartages: [{ comptes: [12, 11, 10, 9], retenu: 11 }], profilsEcartes: [28] },
		})

		const groupe = (await comptesDeLaCible()).filter(({ strapiId }) => [9, 10, 11, 12].includes(Number(strapiId)))
		expect(groupe.map(({ strapiId }) => strapiId)).toEqual([11])
		expect(rapport.collections.profiles?.ecartes).toEqual([28])
	})

	test('une décision qui ne nomme pas exactement le groupe ne vaut pas : l’import s’arrête', async () => {
		const rapport = await importerSurLeBanc('reel', {
			decisions: { emailsPartages: [{ comptes: [9, 10, 11], retenu: 9 }], profilsEcartes: [] },
		})

		expect(rapport.arret).toEqual({
			emailsPartages: [[9, 10, 11, 12]],
			profilsDeComptesEcartes: [],
			profilsSansCompte: [],
		})
		expect(rapport.decisionsSansObjet).toBe(1)
		expect(await comptesDeLaCible()).toEqual([])
	})

	test('une table de décision mal formée est refusée avant toute écriture', async () => {
		const dossier = mkdtempSync(path.join(tmpdir(), 'decisions-import-'))
		try {
			const fichier = path.join(dossier, 'decisions.json')
			writeFileSync(fichier, JSON.stringify({ emailsPartages: [{ comptes: [9, 10, 11, 12], retenu: 13 }] }))

			const { code, sortie } = await commandeDImport(['--reel', '--decisions', fichier])

			expect(code).toBe(1)
			expect(sortie).toContain('La table de décision est refusée')
			expect(await comptesDeLaCible()).toEqual([])
		} finally {
			rmSync(dossier, { recursive: true, force: true })
		}
	})
})

describe('Critère 5 : second passage, 0 création, 0 mise à jour', () => {
	test('relancé, l’import n’écrit rien : ni les comptes, ni leur mot de passe, ni leurs dates', async () => {
		await importerSurLeBanc()
		const cible = await comptesDeLaCible()

		const second = await importerSurLeBanc()

		expect(second.collections.pros).toMatchObject({ crees: 0, modifies: 0, inchanges: 14, refuses: [] })
		expect(second.collections.talents).toMatchObject({ crees: 0, modifies: 0 })
		expect(await comptesDeLaCible()).toEqual(cible)
		expect(second.source.inchangee).toBe(true)
	})

	test('un email changé à la source est mis à jour une fois, sans toucher au mot de passe, puis plus rien', async () => {
		await importerSurLeBanc()
		const avant = (await comptesDeLaCible()).find(({ strapiId }) => strapiId === 4)
		await avecLeProprietaire(sql =>
			sql.unsafe(
				"UPDATE up_users SET email = 'Camille.B@Example.Test', updated_at = '2026-10-02 10:00:00' WHERE id = 4"
			)
		)

		const apresChangement = await importerSurLeBanc()
		const troisieme = await importerSurLeBanc()

		expect(apresChangement.collections.pros).toMatchObject({ crees: 0, modifies: 1, inchanges: 13 })
		const apres = (await comptesDeLaCible()).find(({ strapiId }) => strapiId === 4)
		expect(apres).toMatchObject({ email: 'camille.b@example.test', updatedAt: '2026-10-02T10:00:00.000Z' })
		expect([apres?.hash, apres?.salt]).toEqual([avant?.hash, avant?.salt])
		expect(troisieme.collections.pros).toMatchObject({ crees: 0, modifies: 0, inchanges: 14 })
	})
})
