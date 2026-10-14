import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import path from 'node:path'
import type { Payload } from 'payload'
import { importer } from '../../scripts/migration/import/importer'
import type { Rapport } from '../../scripts/migration/import/rapport'
import { ouvrirLaSourceBun } from '../../scripts/migration/import/source-bun'
import { ouvrirLaSourcePg } from '../../scripts/migration/import/source-pg'
import { PROFIL_FICTIF } from '../../scripts/preprod/controle'
import type { PreprodEnv } from '../../src/lib/env'
import { migrations } from '../../src/migrations'
import { BASE_DE_LA_PREPROD, MARQUE_DE_REMISE } from '../../src/preprod/remise'
import { demarrerLaPreprod, type IssueDuDemarrage, PreprodRefusee } from '../../src/preprod/tranche'
import { lireLeProfilPublic } from '../../src/services/public/profils'
import { DECISIONS_DU_BANC, referentielDuBanc } from '../outils/import'
import { compterLesDocuments, exigerBanc, payloadDeTest, viderLaBase } from '../outils/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'

/**
 * Ticket 027: the start of the pre-production, on the bench. The task the application runs once
 * Payload has started (src/preprod/tranche.ts) is called here as the pre-production calls it, with
 * the Payload of the bench: on an empty database it poses the fake Strapi source next to the
 * database and imports it, then the page of the fictional profile reads it; a second start writes
 * nothing. Anywhere else than on the pre-production, or on another database than its own, it
 * refuses before reading anything.
 *
 * The reset runs before Payload plays its migrations (src/preprod/au-demarrage.ts). It is tested
 * on whole starts, each in a child process (tests/fixtures/demarrage-preprod.ts): Payload started
 * on the bench as the pre-production starts it, in production, so that it plays its migrations
 * when it connects, and ends the process when one of them fails.
 *
 * The source is posed under a name of the bench (`…_test`), not the one of the pre-production.
 */

/** Where the task poses its source on the bench: a database of its own, ending in `_test`. */
const SOURCE = { base: 'strapi_source_preprod_test', role: 'lecture_preprod_test' }

let payload: Payload

/** The database of the bench, the one a test names in place of the database of the pre-production. */
const baseDuBanc = (): string => decodeURIComponent(new URL(exigerBanc()).pathname.slice(1))

/**
 * Starts the pre-production with this environment, on the Payload of the bench, and gives what it
 * did and what it logged. `base` is the database it accepts as the one of the pre-production.
 */
async function demarrer(
	preprod: PreprodEnv | undefined,
	base = baseDuBanc()
): Promise<{ issue: IssueDuDemarrage; journal: string[] }> {
	const journal: string[] = []
	const issue = await demarrerLaPreprod(payload, {
		preprod,
		databaseUri: exigerBanc(),
		journal: ligne => journal.push(ligne),
		source: SOURCE,
		base,
	})
	return { issue, journal }
}

const RACINE = path.resolve(import.meta.dir, '../..')

/** The fictional `init` of tests/fixtures/demarrage-preprod.ts: every table, under a name the old base never played. */
const INIT_FICTIVE = '20991231_000000_init_fictive'

interface Demarrage {
	/** The exit code of the process: 1 when Payload ended it on a failed migration. */
	code: number
	/** The lines of the start log, without their prefix. */
	journal: string[]
	/** What the start import did, when it ran. */
	issue: unknown
}

/**
 * One start of the application as the pre-production starts it, in a child process: the reset of
 * this token before the migrations, these migrations, then the start import when asked.
 */
async function demarrerCommeLaPreprod(demande: {
	jeton?: string
	migrations: 'code' | 'init'
	importer?: boolean
	base?: string
}): Promise<Demarrage> {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'tests/fixtures/demarrage-preprod.ts'], {
		cwd: RACINE,
		env: {
			...process.env,
			TEMOIN_PREPROD: JSON.stringify({
				importer: false,
				base: baseDuBanc(),
				...demande,
				source: SOURCE,
			}),
		},
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	// A start takes a few seconds. One that waits for an answer (Payload asks before it migrates a
	// database it pushed in development) is stopped, and the test reads its code, 143.
	const limite = setTimeout(() => enfant.kill(), 45_000)
	const [code, sortie] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	]).finally(() => clearTimeout(limite))
	const journal = sortie
		.split('\n')
		.filter(ligne => ligne.startsWith('[preprod] '))
		.map(ligne => ligne.slice('[preprod] '.length))
	const issue = /^ISSUE (.+)$/m.exec(sortie)?.[1]
	return { code, journal, issue: issue === undefined ? undefined : JSON.parse(issue) }
}

/** The names of the migrations the database says it has played. */
async function migrationsJouees(): Promise<string[]> {
	const { rows } = await payload.db.pool.query<{ name: string }>('SELECT name FROM payload_migrations ORDER BY name')
	return rows.map(({ name }) => name)
}

/** What the schema of the database says of the last reset. */
async function marqueDuSchema(): Promise<string | null> {
	const { rows } = await payload.db.pool.query<{ marque: string | null }>(
		"SELECT obj_description('public'::regnamespace, 'pg_namespace') AS marque"
	)
	return rows[0]?.marque ?? null
}

const nombreDe = async (collection: 'pros' | 'profils' | 'admins'): Promise<number> =>
	(await payload.count({ collection, overrideAccess: true })).totalDocs

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

/** The source lives beside the database of the bench, not in it: the preparation of the bench does not drop it. */
async function effacerLaSourceDeLaPreprod(): Promise<void> {
	await payload.db.pool.query(`DROP DATABASE IF EXISTS "${SOURCE.base}" WITH (FORCE)`)
	await payload.db.pool.query(`DROP ROLE IF EXISTS "${SOURCE.role}"`)
}

beforeAll(async () => {
	payload = await payloadDeTest()
	// A run stopped halfway may have left one.
	await effacerLaSourceDeLaPreprod()
	await viderLaBase()
})

afterAll(async () => {
	await effacerLaSourceDeLaPreprod()
	await viderLaBase()
})

describe('Hors de la préprod', () => {
	test('la tâche refuse avant de rien lire ni écrire : ni source posée, ni document', async () => {
		const avant = await compterLesDocuments()

		await expect(demarrer(undefined)).rejects.toBeInstanceOf(PreprodRefusee)
		expect(await sourcePresente()).toBe(false)
		expect(await compterLesDocuments()).toEqual(avant)
	})

	test('sur une autre base que celle de la préprod, la tâche refuse aussi : ni source posée, ni document', async () => {
		const avant = await compterLesDocuments()

		const essai = demarrer({}, BASE_DE_LA_PREPROD)

		await expect(essai).rejects.toBeInstanceOf(PreprodRefusee)
		await expect(essai).rejects.toThrow(
			`Refusé : la base de DATABASE_URI n’est pas celle de la préprod (${BASE_DE_LA_PREPROD}). Rien n’est lu ni écrit.`
		)
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
		expect(premier.issue).toMatchObject({ etat: 'importee', code: 0 })
		const rapport = rapportDe(premier.issue)
		expect(rapport).toMatchObject({ mode: 'reel', cible: 'locale', arret: null })
		expect(rapport.collections.pros).toMatchObject({ source: 17, crees: 14, modifies: 0 })
		expect(rapport.collections.profils).toMatchObject({ source: 27, crees: 13, modifies: 0 })
		expect(rapport.collections.talents).toMatchObject({ source: 3, crees: 3, modifies: 0 })
		// The pre-production has no storage: no photo of the source is adopted, each one is reported (ticket 058).
		expect(rapport.collections.media).toMatchObject({ source: 13, crees: 0, refuses: [] })
		expect(rapport.collections.media?.fichiers).toMatchObject({ designes: 9, sansStockage: true, introuvables: [] })
		expect(rapport.source.inchangee).toBe(true)
	})

	test('le journal de démarrage donne les décomptes de l’import, et rien d’autre : ni email, ni hash', () => {
		const journal = premier.journal.join('\n')

		expect(premier.journal[0]).toBe(
			'Base vide (pros 0, media 0, profils 0, talents 0) : la fausse source Strapi est posée, puis importée.'
		)
		expect(journal).toContain('Fausse source Strapi posée à côté de la base : 16 tables,')
		expect(journal).toContain('Comptes : 17 à la source ; 14 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('Profils : 27 à la source ; 13 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('Médias : 13 à la source ; 0 création, 0 mise à jour, 0 inchangé, 0 refusé')
		expect(journal).toContain('aucun stockage des photos n’est donné à ce passage : aucun fichier n’est adopté')
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
			documents: { pros: 14, media: 0, profils: 13, talents: 3 },
		})
		expect(second.journal).toEqual([
			'Base déjà remplie (pros 14, media 0, profils 13, talents 3) : pas d’import au démarrage.',
		])
		expect(await compterLesDocuments()).toEqual(avant)
	})
})

describe('Remise à zéro gardée, avant les migrations', () => {
	/** Each start loads Payload in a process of its own, builds its schema, and may import: longer than the 5 s of bun. */
	const DUREE = 120_000

	afterAll(async () => {
		// The bench gets its own migrations back, for the files that follow.
		expect(await demarrerCommeLaPreprod({ jeton: 'essai-027-fin', migrations: 'code' })).toMatchObject({ code: 0 })
	}, DUREE)

	test(
		'un jeton nouveau vide toute la base avant que Payload joue ses migrations, puis l’import la remplit ; le même jeton ne vide plus rien',
		async () => {
			const schemaAvant = await schemaDeLaBase()
			// Something the import did not write: the reset empties the whole database, not only what it imported.
			await payload.create({
				collection: 'admins',
				data: { email: 'admin-preprod@example.test', password: 'mot-de-passe-factice-027', role: 'admin' },
				overrideAccess: true,
			})

			const remise = await demarrerCommeLaPreprod({ jeton: 'essai-027-a', migrations: 'code', importer: true })

			expect(remise.code).toBe(0)
			expect(remise.journal.slice(0, 3)).toEqual([
				'Remise à zéro « essai-027-a » : la base et la fausse source Strapi sont effacées, avant les migrations.',
				`Remise à zéro « essai-027-a » faite : ${migrations.length} migrations rejouées sur une base vide.`,
				'Base vide (pros 0, media 0, profils 0, talents 0) : la fausse source Strapi est posée, puis importée.',
			])
			expect(remise.issue).toMatchObject({ etat: 'importee', code: 0, profils: { crees: 13, modifies: 0 } })
			expect(await nombreDe('admins')).toBe(0)
			// The migrations rebuild the schema the code describes: the same tables, columns, indexes and constraints.
			expect(await schemaDeLaBase()).toEqual(schemaAvant)
			expect(await migrationsJouees()).toEqual(migrations.map(({ name }) => name).sort())
			expect(await marqueDuSchema()).toBe(`${MARQUE_DE_REMISE}essai-027-a`)
			expect((await lireLeProfilPublic(payload, PROFIL_FICTIF.slug))?.nom).toBe(PROFIL_FICTIF.nom)

			const encore = await demarrerCommeLaPreprod({ jeton: 'essai-027-a', migrations: 'code', importer: true })

			expect(encore.code).toBe(0)
			expect(encore.journal).toEqual([
				'Remise à zéro « essai-027-a » déjà faite : rien n’est effacé.',
				'Base déjà remplie (pros 14, media 0, profils 13, talents 3) : pas d’import au démarrage.',
			])
		},
		DUREE
	)

	test(
		'une migration que l’ancienne base ne prend pas (l’init du ticket 049) : sans jeton Payload arrête le processus, avec un jeton nouveau la base est vidée avant et la migration passe',
		async () => {
			const schemaAvant = await schemaDeLaBase()

			// Without a reset, Payload ends the process on the first table that already exists, and nothing is emptied.
			const sansJeton = await demarrerCommeLaPreprod({ migrations: 'init', importer: true })
			expect(sansJeton).toMatchObject({ code: 1, journal: [], issue: undefined })
			expect(await nombreDe('pros')).toBe(14)
			expect(await migrationsJouees()).not.toContain(INIT_FICTIVE)

			const remise = await demarrerCommeLaPreprod({ jeton: 'essai-027-b', migrations: 'init', importer: true })

			expect(remise.code).toBe(0)
			expect(remise.journal.slice(0, 2)).toEqual([
				'Remise à zéro « essai-027-b » : la base et la fausse source Strapi sont effacées, avant les migrations.',
				'Remise à zéro « essai-027-b » faite : 1 migration rejouée sur une base vide.',
			])
			expect(await migrationsJouees()).toEqual([INIT_FICTIVE])
			expect(await schemaDeLaBase()).toEqual(schemaAvant)
			expect(await marqueDuSchema()).toBe(`${MARQUE_DE_REMISE}essai-027-b`)
			expect(remise.issue).toMatchObject({ etat: 'importee', code: 0, profils: { crees: 13 } })
		},
		DUREE
	)

	test(
		'sur une autre base que celle de la préprod, un jeton nouveau n’efface rien, l’import ne pose rien, et le journal le dit',
		async () => {
			const avant = await compterLesDocuments()

			// The start names no database: the one of the pre-production is expected, the bench is found.
			const essai = await demarrerCommeLaPreprod({
				jeton: 'essai-027-c',
				migrations: 'init',
				importer: true,
				base: BASE_DE_LA_PREPROD,
			})

			const refus = `Refusé : la base de DATABASE_URI n’est pas celle de la préprod (${BASE_DE_LA_PREPROD}). Rien n’est lu ni écrit.`
			expect(essai.code).toBe(0)
			expect(essai.journal).toEqual([`Remise à zéro « essai-027-c » non faite, la base est gardée. ${refus}`])
			expect(essai.issue).toEqual({ refus })
			expect(await compterLesDocuments()).toEqual(avant)
			expect(await marqueDuSchema()).toBe(`${MARQUE_DE_REMISE}essai-027-b`)
		},
		DUREE
	)
})

describe('Le lecteur de la source sous Node', () => {
	test('pg lit la fausse source du banc comme bun : même rapport, mêmes empreintes', async () => {
		await creerLaSourceStrapi()
		const pg = payload.db.pg
		if (!pg) throw new Error('L’adaptateur de Payload ne donne pas son client PostgreSQL.')
		const lire = async (source: ReturnType<typeof ouvrirLaSourceBun>): Promise<Rapport> => {
			try {
				return await importer({
					payload,
					source,
					mode: 'a-blanc',
					cible: 'locale',
					decisions: DECISIONS_DU_BANC,
					referentiel: referentielDuBanc(),
					medias: { base: sourceDuBanc().medias },
				})
			} finally {
				await source.fermer()
			}
		}
		try {
			const parBun = await lire(ouvrirLaSourceBun(sourceDuBanc().lecture))
			const parPg = await lire(ouvrirLaSourcePg(sourceDuBanc().lecture, pg))

			expect(parPg).toEqual(parBun)
			expect(Object.keys(parPg.source.avant)).toHaveLength(15)
			expect(parPg.collections.media).toMatchObject({ crees: 8 })
		} finally {
			await effacerLaSourceStrapi()
		}
	})
})
