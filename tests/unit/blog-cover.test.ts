import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BLOG_COVERS, type BlogCover, blogCover, COVER_POOL } from '../../src/components/art/blog-cover'

/** The cover illustrations of the blog (issue 1136): the choice by slug, the fallback and the files themselves. */

const ROOT = join(import.meta.dir, '../..')

const SITE_SLUGS = [
	'essai-maquillage-mariee',
	'quand-reserver-maquilleuse-mariage',
	'prix-maquillage-mariee-2027',
	'fiche-google-maquilleuse',
	'choisir-maquilleuse-professionnelle-evenement',
	'conseils-maquillage-professionnels-debutants',
	'conseils-visibilite-maquilleuse-professionnelle',
	'cout-maquilleuse-professionnelle-guide-tarifs',
	'maximiser-investissement-maquilleuse-professionnelle',
	'tendances-maquillage-professionnel',
]

describe('Le choix de l’illustration', () => {
	test('le même article garde la même illustration, d’un appel à l’autre', () => {
		for (const slug of ['un', 'choisir-sa-maquilleuse', 'zzz', ...SITE_SLUGS])
			expect(blogCover(slug)).toBe(blogCover(slug))
	})

	test('chaque article du site a sa propre illustration, toutes différentes', () => {
		const covers = SITE_SLUGS.map(slug => blogCover(slug)?.src)
		expect(new Set(covers).size).toBe(SITE_SLUGS.length)
		expect(blogCover('essai-maquillage-mariee')).toBe(BLOG_COVERS.makeupTrial)
	})

	test('un article sans illustration à lui en tire une du lot, de façon variée', () => {
		const slugs = Array.from({ length: 40 }, (_, index) => `futur-article-${index}`)
		const used = new Set(slugs.map(slug => blogCover(slug)?.src))
		for (const src of used) expect(COVER_POOL.map(cover => cover.src)).toContain(src as string)
		expect(used.size).toBeGreaterThanOrEqual(6)
	})

	test('sans illustration dans le lot, aucune n’est donnée : la carte retombe sur le panneau dessiné', () => {
		expect(blogCover('essai-maquillage-mariee', [])).toBeNull()
		expect(blogCover('un', [])).toBeNull()
	})

	test('un lot réduit sert tous les articles, un article dédié dont l’image manque tire dans le lot', () => {
		const only: BlogCover = BLOG_COVERS.weddingMorning
		expect(blogCover('essai-maquillage-mariee', [only])).toBe(only)
		expect(blogCover('un', [only])).toBe(only)
	})
})

describe('Les fichiers', () => {
	test('dix illustrations, 1200 x 800 déclarés, chacune un fichier léger du dépôt', () => {
		expect(COVER_POOL).toHaveLength(10)
		for (const cover of COVER_POOL) {
			const file = join(ROOT, 'public', cover.src)
			expect(existsSync(file), cover.src).toBe(true)
			expect(statSync(file).size, cover.src).toBeLessThan(60_000)
			expect(`${cover.width}x${cover.height}`).toBe('1200x800')
			expect(cover.position).toMatch(/^center( \d+%)?$/)
		}
	})

	test('le dossier ne contient que les illustrations du lot : aucun fichier perdu', () => {
		const files = readdirSync(join(ROOT, 'public/assets/blog')).sort()
		expect(files).toEqual(COVER_POOL.map(cover => cover.src.split('/').pop() ?? '').sort())
	})
})
