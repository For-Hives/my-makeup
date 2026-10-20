import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { exitCode } from '../../scripts/migration/import/report'
import { TALENT_PAGE_TITLES } from '../../src/content/talent-titles'
import { BENCH_DECISION_FILE, importCommand, importOnBench } from '../support/import'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { benchSource, createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 024: the import takes the talents of the old site, twice in a row, and proves its parity
 * (plan 02, I39, I40, I43). It reads the fake Strapi source of the bench, read-only, and writes
 * through the Local API, each talent found by its `strapiId`.
 */

const source = benchSource()

/** The talents of the source, as written in the fake base: the reference the target is compared with. */
const TALENTS_DE_LA_SOURCE = sourceDefinition(source.medias).lignes.talents

/** A timestamp of the fake base (`2023-04-01 09:00:00.000`, UTC) as the old API gives it. */
const enIso = (horodatage: unknown): string | null =>
	horodatage === null ? null : `${String(horodatage).replace(' ', 'T')}Z`

/** A connection to the database of the bench itself, the target of the import, as its owner. */
async function avecLaBaseDuBanc<T>(travail: (sql: SQL) => Promise<T>, adresse = source.maintenance): Promise<T> {
	const sql = new SQL({ url: adresse, max: 1 })
	try {
		return await travail(sql)
	} finally {
		await sql.close()
	}
}

/** A write by the owner of the bench, the only one who may write into the source. */
async function ecrireDansLaSource(requete: string): Promise<void> {
	const proprietaire = new SQL({ url: source.administration, max: 1 })
	try {
		await proprietaire.unsafe(requete)
	} finally {
		await proprietaire.close()
	}
}

async function talentsDeLaCible() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'talents',
		depth: 0,
		pagination: false,
		overrideAccess: true,
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

describe('Critère 1 : à blanc, les créations sont annoncées et la base cible reste vide', () => {
	test('un passage à blanc annonce les trois talents et n’écrit rien', async () => {
		const rapport = await importOnBench('dry-run')

		expect(rapport.mode).toBe('dry-run')
		expect(rapport.collections.talents).toMatchObject({ source: 3, created: 3, updated: 0, unchanged: 0, refused: [] })
		expect(rapport.parity).toBeNull()
		expect(await talentsDeLaCible()).toEqual([])
		expect(await countMails()).toBe(0)
	})

	test('la commande sans option est un passage à blanc', async () => {
		const { code, sortie } = await importCommand(['--decisions', BENCH_DECISION_FILE])

		expect(code).toBe(0)
		expect(sortie).toContain('Import à blanc : rien n’est écrit.')
		expect(sortie).toContain('Talents : 3 à la source ; 3 créations annoncées')
		expect(await talentsDeLaCible()).toEqual([])
	}, 60_000)

	test('la commande ne pousse pas le schéma : la marque que laisse le mode développement de Payload ne bouge pas', async () => {
		// The rows the migrations of the bench wrote. A push of the schema would add its own mark, a
		// row `dev` of batch -1, or touch it if it were there.
		const marques = () => avecLaBaseDuBanc(sql => sql.unsafe('SELECT name, batch, updated_at FROM payload_migrations'))
		const avant = await marques()

		const { code } = await importCommand(['--decisions', BENCH_DECISION_FILE])

		expect(code).toBe(0)
		expect(await marques()).toEqual(avant)
	}, 60_000)
})

describe('Critère 2 : passage réel, autant de talents, champs égaux, slug identique (I39, I40)', () => {
	test('chaque talent de la source est dans la cible, champ par champ, publié comme à la source', async () => {
		const rapport = await importOnBench()

		expect(rapport.collections.talents).toMatchObject({ source: 3, created: 3, updated: 0, unchanged: 0, refused: [] })
		const cible = await talentsDeLaCible()
		expect(cible).toHaveLength(TALENTS_DE_LA_SOURCE.length)
		for (const [rang, ligne] of TALENTS_DE_LA_SOURCE.entries()) {
			const talent = cible[rang]
			expect(talent).toMatchObject({
				strapiId: ligne.id,
				title: ligne.title,
				slug: ligne.slug,
				seo_title: ligne.seo_title,
				description: ligne.description,
				seo_description: ligne.seo_description,
				content: ligne.content,
				_status: 'published',
				publishedAt: enIso(ligne.published_at),
				createdAt: enIso(ligne.created_at),
				updatedAt: enIso(ligne.updated_at),
			})
		}
		// Null stays null: the description for the search engines of talent 3.
		expect(cible[2]?.seo_description ?? null).toBeNull()
		expect(rapport.parity?.talents).toMatchObject({ expected: 3, present: 3, equal: 3, different: [], missing: [] })
		expect(rapport.parity?.talents?.targetFingerprint).toBe(rapport.parity?.talents?.expectedFingerprint ?? '')
		// The import context: nobody is told.
		expect(await countMails()).toBe(0)
	})

	test('le public lit les talents repris à leur adresse d’aujourd’hui', async () => {
		await importOnBench()

		for (const ligne of TALENTS_DE_LA_SOURCE) {
			const { statut, corps } = await callRest('GET', `/api/talents?where[slug][equals]=${String(ligne.slug)}&depth=0`)
			expect(statut).toBe(200)
			expect((corps as { docs: { title: string }[] }).docs.map(({ title }) => title)).toEqual([String(ligne.title)])
		}
	})

	test('un brouillon de la source reste un brouillon, que le public ne lit pas', async () => {
		await ecrireDansLaSource(
			`INSERT INTO talents (id, title, slug, content, created_at, updated_at, published_at)
			 VALUES (4, 'Maquillage de scène', 'maquillage-scene', 'En cours.', '2024-02-01 10:00:00', '2024-02-02 11:00:00', NULL)`
		)

		const rapport = await importOnBench()

		expect(rapport.collections.talents).toMatchObject({ source: 4, created: 4, refused: [] })
		const brouillon = (await talentsDeLaCible()).find(talent => talent.strapiId === 4)
		expect(brouillon).toMatchObject({ _status: 'draft', slug: 'maquillage-scene', publishedAt: null })
		const { corps } = await callRest('GET', '/api/talents?where[slug][equals]=maquillage-scene')
		expect((corps as { totalDocs: number }).totalDocs).toBe(0)
		expect(rapport.parity?.talents).toMatchObject({ expected: 4, equal: 4 })
	})

	test('un slug qui n’est pas une adresse, ou que deux talents portent, est refusé et listé, jamais corrigé', async () => {
		await ecrireDansLaSource(
			`INSERT INTO talents (id, title, slug, created_at, updated_at, published_at) VALUES
			 (5, 'Maquillage Mode', 'Maquillage Mode', '2024-02-01 10:00:00', '2024-02-01 10:00:00', '2024-02-01 10:00:00'),
			 (6, 'Mariage, encore', 'maquillage-mariage', '2024-02-01 10:00:00', '2024-02-01 10:00:00', '2024-02-01 10:00:00')`
		)

		const rapport = await importOnBench()

		expect(rapport.collections.talents?.refused).toEqual([
			{ strapiId: 5, reason: 'slug-pas-une-adresse', fields: ['slug'] },
			{ strapiId: 6, reason: 'slug-en-double', fields: ['slug'] },
		])
		expect((await talentsDeLaCible()).map(({ strapiId }) => strapiId)).toEqual([1, 2, 3])
		// The talent that keeps the slug is the oldest one, untouched.
		expect((await talentsDeLaCible())[0]?.title).toBe('Maquillage de mariage')
		// Refused, they count: the parity says it is incomplete by them, and by nothing else.
		expect(rapport.parity?.talents).toMatchObject({ expected: 5, equal: 3, refused: [5, 6], missing: [] })
		expect(exitCode(rapport)).toBe(5)
	})
})

describe('Ticket 108 : le titre d’onglet des pages talent', () => {
	test('le talent des 14 adresses porte son titre après l’import, un titre saisi à la main reste, et le passage suivant n’écrit rien', async () => {
		await importOnBench()
		const payload = await testPayload()
		const parSlug = async (slug: string) => (await talentsDeLaCible()).find(talent => talent.slug === slug)
		expect((await parSlug('maquillage-artistique'))?.pageTitle).toBe(TALENT_PAGE_TITLES['maquillage-artistique'])
		// A talent that is not one of the 14 has none.
		expect((await parSlug('effets-speciaux'))?.pageTitle ?? null).toBeNull()

		// The newsroom rewrites the title; the import keeps it.
		const saisi = 'Un titre de remplacement saisi par la rédaction ici'
		const artistique = await parSlug('maquillage-artistique')
		await payload.update({ collection: 'talents', id: Number(artistique?.id), data: { pageTitle: saisi } })
		const second = await importOnBench()
		// The edit moved the date of the update, which the import puts back; the title is not touched.
		expect(second.collections.talents).toMatchObject({ created: 0, updated: 1, unchanged: 2, refused: [] })
		expect((await parSlug('maquillage-artistique'))?.pageTitle).toBe(saisi)
		const troisieme = await importOnBench()
		expect(troisieme.collections.talents).toMatchObject({ created: 0, updated: 0, unchanged: 3, refused: [] })
		expect((await parSlug('maquillage-artistique'))?.pageTitle).toBe(saisi)
	}, 60_000)
})

describe('Critère 3 : second passage, 0 création, 0 mise à jour, source inchangée (I43)', () => {
	test('relancé sur la même source, l’import n’écrit rien, et la source n’a pas bougé', async () => {
		const avant = await sourceFingerprint()
		await importOnBench()
		const cible = await talentsDeLaCible()

		const second = await importOnBench()

		expect(second.collections.talents).toMatchObject({ created: 0, updated: 0, unchanged: 3, refused: [] })
		// Not even a date of the target moved.
		expect(await talentsDeLaCible()).toEqual(cible)
		expect((await sourceFingerprint()).empreinte).toBe(avant.empreinte)
		expect(second.source.unchanged).toBe(true)
		expect(second.source.after).toEqual(second.source.before)
	})

	test('une valeur changée à la source est mise à jour une fois, avec la date de la source, puis plus rien', async () => {
		await importOnBench()
		await ecrireDansLaSource(
			"UPDATE talents SET title = 'Maquillage de mariée', updated_at = '2026-10-01 08:30:00.250' WHERE id = 1"
		)

		const apresChangement = await importOnBench()
		const troisieme = await importOnBench()

		expect(apresChangement.collections.talents).toMatchObject({ created: 0, updated: 1, unchanged: 2 })
		expect((await talentsDeLaCible())[0]).toMatchObject({
			title: 'Maquillage de mariée',
			updatedAt: '2026-10-01T08:30:00.250Z',
			createdAt: '2023-04-01T09:00:00.000Z',
		})
		expect(troisieme.collections.talents).toMatchObject({ created: 0, updated: 0, unchanged: 3 })
		expect(troisieme.parity?.talents).toMatchObject({ equal: 3, different: [] })
	})

	test('un talent que la source ne donne plus reste dans la cible, et il est listé', async () => {
		await importOnBench()
		await ecrireDansLaSource('DELETE FROM talents WHERE id = 2')

		const rapport = await importOnBench()

		expect(rapport.collections.talents).toMatchObject({ source: 2, unchanged: 2, extra: [2] })
		expect((await talentsDeLaCible()).map(({ strapiId }) => strapiId)).toEqual([1, 2, 3])
		expect(rapport.parity?.talents?.extra).toEqual([2])
	})
})

describe('Critère 4 : une cible non locale, sans drapeau, est refusée avant toute écriture', () => {
	test('la commande refuse une base distante et ne touche à rien ; le drapeau est dit dans le message', async () => {
		const { code, sortie } = await importCommand(['--real'], {
			...process.env,
			// A host that does not exist: had the import tried to connect, the message would be another one.
			DATABASE_URI: 'postgres://banc:mot-de-passe-factice@base-distante.example.test:5432/mymakeup_test',
		})

		expect(code).toBe(1)
		expect(sortie).toContain('DATABASE_URI ne désigne pas une base de ce poste')
		expect(sortie).toContain('--remote-target')
		expect(sortie).not.toContain('base-distante.example.test')
		expect(await talentsDeLaCible()).toEqual([])
	})

	test('L9 (ticket 233) : --remote-target exige --expected-database, et la base doit porter ce nom, avant toute lecture', async () => {
		const base = decodeURIComponent(new URL(source.maintenance).pathname.slice(1))

		const sansNom = await importCommand(['--real', '--remote-target', '--decisions', BENCH_DECISION_FILE])
		expect(sansNom.code, sansNom.sortie).toBe(1)
		expect(sansNom.sortie).toContain('--remote-target exige --expected-database')

		const autreNom = await importCommand([
			'--real',
			'--remote-target',
			'--expected-database',
			'mymakeup_une_autre_base',
			'--decisions',
			BENCH_DECISION_FILE,
		])
		expect(autreNom.code, autreNom.sortie).toBe(1)
		expect(autreNom.sortie).toContain('« mymakeup_une_autre_base »')
		expect(autreNom.sortie).not.toContain(base)
		expect(await talentsDeLaCible()).toEqual([])

		const bonNom = await importCommand([
			'--remote-target',
			'--expected-database',
			base,
			'--decisions',
			BENCH_DECISION_FILE,
		])
		expect(bonNom.code, bonNom.sortie).toBe(0)
		expect(bonNom.sortie).toContain('Import à blanc : rien n’est écrit.')
	}, 90_000)

	test('une base de ce poste sans le schéma de la v3 est refusée, et l’import n’y crée aucune table', async () => {
		const bancDeBase = new URL(source.maintenance)
		const nom = `${bancDeBase.pathname.slice(1).replace(/_test$/, '')}_sans_schema_test`
		const sansSchema = new URL(source.maintenance)
		sansSchema.pathname = `/${nom}`
		await avecLaBaseDuBanc(async sql => {
			await sql.unsafe(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`)
			await sql.unsafe(`CREATE DATABASE ${nom}`)
		})
		try {
			const { code, sortie } = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE], {
				...process.env,
				DATABASE_URI: sansSchema.href,
			})

			expect(code, sortie).toBe(1)
			expect(sortie).toContain('n’a pas le schéma de la v3')
			const tables = await avecLaBaseDuBanc(
				sql => sql.unsafe("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"),
				sansSchema.href
			)
			expect(tables).toEqual([{ n: 0 }])
		} finally {
			await avecLaBaseDuBanc(sql => sql.unsafe(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`))
		}
	}, 60_000)

	test('sans source nommée, la commande s’arrête aussi avant d’écrire', async () => {
		const { code, sortie } = await importCommand(['--real'], { ...process.env, STRAPI_SOURCE_URI: '' })

		expect(code).toBe(1)
		expect(sortie).toContain('STRAPI_SOURCE_URI manque')
		expect(await talentsDeLaCible()).toEqual([])
	})
})

describe('Critère 5 : le rapport, en nombres, identifiants et empreintes seulement', () => {
	test('le rapport affiché et le rapport JSON ne portent aucune valeur de la source', async () => {
		const dossier = mkdtempSync(path.join(tmpdir(), 'rapport-import-'))
		try {
			const fichier = path.join(dossier, 'rapport.json')
			const { code, sortie } = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE, '--report', fichier])
			const json = readFileSync(fichier, 'utf8')

			expect(code).toBe(0)
			expect(sortie).toContain('Talents : 3 sur 3 égaux, parité complète')
			expect(JSON.parse(json)).toMatchObject({ mode: 'real', halt: null, source: { unchanged: true } })
			for (const texte of [sortie, json])
				for (const ligne of TALENTS_DE_LA_SOURCE)
					for (const valeur of [ligne.title, ligne.slug, ligne.description, ligne.content])
						if (typeof valeur === 'string') expect(texte).not.toContain(valeur)
		} finally {
			rmSync(dossier, { recursive: true, force: true })
		}
	}, 60_000)
})
