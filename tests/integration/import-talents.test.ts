import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { commandeDImport, FICHIER_DES_DECISIONS_DU_BANC, importerSurLeBanc } from '../outils/import'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 024: the import takes the talents of the old site, twice in a row, and proves its parity
 * (plan 02, I39, I40, I43). It reads the fake Strapi source of the bench, read-only, and writes
 * through the Local API, each talent found by its `strapiId`.
 */

const source = sourceDuBanc()

/** The talents of the source, as written in the fake base: the reference the target is compared with. */
const TALENTS_DE_LA_SOURCE = definitionDeLaSource(source.medias).lignes.talents

/** A timestamp of the fake base (`2023-04-01 09:00:00.000`, UTC) as the old API gives it. */
const enIso = (horodatage: unknown): string | null =>
	horodatage === null ? null : `${String(horodatage).replace(' ', 'T')}Z`

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
	const payload = await payloadDeTest()
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
	await viderLaBase()
	await viderLeCapteur()
	await creerLaSourceStrapi()
})

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Critère 1 : à blanc, les créations sont annoncées et la base cible reste vide', () => {
	test('un passage à blanc annonce les trois talents et n’écrit rien', async () => {
		const rapport = await importerSurLeBanc('a-blanc')

		expect(rapport.mode).toBe('a-blanc')
		expect(rapport.collections.talents).toMatchObject({ source: 3, crees: 3, modifies: 0, inchanges: 0, refuses: [] })
		expect(rapport.parite).toBeNull()
		expect(await talentsDeLaCible()).toEqual([])
		expect(await compterLesMails()).toBe(0)
	})

	test('la commande sans option est un passage à blanc', async () => {
		const { code, sortie } = await commandeDImport(['--decisions', FICHIER_DES_DECISIONS_DU_BANC])

		expect(code).toBe(0)
		expect(sortie).toContain('Import à blanc : rien n’est écrit.')
		expect(sortie).toContain('Talents : 3 à la source ; 3 créations annoncées')
		expect(await talentsDeLaCible()).toEqual([])
	}, 60_000)
})

describe('Critère 2 : passage réel, autant de talents, champs égaux, slug identique (I39, I40)', () => {
	test('chaque talent de la source est dans la cible, champ par champ, publié comme à la source', async () => {
		const rapport = await importerSurLeBanc()

		expect(rapport.collections.talents).toMatchObject({ source: 3, crees: 3, modifies: 0, inchanges: 0, refuses: [] })
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
		expect(rapport.parite?.talents).toMatchObject({ attendus: 3, presents: 3, egaux: 3, differents: [], manquants: [] })
		expect(rapport.parite?.talents?.empreinteCible).toBe(rapport.parite?.talents?.empreinteAttendue ?? '')
		// The import context: nobody is told.
		expect(await compterLesMails()).toBe(0)
	})

	test('le public lit les talents repris à leur adresse d’aujourd’hui', async () => {
		await importerSurLeBanc()

		for (const ligne of TALENTS_DE_LA_SOURCE) {
			const { statut, corps } = await appelerRest(
				'GET',
				`/api/talents?where[slug][equals]=${String(ligne.slug)}&depth=0`
			)
			expect(statut).toBe(200)
			expect((corps as { docs: { title: string }[] }).docs.map(({ title }) => title)).toEqual([String(ligne.title)])
		}
	})

	test('un brouillon de la source reste un brouillon, que le public ne lit pas', async () => {
		await ecrireDansLaSource(
			`INSERT INTO talents (id, title, slug, content, created_at, updated_at, published_at)
			 VALUES (4, 'Maquillage de scène', 'maquillage-scene', 'En cours.', '2024-02-01 10:00:00', '2024-02-02 11:00:00', NULL)`
		)

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.talents).toMatchObject({ source: 4, crees: 4, refuses: [] })
		const brouillon = (await talentsDeLaCible()).find(talent => talent.strapiId === 4)
		expect(brouillon).toMatchObject({ _status: 'draft', slug: 'maquillage-scene', publishedAt: null })
		const { corps } = await appelerRest('GET', '/api/talents?where[slug][equals]=maquillage-scene')
		expect((corps as { totalDocs: number }).totalDocs).toBe(0)
		expect(rapport.parite?.talents).toMatchObject({ attendus: 4, egaux: 4 })
	})

	test('un slug qui n’est pas une adresse, ou que deux talents portent, est refusé et listé, jamais corrigé', async () => {
		await ecrireDansLaSource(
			`INSERT INTO talents (id, title, slug, created_at, updated_at, published_at) VALUES
			 (5, 'Maquillage Mode', 'Maquillage Mode', '2024-02-01 10:00:00', '2024-02-01 10:00:00', '2024-02-01 10:00:00'),
			 (6, 'Mariage, encore', 'maquillage-mariage', '2024-02-01 10:00:00', '2024-02-01 10:00:00', '2024-02-01 10:00:00')`
		)

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.talents?.refuses).toEqual([
			{ strapiId: 5, motif: 'slug-pas-une-adresse', champs: ['slug'] },
			{ strapiId: 6, motif: 'slug-en-double', champs: ['slug'] },
		])
		expect((await talentsDeLaCible()).map(({ strapiId }) => strapiId)).toEqual([1, 2, 3])
		// The talent that keeps the slug is the oldest one, untouched.
		expect((await talentsDeLaCible())[0]?.title).toBe('Maquillage de mariage')
		expect(rapport.parite?.talents).toMatchObject({ attendus: 3, egaux: 3, manquants: [] })
	})
})

describe('Critère 3 : second passage, 0 création, 0 mise à jour, source inchangée (I43)', () => {
	test('relancé sur la même source, l’import n’écrit rien, et la source n’a pas bougé', async () => {
		const avant = await empreinteDeLaSource()
		await importerSurLeBanc()
		const cible = await talentsDeLaCible()

		const second = await importerSurLeBanc()

		expect(second.collections.talents).toMatchObject({ crees: 0, modifies: 0, inchanges: 3, refuses: [] })
		// Not even a date of the target moved.
		expect(await talentsDeLaCible()).toEqual(cible)
		expect((await empreinteDeLaSource()).empreinte).toBe(avant.empreinte)
		expect(second.source.inchangee).toBe(true)
		expect(second.source.apres).toEqual(second.source.avant)
	})

	test('une valeur changée à la source est mise à jour une fois, avec la date de la source, puis plus rien', async () => {
		await importerSurLeBanc()
		await ecrireDansLaSource(
			"UPDATE talents SET title = 'Maquillage de mariée', updated_at = '2026-10-01 08:30:00.250' WHERE id = 1"
		)

		const apresChangement = await importerSurLeBanc()
		const troisieme = await importerSurLeBanc()

		expect(apresChangement.collections.talents).toMatchObject({ crees: 0, modifies: 1, inchanges: 2 })
		expect((await talentsDeLaCible())[0]).toMatchObject({
			title: 'Maquillage de mariée',
			updatedAt: '2026-10-01T08:30:00.250Z',
			createdAt: '2023-04-01T09:00:00.000Z',
		})
		expect(troisieme.collections.talents).toMatchObject({ crees: 0, modifies: 0, inchanges: 3 })
		expect(troisieme.parite?.talents).toMatchObject({ egaux: 3, differents: [] })
	})

	test('un talent que la source ne donne plus reste dans la cible, et il est listé', async () => {
		await importerSurLeBanc()
		await ecrireDansLaSource('DELETE FROM talents WHERE id = 2')

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.talents).toMatchObject({ source: 2, inchanges: 2, enTrop: [2] })
		expect((await talentsDeLaCible()).map(({ strapiId }) => strapiId)).toEqual([1, 2, 3])
		expect(rapport.parite?.talents?.enTrop).toEqual([2])
	})
})

describe('Critère 4 : une cible non locale, sans drapeau, est refusée avant toute écriture', () => {
	test('la commande refuse une base distante et ne touche à rien ; le drapeau est dit dans le message', async () => {
		const { code, sortie } = await commandeDImport(['--reel'], {
			...process.env,
			// A host that does not exist: had the import tried to connect, the message would be another one.
			DATABASE_URI: 'postgres://banc:mot-de-passe-factice@base-distante.example.test:5432/mymakeup_test',
		})

		expect(code).toBe(1)
		expect(sortie).toContain('DATABASE_URI ne désigne pas une base de ce poste')
		expect(sortie).toContain('--cible-distante')
		expect(sortie).not.toContain('base-distante.example.test')
		expect(await talentsDeLaCible()).toEqual([])
	})

	test('sans source nommée, la commande s’arrête aussi avant d’écrire', async () => {
		const { code, sortie } = await commandeDImport(['--reel'], { ...process.env, STRAPI_SOURCE_URI: '' })

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
			const { code, sortie } = await commandeDImport([
				'--reel',
				'--decisions',
				FICHIER_DES_DECISIONS_DU_BANC,
				'--rapport',
				fichier,
			])
			const json = readFileSync(fichier, 'utf8')

			expect(code).toBe(0)
			expect(sortie).toContain('Talents : 3 sur 3 égaux, parité complète')
			expect(JSON.parse(json)).toMatchObject({ mode: 'reel', arret: null, source: { inchangee: true } })
			for (const texte of [sortie, json])
				for (const ligne of TALENTS_DE_LA_SOURCE)
					for (const valeur of [ligne.title, ligne.slug, ligne.description, ligne.content])
						if (typeof valeur === 'string') expect(texte).not.toContain(valeur)
		} finally {
			rmSync(dossier, { recursive: true, force: true })
		}
	}, 60_000)
})
