import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { importer } from '../../scripts/migration/import/importer'
import type { Rapport } from '../../scripts/migration/import/rapport'
import { ouvrirLaSourceBun } from '../../scripts/migration/import/source-bun'
import { ouvrirLaSourcePg } from '../../scripts/migration/import/source-pg'
import { PROFIL_FICTIF } from '../../scripts/preprod/controle'
import type { PreprodEnv } from '../../src/lib/env'
import { demarrerLaPreprod, type IssueDuDemarrage, PreprodRefusee } from '../../src/preprod/tranche'
import { lireLeProfilPublic } from '../../src/services/public/profils'
import { DECISIONS_DU_BANC } from '../outils/import'
import { compterLesDocuments, exigerBanc, payloadDeTest, viderLaBase } from '../outils/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'

/**
 * Ticket 027: the start of the pre-production, on the bench. The task the application runs once
 * Payload has started (src/preprod/tranche.ts) is called here as the pre-production calls it, with
 * the Payload of the bench: on an empty database it poses the fake Strapi source next to the
 * database and imports it, then the page of the fictional profile reads it; a second start writes
 * nothing; a new reset token empties the database once, plays the migrations again and imports
 * again. Anywhere else than on the pre-production, it refuses before reading anything.
 *
 * The source is posed under a name of the bench (`…_test`), not the one of the pre-production.
 */

/** Where the task poses its source on the bench: a database of its own, ending in `_test`. */
const SOURCE = { base: 'strapi_source_preprod_test', role: 'lecture_preprod_test' }

let payload: Payload

/** Starts the pre-production with this environment, and gives what it did and what it logged. */
async function demarrer(preprod: PreprodEnv | undefined): Promise<{ issue: IssueDuDemarrage; journal: string[] }> {
	const journal: string[] = []
	const issue = await demarrerLaPreprod(payload, {
		preprod,
		databaseUri: exigerBanc(),
		journal: ligne => journal.push(ligne),
		source: SOURCE,
	})
	return { issue, journal }
}

/** Whether the database of the source exists on the server of the bench. */
async function sourcePresente(): Promise<boolean> {
	const { rows } = await payload.db.pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [SOURCE.base])
	return rows.length === 1
}

/** The tables, columns, indexes and constraints of the schema of Payload: what the migrations build. */
async function schemaDeLaBase(): Promise<string[]> {
	const { rows: colonnes } = await payload.db.pool.query<{ ligne: string }>(
		`SELECT format('%s.%s %s %s %s', table_name, column_name, udt_name, is_nullable, coalesce(column_default, '')) AS ligne
		 FROM information_schema.columns WHERE table_schema = 'public'`
	)
	const { rows: index } = await payload.db.pool.query<{ ligne: string }>(
		`SELECT format('index %s.%s', tablename, indexname) AS ligne FROM pg_indexes WHERE schemaname = 'public'`
	)
	const { rows: contraintes } = await payload.db.pool.query<{ ligne: string }>(
		`SELECT format('contrainte %s.%s %s', conrelid::regclass, conname, contype) AS ligne
		 FROM pg_constraint WHERE connamespace = 'public'::regnamespace`
	)
	return [...colonnes, ...index, ...contraintes].map(({ ligne }) => ligne).sort()
}

const rapportDe = (issue: IssueDuDemarrage): Rapport => {
	if (issue.etat !== 'importee') throw new Error(`Import attendu, base trouvée « ${issue.etat} ».`)
	return issue.rapport
}

beforeAll(async () => {
	payload = await payloadDeTest()
	await viderLaBase()
})

afterAll(async () => {
	await payload.db.pool.query(`DROP DATABASE IF EXISTS "${SOURCE.base}" WITH (FORCE)`)
	await payload.db.pool.query(`DROP ROLE IF EXISTS "${SOURCE.role}"`)
	await viderLaBase()
})

describe('Hors de la préprod', () => {
	test('la tâche refuse avant de rien lire ni écrire : ni source posée, ni document', async () => {
		const avant = await compterLesDocuments()

		await expect(demarrer(undefined)).rejects.toBeInstanceOf(PreprodRefusee)
		expect(await sourcePresente()).toBe(false)
		expect(await compterLesDocuments()).toEqual(avant)
	})
})

describe('Premier démarrage de la préprod, sur une base vide', () => {
	let premier: Awaited<ReturnType<typeof demarrer>>

	beforeAll(async () => {
		premier = await demarrer({})
	})

	test('la fausse source est posée à côté de la base, puis importée : parité complète, code 0', async () => {
		expect(await sourcePresente()).toBe(true)
		expect(premier.issue).toMatchObject({ etat: 'importee', remise: false, code: 0 })
		const rapport = rapportDe(premier.issue)
		expect(rapport).toMatchObject({ mode: 'reel', cible: 'locale', arret: null })
		expect(rapport.collections.pros).toMatchObject({ source: 17, crees: 14, modifies: 0 })
		expect(rapport.collections.profils).toMatchObject({ source: 27, crees: 13, modifies: 0 })
		expect(rapport.collections.talents).toMatchObject({ source: 3, crees: 3, modifies: 0 })
		expect(rapport.source.inchangee).toBe(true)
	})

	test('le journal de démarrage donne les décomptes de l’import, et rien d’autre : ni email, ni hash', () => {
		const journal = premier.journal.join('\n')

		expect(premier.journal[0]).toBe(
			'Base vide (pros 0, profils 0, talents 0) : la fausse source Strapi est posée, puis importée.'
		)
		expect(journal).toContain('Fausse source Strapi posée à côté de la base : 16 tables,')
		expect(journal).toContain('Comptes : 17 à la source ; 14 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('Profils : 27 à la source ; 13 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(premier.journal.at(-1)).toBe('Import de démarrage fini, code 0 : fini, parité complète.')
		expect(journal).not.toMatch(/@|\$2[aby]\$|06 39 98|zoe|Zoé/i)
	})

	test('la page du profil fictif le lit, son nom en titre, comme une visiteuse', async () => {
		const profil = await lireLeProfilPublic(payload, PROFIL_FICTIF.slug)

		expect(profil?.nom).toBe(PROFIL_FICTIF.nom)
	})

	test('un second démarrage ne pose ni n’importe rien : la base est déjà remplie', async () => {
		const avant = await compterLesDocuments()
		const second = await demarrer({})

		expect(second.issue).toEqual({
			etat: 'deja-remplie',
			remise: false,
			documents: { pros: 14, profils: 13, talents: 3 },
		})
		expect(second.journal).toEqual(['Base déjà remplie (pros 14, profils 13, talents 3) : pas d’import au démarrage.'])
		expect(await compterLesDocuments()).toEqual(avant)
	})
})

describe('Remise à zéro gardée', () => {
	test('un jeton nouveau vide la base une fois, rejoue les migrations, pose la source et réimporte ; le même jeton ne vide plus rien', async () => {
		const schemaAvant = await schemaDeLaBase()
		// Something the import did not write: the reset empties the whole database, not only what it imported.
		const admin = await payload.create({
			collection: 'admins',
			data: { email: 'admin-preprod@example.test', password: 'mot-de-passe-factice-027', role: 'admin' },
			overrideAccess: true,
		})

		const remise = await demarrer({ remiseAZero: 'essai-027-a' })

		expect(remise.issue).toMatchObject({ etat: 'importee', remise: true, code: 0 })
		expect(rapportDe(remise.issue).collections.profils).toMatchObject({ crees: 13, modifies: 0 })
		expect(remise.journal.slice(0, 2)).toEqual([
			'Remise à zéro « essai-027-a » : la base et la fausse source Strapi sont effacées.',
			expect.stringMatching(/^Remise à zéro « essai-027-a » faite : \d+ migrations rejouées sur une base vide\.$/),
		])
		expect(
			await payload.count({ collection: 'admins', where: { id: { equals: admin.id } }, overrideAccess: true })
		).toEqual({ totalDocs: 0 })
		// The migrations rebuild the schema the code describes: the same tables, columns, indexes and constraints.
		expect(await schemaDeLaBase()).toEqual(schemaAvant)
		expect((await lireLeProfilPublic(payload, PROFIL_FICTIF.slug))?.nom).toBe(PROFIL_FICTIF.nom)

		const encore = await demarrer({ remiseAZero: 'essai-027-a' })
		expect(encore.issue).toMatchObject({ etat: 'deja-remplie', remise: false })
		expect(encore.journal[0]).toBe('Remise à zéro « essai-027-a » déjà faite : rien n’est effacé.')
	})
})

describe('Le lecteur de la source sous Node', () => {
	test('pg lit la fausse source du banc comme bun : même rapport, mêmes empreintes', async () => {
		await creerLaSourceStrapi()
		const pg = payload.db.pg
		if (!pg) throw new Error('L’adaptateur de Payload ne donne pas son client PostgreSQL.')
		const lire = async (source: ReturnType<typeof ouvrirLaSourceBun>): Promise<Rapport> => {
			try {
				return await importer({ payload, source, mode: 'a-blanc', cible: 'locale', decisions: DECISIONS_DU_BANC })
			} finally {
				await source.fermer()
			}
		}
		try {
			const parBun = await lire(ouvrirLaSourceBun(sourceDuBanc().lecture))
			const parPg = await lire(ouvrirLaSourcePg(sourceDuBanc().lecture, pg))

			expect(parPg).toEqual(parBun)
			expect(Object.keys(parPg.source.avant)).toHaveLength(8)
		} finally {
			await effacerLaSourceStrapi()
		}
	})
})
