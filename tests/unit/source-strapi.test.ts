import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { benchEnvironment, RefusedBench, ROOT } from '../support/bench'
import { RefusedEnvironment } from '../support/environment-guard'
import { benchSource } from '../support/source-strapi'
import { requireRevocation } from '../support/source-strapi/creation'
import {
	FIXTURE_ACCOUNTS,
	type Line,
	MISSING_ENTRY,
	PROFILES_WITHOUT_OWNER,
	sourceDefinition,
	TYPE_PROFILE,
} from '../support/source-strapi/data'
import { crc32, pngPlain } from '../support/source-strapi/images'
import {
	CASE,
	HASH_BCRYPT_FULL,
	type InventoryLine,
	inventory,
	inventoryInMarkdown,
	type SourceState,
} from '../support/source-strapi/inventory'
import { TABLE_NAMES, TABLES, type TableName, tableCreation } from '../support/source-strapi/schema'

/** The bench of the default instance, as .env.test describes it. */
const BANC = { ...benchEnvironment({ nom: 'my-makeup-test', decalage: 0 }) }
const MEDIAS = 'http://127.0.0.1:9090/mymakeup-test'
const definition = sourceDefinition(MEDIAS)
const { lignes } = definition

const idsDe = (table: TableName): number[] => lignes[table].map(ligne => Number(ligne.id))
const nombre = (valeur: unknown): number => Number(valeur)

/**
 * The state the inventory reads, built from the definition alone: no database, no storage. A
 * stand-in of the shape of a bcrypt hash takes the place of each hash PostgreSQL will write; it
 * lives in memory only.
 */
function etatDeLaDefinition(): SourceState {
	const enTenantLieu = `$2a$10$${'.'.repeat(53)}`
	return {
		lignes: {
			...lignes,
			up_users: lignes.up_users.map(compte => ({
				...compte,
				password: definition.motsDePasse.has(nombre(compte.id)) ? enTenantLieu : null,
			})),
		},
		objets: new Set(definition.objets.map(objet => objet.cle)),
		medias: MEDIAS,
	}
}

/** The inventory table of docs/tests/source-strapi.md, row by row. */
function tableauDuDocument(): InventoryLine[] {
	const document = readFileSync(path.join(ROOT, 'docs/tests/source-strapi.md'), 'utf8')
	const debut = document.indexOf('| Groupe | Cas | Base réelle, 13/10/2026 | Fausse base |')
	expect(debut).toBeGreaterThan(-1)
	const lignesDuTableau = document.slice(debut).split('\n')
	const fin = lignesDuTableau.findIndex(ligne => !ligne.startsWith('|'))
	return lignesDuTableau
		.slice(2, fin)
		.map(ligne => ligne.split('|').map(cellule => cellule.trim()))
		.map(([, groupe = '', cas = '', reel = '', fausse = '']) => ({ groupe, cas, reel, nombre: Number(fausse) }))
}

describe('La fausse base Strapi : ses tables', () => {
	test('seize tables, aux colonnes de la vraie base, et rien de ce que l’import n’ouvre jamais', () => {
		expect(TABLE_NAMES).toHaveLength(16)
		expect(TABLES.up_users.map(colonne => colonne.nom)).toEqual([
			'id',
			'username',
			'email',
			'provider',
			'password',
			'reset_password_token',
			'confirmation_token',
			'confirmed',
			'blocked',
			'created_at',
			'updated_at',
			'created_by_id',
			'updated_by_id',
		])
		expect(TABLES.files).toHaveLength(21)
		expect(TABLES.makeup_artistes).toHaveLength(16)
		for (const interdite of ['admin_users', 'up_roles', 'strapi_core_store_settings', 'upload_folders'])
			expect(TABLE_NAMES as readonly string[]).not.toContain(interdite)
	})

	test('une table vient après celles que ses clés étrangères désignent', () => {
		for (const [rang, table] of TABLE_NAMES.entries())
			for (const colonne of TABLES[table])
				if (colonne.reference) expect(TABLE_NAMES.indexOf(colonne.reference)).toBeLessThan(rang)
	})

	test('le CREATE TABLE cite chaque nom entre guillemets, « order » compris, et les liens de Strapi', () => {
		const ddl = tableCreation('makeup_artistes_components')

		expect(ddl).toContain('"order" double precision')
		expect(ddl).toContain('"entity_id" integer REFERENCES "makeup_artistes" (id) ON DELETE CASCADE')
		expect(ddl).toStartWith('CREATE TABLE "makeup_artistes_components" (\n\t"id" serial PRIMARY KEY')
	})
})

describe('La fausse base Strapi : ses données', () => {
	test('deux définitions sont identiques, à l’octet près', () => {
		const autre = sourceDefinition(MEDIAS)

		expect(JSON.stringify(autre.lignes)).toBe(JSON.stringify(lignes))
		expect([...autre.motsDePasse]).toEqual([...definition.motsDePasse])
		expect(autre.objets.map(objet => [objet.cle, objet.type, Buffer.from(objet.octets).toString('hex')])).toEqual(
			definition.objets.map(objet => [objet.cle, objet.type, Buffer.from(objet.octets).toString('hex')])
		)
	})

	test('chaque ligne n’a que des colonnes de sa table, et chaque identifiant est unique', () => {
		for (const table of TABLE_NAMES) {
			const colonnes = TABLES[table].map(colonne => colonne.nom)
			for (const ligne of lignes[table]) for (const nom of Object.keys(ligne)) expect(colonnes).toContain(nom)
			expect(new Set(idsDe(table)).size).toBe(lignes[table].length)
		}
	})

	test('aucun hash dans la définition : PostgreSQL l’écrit à la création', () => {
		expect(lignes.up_users.every(compte => compte.password === null)).toBe(true)
		expect(JSON.stringify(lignes)).not.toMatch(/\$2[aby]\$/)
	})

	test('rien de réel : adresses en example.test, téléphones de la fiction, aucun domaine du site', () => {
		const texte = JSON.stringify(lignes)
		const emails = [...texte.matchAll(/[\w.+-]+@[\w.-]+/g)].map(([email]) => email.toLowerCase())

		expect(emails.length).toBeGreaterThan(10)
		for (const email of emails) expect(email).toEndWith('@example.test')
		for (const reseau of lignes.components_makeupartists_networks)
			if (reseau.phone !== null) expect(String(reseau.phone)).toMatch(/^06 39 98 \d\d \d\d$/)
		expect(texte).not.toMatch(/my-makeup\.fr|andy-cinquin|r2\.dev|cloudflarestorage/)
		for (const compte of FIXTURE_ACCOUNTS) expect(texte).not.toContain(compte.motDePasse)
	})

	test('les trois comptes de fixture existent, avec leur fournisseur, leur email et un mot de passe', () => {
		expect(FIXTURE_ACCOUNTS).toHaveLength(3)
		expect(FIXTURE_ACCOUNTS.map(compte => compte.provider).sort()).toEqual(['google', 'local', 'local'])
		for (const fixture of FIXTURE_ACCOUNTS) {
			const compte = lignes.up_users.find(ligne => nombre(ligne.id) === fixture.strapiId)
			expect(compte?.email).toBe(fixture.email)
			expect(compte?.provider).toBe(fixture.provider)
			expect(definition.motsDePasse.get(fixture.strapiId)).toBe(fixture.motDePasse)
			expect(fixture.motDePasse.length).toBeGreaterThanOrEqual(8)
		}
		// The other passwords are not those of a fixture: a fixture opens one account only.
		const autres = [...definition.motsDePasse].filter(([id]) => !FIXTURE_ACCOUNTS.some(f => f.strapiId === id))
		expect(autres).toHaveLength(6)
		for (const [, motDePasse] of autres)
			expect(FIXTURE_ACCOUNTS.map(compte => compte.motDePasse)).not.toContain(motDePasse)
	})

	test('chaque lien désigne une ligne qui existe, sauf les liens de fichier vers l’entrée disparue', () => {
		const profils = new Set(idsDe('makeup_artistes'))
		const comptes = new Set(idsDe('up_users'))
		for (const lien of lignes.makeup_artistes_user_links) {
			expect(profils.has(nombre(lien.makeup_artiste_id))).toBe(true)
			expect(comptes.has(nombre(lien.user_id))).toBe(true)
		}
		const fichiers = new Set(idsDe('files'))
		for (const lien of lignes.files_related_morphs) {
			expect(fichiers.has(nombre(lien.file_id))).toBe(true)
			expect(lien.related_type).toBe(TYPE_PROFILE)
			expect(profils.has(nombre(lien.related_id)) || nombre(lien.related_id) === MISSING_ENTRY).toBe(true)
		}
		expect(profils.has(MISSING_ENTRY)).toBe(false)
		for (const lien of lignes.makeup_artistes_components) expect(profils.has(nombre(lien.entity_id))).toBe(true)
	})

	test('les profils sans compte sont exactement les 13 de la liste du schéma gelé', () => {
		const relies = new Set(lignes.makeup_artistes_user_links.map(lien => nombre(lien.makeup_artiste_id)))
		const sansCompte = idsDe('makeup_artistes').filter(id => !relies.has(id))

		expect(sansCompte.sort((a, b) => a - b)).toEqual([...PROFILES_WITHOUT_OWNER])
		const schema = readFileSync(path.join(ROOT, 'docs/migration/SCHEMA.md'), 'utf8')
		expect(schema).toContain(`Identifiants (\`makeup_artistes.id\`) : ${PROFILES_WITHOUT_OWNER.join(', ')}.`)
	})

	test('l’adresse d’un fichier est celle du stockage, suivie de la clé de son objet, qui finit par hash et extension', () => {
		for (const fichier of lignes.files) {
			const url = String(fichier.url)
			expect(url).toStartWith(`${MEDIAS}/`)
			expect(url).toEndWith(`/${fichier.hash}${fichier.ext}`)
			expect(String(fichier.hash)).toMatch(/_[0-9a-f]{10}$/)
		}
		expect(() => sourceDefinition(`${MEDIAS}/`)).toThrow('sans « / » final')
	})

	test('la taille d’un fichier est celle de son objet, en kilo-octets comme les écrit Strapi', () => {
		const objets = new Map(definition.objets.map(objet => [objet.cle, objet]))
		for (const fichier of lignes.files) {
			const objet = objets.get(String(fichier.url).slice(MEDIAS.length + 1))
			if (objet) expect(fichier.size).toBe(Math.round((objet.octets.length / 1000) * 100) / 100)
		}
	})
})

describe('La fausse base Strapi : son inventaire', () => {
	test('l’inventaire de la définition est le tableau du document, ligne pour ligne', () => {
		const calcule = inventory(etatDeLaDefinition())
		const document = tableauDuDocument()

		expect(document).toEqual(calcule)
		// Printed by `bun run bench:source` in the same form.
		expect(inventoryInMarkdown(calcule).split('\n')).toHaveLength(calcule.length + 2)
	})

	test('chaque cas de l’instantané que nomme le ticket est porté au moins une fois', () => {
		const parCas = new Map(inventory(etatDeLaDefinition()).map(ligne => [ligne.cas, ligne.nombre]))
		for (const cas of [
			'Comptes avec un hash bcrypt complet',
			'Comptes `google`',
			'Comptes `facebook`',
			'Adresses email portées par plusieurs comptes',
			'Profils sans compte, dans la liste des 13 écartés',
			'Ville lue comme une adresse postale',
			'Prix écrits sans nombre lisible (prestations et options)',
			'… dont l’objet manque dans le stockage',
		])
			expect(parCas.get(cas)).toBeGreaterThan(0)
		expect(parCas.get('… dont des comptes de fixture, au mot de passe connu')).toBe(3)
		expect(parCas.get('Profils sans compte, hors de cette liste')).toBe(0)
	})

	test('l’inventaire voit ce qui change : un objet de moins, un compte sans hash', () => {
		const etat = etatDeLaDefinition()
		const parCas = (e: SourceState) => new Map(inventory(e).map(ligne => [ligne.cas, ligne.nombre]))
		const [premiere] = definition.objets
		const sansObjet = { ...etat, objets: new Set([...etat.objets].filter(cle => cle !== premiere?.cle)) }
		const sansHash = {
			...etat,
			lignes: {
				...etat.lignes,
				up_users: etat.lignes.up_users.map((c): Line => (nombre(c.id) === 1 ? { ...c, password: '$2a$10$court' } : c)),
			},
		}

		expect(parCas(sansObjet).get('… dont l’objet manque dans le stockage')).toBe(2)
		expect(parCas(sansHash).get('Comptes avec un hash bcrypt complet')).toBe(8)
		expect(HASH_BCRYPT_FULL.test('$2a$10$court')).toBe(false)
	})

	test('chaque cas a son nombre réel, ou « — », et un nom unique', () => {
		expect(new Set(CASE.map(([, cas]) => cas)).size).toBe(CASE.length)
		for (const [, , reel] of CASE) expect(reel).toMatch(/^(\d+|—)$/)
	})
})

describe('La fausse base Strapi : ses images', () => {
	test('un PNG d’une couleur, lisible : signature, en-tête, sommes de contrôle, pixels', () => {
		const png = pngPlain(3, 2, { rouge: 10, vert: 20, bleu: 30 })
		const vue = new DataView(png.buffer, png.byteOffset, png.byteLength)

		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR')
		expect([vue.getUint32(16), vue.getUint32(20)]).toEqual([3, 2])
		expect(vue.getUint32(29)).toBe(crc32(png.subarray(12, 29)))
		const longueur = vue.getUint32(33)
		const pixels = inflateSync(png.subarray(41, 41 + longueur))
		expect([...pixels]).toEqual([0, 10, 20, 30, 10, 20, 30, 10, 20, 30, 0, 10, 20, 30, 10, 20, 30, 10, 20, 30])
	})

	test('une image de plus de 64 Kio passe en plusieurs blocs, lus par zlib', () => {
		const png = pngPlain(200, 120, { rouge: 1, vert: 2, bleu: 3 })
		const longueur = new DataView(png.buffer, png.byteOffset).getUint32(33)

		expect(inflateSync(png.subarray(41, 41 + longueur))).toHaveLength(120 * (1 + 3 * 200))
		expect(Buffer.from(pngPlain(200, 120, { rouge: 1, vert: 2, bleu: 3 })).equals(Buffer.from(png))).toBe(true)
	})
})

describe('La fausse base Strapi : elle n’existe que sur le banc', () => {
	test('l’environnement du banc donne la source, son rôle et l’adresse de ses photos', () => {
		const source = benchSource(BANC)

		expect(source.base).toBe('strapi_source_test')
		expect(source.role).toBe('lecture_strapi')
		expect(source.medias).toBe(MEDIAS)
		expect(new URL(source.administration).pathname).toBe('/strapi_source_test')
		expect(new URL(source.administration).username).toBe('banc')
	})

	test('sans banc réglé, rien n’est ouvert, et le message dit quoi démarrer', () => {
		expect(() => benchSource({})).toThrow(RefusedBench)
		expect(() => benchSource({})).toThrow('bun run bench:up')
	})

	test('une variable qui n’est pas celle de l’instance est refusée, sans recopier sa valeur', () => {
		const autre = 'postgres://lecture_strapi:mot-de-passe-factice-de-lecture@127.0.0.1:5443/autre_test'
		let message = ''
		try {
			benchSource({ ...BANC, STRAPI_SOURCE_URI: autre })
		} catch (erreur) {
			message = erreur instanceof Error ? erreur.message : ''
		}

		expect(message).toStartWith('STRAPI_SOURCE_URI ne désigne pas le banc de test')
		expect(message).not.toContain('mot-de-passe-factice')
		// The bench of another instance is another bench.
		expect(() => benchSource({ ...BANC, BENCH_INSTANCE: 'voisin', BENCH_OFFSET: '20' })).toThrow(RefusedBench)
	})

	test('même écrite dans .env.test, une source qui serait la base de l’application, ou lue par son propriétaire, est refusée', () => {
		/** What happens if .env.test itself said `uri`: the variables and the instance agree. */
		const siLeBancDisait = (uri: string) => () => {
			const environnement = { ...BANC, STRAPI_SOURCE_URI: uri }
			return benchSource(environnement, environnement)
		}
		const lecture = 'lecture_strapi:mot-de-passe-factice-de-lecture'

		expect(siLeBancDisait(`postgres://${lecture}@127.0.0.1:5443/mymakeup_test`)).toThrow('une base à elle')
		expect(siLeBancDisait('postgres://banc:mot-de-passe-factice@127.0.0.1:5443/strapi_source_test')).toThrow(
			'un rôle à lui'
		)
		expect(siLeBancDisait(`postgres://${lecture}@127.0.0.1:5444/strapi_source_test`)).toThrow('le même serveur')
		expect(siLeBancDisait("postgres://lecture_strapi:mot'de'passe@127.0.0.1:5443/strapi_source_test")).toThrow(
			'mot de passe factice'
		)
		// The guard of the tests comes first: a remote source, or one outside « _test », is never opened.
		expect(siLeBancDisait(`postgres://${lecture}@db.example.test:5443/strapi_source_test`)).toThrow(RefusedEnvironment)
		expect(siLeBancDisait(`postgres://${lecture}@127.0.0.1:5443/strapi_source`)).toThrow(RefusedEnvironment)
	})
})

describe('Le retrait du droit de créer un grand objet est vérifié, pas supposé (ticket 227)', () => {
	test('un droit qui reste au rôle (retrait sans effet, faute de super-utilisateur) fait échouer la création, en français', async () => {
		const questions: unknown[][] = []
		const executer = (_texte: string, parametres: readonly unknown[] = []) => {
			questions.push([...parametres])
			return Promise.resolve([{ permis: parametres[1] === 'pg_catalog.lo_creat(integer)' }])
		}

		const echec = await requireRevocation(executer, 'role_fictif').catch((erreur: unknown) => erreur)

		expect(echec).toBeInstanceOf(Error)
		expect((echec as Error).message).toContain('peut encore créer des grands objets')
		expect((echec as Error).message).toContain('pg_catalog.lo_creat(integer)')
		expect((echec as Error).message).not.toContain('lo_create(oid)')
		expect((echec as Error).message).toContain('super-utilisateur')
		// Every function is asked about, for the role named.
		expect(questions).toHaveLength(5)
		expect(questions.every(([role]) => role === 'role_fictif')).toBe(true)
	})

	test('quand le rôle n’a plus aucun de ces droits, rien ne se passe', async () => {
		await expect(requireRevocation(() => Promise.resolve([{ permis: false }]), 'role_fictif')).resolves.toBeUndefined()
	})
})
