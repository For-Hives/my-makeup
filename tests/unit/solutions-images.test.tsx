import { describe, expect, test } from 'bun:test'
import { existsSync, statSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import PageMaquilleuses from '../../src/app/(front)/(site)/solutions/pour-les-maquilleuses/page'
import PageParticuliers from '../../src/app/(front)/(site)/solutions/pour-les-particuliers/page'
import { SolutionPicture, solutionImage } from '../../src/components/art/solution-image'
import { PageArticle } from '../../src/components/static-pages/PageArticle'

/**
 * The generated illustrations of the two Solutions pages (issue 1136, docs/illustrations-solutions.md): their files, their
 * places, their fallback. The words of the pages are held by content-pages-design.test.tsx.
 */
const ARCHES = ['particuliers-head', 'artistes-head']
const WIDE = [
	'particuliers-search',
	'particuliers-compare',
	'particuliers-contact',
	'particuliers-profils',
	'artistes-clients',
	'artistes-vitrine',
	'artistes-agenda',
]

const images = (markup: string) => [...markup.matchAll(/<img[^>]*>/g)].map(([tag]) => tag)
const fromSolutions = (tag: string) => tag.includes('assets%2Fsolutions%2F')

describe('les fichiers', () => {
	for (const name of [...ARCHES, ...WIDE])
		test(`${name}.webp est là, léger (15 à 50 Ko)`, () => {
			const file = `public/assets/solutions/${name}.webp`
			expect(existsSync(file)).toBe(true)
			const kilobytes = statSync(file).size / 1024
			expect(kilobytes).toBeGreaterThan(15)
			expect(kilobytes).toBeLessThan(50)
		})
})

describe('les pages', () => {
	test('pour les particuliers : l’arche de la tête (prioritaire) et quatre images larges, toutes décoratives', () => {
		const pictures = images(renderToStaticMarkup(<PageParticuliers />)).filter(fromSolutions)
		expect(pictures).toHaveLength(5)
		expect(pictures.every(tag => /alt=""/.test(tag))).toBe(true)
		expect(pictures.filter(tag => /fetchPriority="high"|fetchpriority="high"/.test(tag))).toHaveLength(1)
		expect(pictures.filter(tag => /width="1200"/.test(tag) && /height="800"/.test(tag))).toHaveLength(4)
	})

	test('pour les maquilleuses : l’arche de la tête (prioritaire) et trois images larges, toutes décoratives', () => {
		const pictures = images(renderToStaticMarkup(<PageMaquilleuses />)).filter(fromSolutions)
		expect(pictures).toHaveLength(4)
		expect(pictures.every(tag => /alt=""/.test(tag))).toBe(true)
		expect(pictures.filter(tag => /fetchPriority="high"|fetchpriority="high"/.test(tag))).toHaveLength(1)
		expect(pictures.filter(tag => /width="1200"/.test(tag) && /height="800"/.test(tag))).toHaveLength(3)
	})
})

describe('le repli', () => {
	test('un fichier absent donne null, et la page garde l’ancienne illustration ou n’en montre pas', () => {
		expect(solutionImage('inexistante')).toBeNull()
		const markup = renderToStaticMarkup(
			<PageArticle
				eyebrow="Solutions"
				contenu={{ titre: 'T', introduction: 'I', parties: [{ titre: 'A', texte: 'a' }] }}
				images={[solutionImage('inexistante')]}
			/>
		)
		expect(markup).not.toContain('<img')
		expect(markup).toContain('a</p>')
	})

	test('une image donnée est rendue sans texte de remplacement', () => {
		expect(renderToStaticMarkup(<SolutionPicture src="/assets/solutions/artistes-agenda.webp" />)).toMatch(/alt=""/)
	})
})
