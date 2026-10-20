import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SQL } from 'bun'
import { LARGE_OBJECTS, type Query, sameTables, tablesFingerprint } from '../../scripts/migration/import/source'
import { ROOT } from '../support/bench'
import { deleteObject, dropObject } from '../support/s3'
import {
	benchSource,
	COMPTES_DE_FIXTURE,
	createSourceStrapi,
	eraseSourceStrapi,
	inventaire,
	openSource,
	readSource,
	sourceFingerprint,
} from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'
import { HASH_BCRYPT_FULL, type InventoryLine } from '../support/source-strapi/inventory'
import { TABLE_NAMES } from '../support/source-strapi/schema'

const source = benchSource()

/** The read-only connections opened by a test, closed after it whatever happened. */
const aFermer: SQL[] = []
afterAll(async () => {
	await Promise.all(aFermer.splice(0).map(sql => sql.close()))
	// Nothing of the source is left on the bench: database, role, objects.
	await eraseSourceStrapi()
})

function lecture(): SQL {
	const sql = openSource()
	aFermer.push(sql)
	return sql
}

/** Runs `bun run bench:source` as a person would, and returns what it printed. */
async function commande(...options: string[]): Promise<{ code: number; sortie: string }> {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/source-strapi.ts', ...options], {
		cwd: ROOT,
		env: process.env,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, sortie, erreurs] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	])
	return { code, sortie: sortie + erreurs }
}

const empreinteAffichee = (sortie: string): string | undefined =>
	/^Empreinte de la source : ([0-9a-f]{64})$/m.exec(sortie)?.[1]

/** The table of docs/tests/source-strapi.md, row by row. */
function tableauDuDocument(): InventoryLine[] {
	const document = readFileSync(path.join(ROOT, 'docs/tests/source-strapi.md'), 'utf8')
	const lignes = document.slice(document.indexOf('| Groupe | Cas |')).split('\n')
	return lignes
		.slice(
			2,
			lignes.findIndex(ligne => !ligne.startsWith('|'))
		)
		.map(ligne => ligne.split('|').map(cellule => cellule.trim()))
		.map(([, groupe = '', cas = '', reel = '', fausse = '']) => ({ groupe, cas, reel, nombre: Number(fausse) }))
}

/** The SQLSTATE of a PostgreSQL error, or what was thrown when it is something else. */
async function codeDuRefus(essai: Promise<unknown>): Promise<string> {
	try {
		await essai
	} catch (erreur) {
		return String((erreur as { errno?: unknown }).errno ?? erreur)
	}
	return 'accepté'
}

describe('Critère 1 : une commande crée la source ; relancée, elle donne la même empreinte', () => {
	test('deux lancements de « bun run bench:source » affichent la même empreinte, celle de la source', async () => {
		const premier = await commande()
		const second = await commande()

		expect(premier.code).toBe(0)
		expect(second.code).toBe(0)
		const empreinte = empreinteAffichee(premier.sortie)
		expect(empreinte).toMatch(/^[0-9a-f]{64}$/)
		expect(empreinteAffichee(second.sortie)).toBe(empreinte ?? '')
		expect((await sourceFingerprint()).empreinte).toBe(empreinte ?? '')
		// « --fingerprint » reads it without touching anything.
		const lue = await commande('--fingerprint')
		expect(empreinteAffichee(lue.sortie)).toBe(empreinte ?? '')
		// Numbers and fingerprints only: no hash, no email, no password.
		for (const sortie of [premier.sortie, second.sortie, lue.sortie]) {
			expect(sortie).not.toMatch(/\$2[aby]\$/)
			expect(sortie).not.toContain('@example.test')
			for (const compte of COMPTES_DE_FIXTURE) expect(sortie).not.toContain(compte.motDePasse)
		}
	}, 60_000)

	test('l’empreinte voit une ligne ou un objet changé, et une nouvelle création la rend', async () => {
		await createSourceStrapi()
		const avant = await sourceFingerprint()
		expect(avant.objets).toMatchObject({ cles: 17, presents: 16 })
		expect(Object.keys(avant.tables).sort()).toEqual([...TABLE_NAMES].sort())

		// A write by the owner of the bench, the only one who may write there.
		const proprietaire = new SQL({ url: source.administration, max: 1 })
		try {
			await proprietaire.unsafe("UPDATE talents SET title = title || ' ' WHERE id = 1")
		} finally {
			await proprietaire.close()
		}
		const apresLigne = await sourceFingerprint()
		expect(apresLigne.empreinte).not.toBe(avant.empreinte)
		expect(apresLigne.tables.talents?.empreinte).not.toBe(avant.tables.talents?.empreinte)
		expect(apresLigne.tables.files).toEqual(avant.tables.files ?? { lignes: -1, empreinte: '' })

		const [objet] = sourceDefinition(source.medias).objets
		await dropObject(objet?.cle ?? 'absent', 'autre contenu', { type: 'image/png' })
		expect((await sourceFingerprint()).objets.empreinte).not.toBe(avant.objets.empreinte)
		await deleteObject(objet?.cle ?? 'absent')
		expect((await sourceFingerprint()).objets.presents).toBe(15)

		await createSourceStrapi()
		expect((await sourceFingerprint()).empreinte).toBe(avant.empreinte)
	}, 60_000)
})

describe('Critère 2 : un inventaire en nombres liste les cas couverts', () => {
	test('l’inventaire de la base créée, lu par le rôle en lecture seule, est le tableau du document', async () => {
		await createSourceStrapi()
		const lu = inventaire(await readSource())

		expect(lu).toEqual(tableauDuDocument())
	})

	test('chaque photo désignée répond à son adresse publique, sauf celle dont l’objet manque', async () => {
		await createSourceStrapi()
		const { lignes } = await readSource()
		const reponses = await Promise.all(
			lignes.files.map(async fichier => ({ id: fichier.id, statut: (await fetch(String(fichier.url))).status }))
		)

		expect(reponses.filter(({ statut }) => statut !== 200).map(({ id }) => id)).toEqual([107])
		const photo = await fetch(String(lignes.files.find(fichier => fichier.id === 101)?.url))
		expect(photo.headers.get('content-type')).toBe('image/png')
		expect(
			Buffer.from(await photo.arrayBuffer())
				.subarray(1, 4)
				.toString()
		).toBe('PNG')
	})
})

describe('Critère 3 : la source s’ouvre par un rôle en lecture seule, et une écriture échoue', () => {
	test('le rôle lit chaque table', async () => {
		await createSourceStrapi()
		const sql = lecture()
		for (const table of TABLE_NAMES) {
			const [ligne] = await sql.unsafe(`SELECT count(*)::int AS n FROM "${table}"`)
			expect({ table, lu: (ligne?.n ?? 0) > 0 }).toEqual({ table, lu: true })
		}
	})

	test('chaque forme d’écriture est refusée par PostgreSQL, et la source n’a pas changé', async () => {
		await createSourceStrapi()
		const avant = await sourceFingerprint()
		const sql = lecture()
		const essais = {
			insertion: "INSERT INTO up_users (id, username, provider) VALUES (99, 'intrus', 'local')",
			modification: "UPDATE makeup_artistes SET city = 'Paris'",
			suppression: 'DELETE FROM files',
			vidage: 'TRUNCATE talents',
			creation: 'CREATE TABLE intrus (id integer)',
			'table temporaire': 'CREATE TEMP TABLE intrus (id integer)',
			compteur: "SELECT nextval(pg_get_serial_sequence('up_users', 'id'))",
			'changement de rôle': 'SET ROLE banc',
		}
		const refus: Record<string, string> = {}
		for (const [essai, requete] of Object.entries(essais)) refus[essai] = await codeDuRefus(sql.unsafe(requete))

		// 25006: read-only transaction; 42501: no right to do it.
		for (const [essai, code] of Object.entries(refus))
			expect({ essai, code }).toEqual({ essai, code: expect.stringMatching(/^(25006|42501)$/) })

		// Taking the transaction out of read-only mode changes nothing: the role has no right to write.
		await sql.unsafe('SET default_transaction_read_only = off')
		expect(await codeDuRefus(sql.unsafe("UPDATE makeup_artistes SET city = 'Paris'"))).toBe('42501')
		expect(await codeDuRefus(sql.unsafe('CREATE TABLE intrus (id integer)'))).toBe('42501')

		expect((await sourceFingerprint()).empreinte).toBe(avant.empreinte)
	})
})

describe('Le rôle en lecture seule ne crée pas de grand objet, et son verrou se remet à zéro (ticket 227)', () => {
	/** As the owner of the bench, the only one who may write into the source or change the role. */
	async function avecLeProprietaire<T>(adresse: string, travail: (sql: SQL) => Promise<T>): Promise<T> {
		const sql = new SQL({ url: adresse, max: 1 })
		try {
			return await travail(sql)
		} finally {
			await sql.close()
		}
	}

	test('même en levant sa lecture seule, le rôle ne crée aucun grand objet : droit refusé (42501)', async () => {
		await createSourceStrapi()
		const avant = await sourceFingerprint()
		const sql = lecture()
		await sql.unsafe('SET default_transaction_read_only = off')
		const essais = {
			lo_create: 'SELECT lo_create(0)',
			lo_creat: 'SELECT lo_creat(-1)',
			lo_from_bytea: "SELECT lo_from_bytea(0, 'contenu'::bytea)",
		}
		const refus: Record<string, string> = {}
		for (const [essai, requete] of Object.entries(essais)) refus[essai] = await codeDuRefus(sql.unsafe(requete))

		expect(refus).toEqual({ lo_create: '42501', lo_creat: '42501', lo_from_bytea: '42501' })
		const [ligne] = await sql.unsafe('SELECT count(*)::int AS n FROM pg_largeobject_metadata')
		expect(ligne?.n).toBe(0)
		expect((await sourceFingerprint()).empreinte).toBe(avant.empreinte)
	})

	test('l’empreinte compte les grands objets : un objet créé par le propriétaire la change, une nouvelle création la rend', async () => {
		await createSourceStrapi()
		const avant = await sourceFingerprint()
		expect(avant.grandsObjets.nombre).toBe(0)

		await avecLeProprietaire(source.administration, sql => sql.unsafe('SELECT lo_create(0)'))
		const apres = await sourceFingerprint()

		expect(apres.grandsObjets.nombre).toBe(1)
		expect(apres.empreinte).not.toBe(avant.empreinte)
		// The tables did not move: only the large object did.
		expect(apres.tables).toEqual(avant.tables)
		await createSourceStrapi()
		expect((await sourceFingerprint()).empreinte).toBe(avant.empreinte)
	}, 60_000)

	test('l’empreinte de l’import (I43) voit aussi les grands objets, que le rapport compare avant et après', async () => {
		await createSourceStrapi()
		const requete = (texte: string, parametres?: readonly unknown[]) =>
			lecture().unsafe(texte, parametres ? [...parametres] : undefined)
		const avant = await tablesFingerprint(requete as Query)
		expect(avant[LARGE_OBJECTS]?.rows).toBe(0)

		await avecLeProprietaire(source.administration, sql => sql.unsafe('SELECT lo_create(0)'))
		const apres = await tablesFingerprint(requete as Query)

		expect(apres[LARGE_OBJECTS]?.rows).toBe(1)
		expect(sameTables(avant, apres)).toBe(false)
		await createSourceStrapi()
		expect(sameTables(avant, await tablesFingerprint(requete as Query))).toBe(true)
	}, 60_000)

	test('ce que le rôle a réglé lui-même ne survit pas à une nouvelle création de la source', async () => {
		await createSourceStrapi()
		const sql = lecture()
		await sql.unsafe('SET default_transaction_read_only = off')
		// The role can lift its own lock for good, set its parameters, and change its password.
		await sql.unsafe(`ALTER ROLE ${source.role} IN DATABASE ${source.base} SET default_transaction_read_only = off`)
		await sql.unsafe(`ALTER ROLE ${source.role} SET work_mem = '1MB'`)
		await sql.unsafe(`ALTER ROLE ${source.role} SET statement_timeout = '1ms'`)
		await sql.unsafe(`ALTER ROLE ${source.role} PASSWORD 'un-autre-mot-de-passe-factice'`)

		await createSourceStrapi()

		const reglages = await avecLeProprietaire(source.maintenance, sql =>
			sql.unsafe(
				`SELECT d.datname AS base, s.setconfig AS reglages FROM pg_db_role_setting s
				LEFT JOIN pg_database d ON d.oid = s.setdatabase
				WHERE s.setrole = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
				[source.role]
			)
		)
		// Nothing role-wide is left, and the database holds the lock again, and only it.
		expect(reglages.map(({ base }: { base: string | null }) => base)).toEqual([source.base])
		expect(reglages[0]?.reglages).toEqual(['default_transaction_read_only=on'])
		const lignes = await lecture().unsafe('SHOW default_transaction_read_only')
		expect(lignes[0]?.default_transaction_read_only).toBe('on')
	}, 60_000)
})

describe('Critère 4 : trois comptes ont un mot de passe de fixture connu et un hash bcrypt', () => {
	test('les trois hash sont complets, au format de Strapi, et s’ouvrent avec leur mot de passe de fixture', async () => {
		await createSourceStrapi()
		const sql = lecture()
		for (const compte of COMPTES_DE_FIXTURE) {
			const [ligne] = await sql.unsafe('SELECT provider, password FROM up_users WHERE id = $1', [compte.strapiId])
			const hash = String(ligne?.password ?? '')

			expect({ compte: compte.strapiId, complet: HASH_BCRYPT_FULL.test(hash) }).toEqual({
				compte: compte.strapiId,
				complet: true,
			})
			expect(hash.startsWith('$2a$10$')).toBe(true)
			expect(ligne?.provider).toBe(compte.provider)
			expect(await Bun.password.verify(compte.motDePasse, hash)).toBe(true)
			expect(await Bun.password.verify(`${compte.motDePasse}-faux`, hash)).toBe(false)
		}
	})

	test('chacun des neuf hash s’ouvre avec son mot de passe, et aucun mot de passe de fixture n’ouvre un autre compte', async () => {
		await createSourceStrapi()
		const { motsDePasse } = sourceDefinition(source.medias)
		const lignes = (await lecture().unsafe(
			'SELECT id, password FROM up_users WHERE password IS NOT NULL ORDER BY id'
		)) as { id: number; password: string }[]

		expect(lignes.map(ligne => ligne.id)).toEqual([...motsDePasse.keys()].sort((a, b) => a - b))
		expect(new Set(lignes.map(ligne => ligne.password)).size).toBe(lignes.length)
		for (const { id, password } of lignes) {
			expect(await Bun.password.verify(motsDePasse.get(id) ?? '', password)).toBe(true)
			for (const fixture of COMPTES_DE_FIXTURE)
				if (fixture.strapiId !== id) expect(await Bun.password.verify(fixture.motDePasse, password)).toBe(false)
		}
	}, 30_000)

	test('les hash ne valent que pour la source : une nouvelle création réécrit les mêmes', async () => {
		await createSourceStrapi()
		const lire = async () =>
			((await lecture().unsafe('SELECT id, password FROM up_users ORDER BY id')) as { password: string | null }[]).map(
				ligne => ligne.password
			)
		const premiers = await lire()
		await createSourceStrapi()

		expect(await lire()).toEqual(premiers)
	})
})
