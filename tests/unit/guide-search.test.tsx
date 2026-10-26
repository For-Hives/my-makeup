import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuideSearch } from '../../src/components/search/GuideSearch'

/** Issue 1138: the search under the head of the guides and of « Pourquoi particulier » is one line on a large screen. */
const html = renderToStaticMarkup(<GuideSearch />)

describe('la recherche des guides', () => {
	test('un formulaire GET vers /search, avec les deux paramètres du site et la marque de mesure', () => {
		expect(html).toContain('action="/search"')
		expect(html).toContain('method="get"')
		expect(html).toContain('role="search"')
		expect(html).toContain('name="search"')
		expect(html).toContain('name="city"')
		// The mark of the measure (an empty hidden span, as in the bar of the search page).
		expect(html).toContain('<span hidden=""></span>')
	})

	test('chaque champ a son libellé, et les mots du bouton sont ceux du site', () => {
		expect(html).toMatch(/<label for="guide-prestation" class="sr-only">Prestation recherchée<\/label>/)
		expect(html).toMatch(/<label for="guide-ville" class="sr-only">Ville de la prestation<\/label>/)
		expect(html).toContain('>Trouver une maquilleuse</button>')
	})

	test('une seule ligne dès 768 px (trois colonnes), l’un sous l’autre en dessous', () => {
		expect(html).toContain('md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]')
		expect(html).not.toContain('md:flex-wrap')
		expect(html).not.toContain('flex-col')
	})

	test('champs en pilule de 52 px, bouton en pilule, anneau de focus', () => {
		expect(html.match(/min-h-13/g)?.length).toBeGreaterThanOrEqual(2)
		expect(html.match(/rounded-full/g)?.length).toBeGreaterThanOrEqual(3)
		expect(html).toContain('focus-visible:outline-indigo-700')
	})

	test('les deux pages la prennent, et le haut de l’accueil garde son propre bloc', () => {
		for (const file of [
			'src/components/static-pages/ClientGuide.tsx',
			'src/app/(front)/(site)/pourquoi-utiliser-my-makeup-en-tant-que-particulier/page.tsx',
		]) {
			const source = readFileSync(file, 'utf8')
			expect(source).toContain('<GuideSearch')
			expect(source).not.toContain('SearchBlock')
		}
		expect(readFileSync('src/components/blocks/Hero.tsx', 'utf8')).toContain('<SearchBlock')
	})
})
