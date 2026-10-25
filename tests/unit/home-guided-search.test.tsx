/**
 * The home page (issue 1013): a short guided form with visible labels that leads to the search with the
 * parameters of before. The selection and the texts of the page are in tests/unit/home-featured.test.tsx (issue 1066). Made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuidedSearch } from '@/components/home/GuidedSearch'
import { HomeHero } from '@/components/home/HomeHero'
import { PUBLIC_PAGES } from '@/lib/revalidate'
import { EVENT_CHOICES } from '@/lib/search/event-choices'
import { readSearch, searchByWord } from '@/lib/search/input'
import { normalizeTexts } from '@/lib/search/relevance'
import { find } from '@/lib/search/results'
import type { DirectoryProfile } from '@/services/public/profiles'
import { mainTitles } from '../support/url-parity'

const read = (file: string): string => readFileSync(join(import.meta.dir, '../..', file), 'utf8')

function entry(slug: string, over: Partial<DirectoryProfile> = {}): DirectoryProfile {
	return {
		carte: { slug, pid: 1 as never, nom: slug, specialite: null, lieu: 'Annecy', superMaquilleuse: false, photo: null },
		unreachable: false,
		indexable: true,
		verified: false,
		ville: 'Annecy',
		departement: '74',
		seDeplace: false,
		postalCodes: [],
		center: null,
		radiusKm: null,
		farReach: false,
		sortName: slug,
		updatedAt: 0,
		...over,
	}
}

describe('1013 : le formulaire guidé', () => {
	const html = renderToStaticMarkup(<GuidedSearch />)

	test('un formulaire GET vers la recherche, avec les deux paramètres d’avant', () => {
		expect(html).toContain('action="/search"')
		expect(html).toContain('method="get"')
		expect(html).toContain('name="search"')
		expect(html).toContain('name="city"')
	})

	test('les libellés sont visibles, les champs ne sont pas des textes indicatifs coupés', () => {
		expect(html).toContain('Pour quel événement ?')
		expect(html).toContain('Où ?')
		expect(html).not.toContain('sr-only')
		expect(html).not.toContain('Essayez &#x27;Maquilleuse mariée&#x27;')
		expect(html).toContain('Voir les maquilleuses')
	})

	test('la ville est demandée : sans elle, « Autre » ne mènerait qu’à une page vide', () => {
		expect(html).toMatch(/<input[^>]*required[^>]*name="city"/)
	})

	test('le choix « événement » propose Mariage, Soirée, Photo, Autre', () => {
		expect(EVENT_CHOICES.map(choice => choice.label)).toEqual(['Mariage', 'Soirée', 'Photo', 'Autre'])
		for (const label of ['Mariage', 'Soirée', 'Photo', 'Autre']) expect(html).toContain(`>${label}</option>`)
	})

	test('chaque choix mène à une recherche que la page lit : un mot, ou aucun pour « Autre »', () => {
		for (const choice of EVENT_CHOICES) {
			const query = readSearch({ search: choice.search, city: 'Annecy' })
			expect(query.search).toBe(choice.search)
			expect(searchByWord(query)).toBe(choice.search !== '')
		}
		expect(EVENT_CHOICES.at(-1)?.search).toBe('')
	})

	test('chaque mot trouve une maquilleuse qui le porte dans sa spécialité', () => {
		for (const choice of EVENT_CHOICES.filter(item => item.search !== '')) {
			const text = normalizeTexts({
				ville: 'Annecy',
				specialite: `Maquillage ${choice.search}`,
				description: '',
				competences: [],
				descriptionsDesCompetences: [],
				descriptionsDesPrestations: [],
				nom: '',
				prenom: '',
			})
			const found = find([entry('a', { textes: text }), entry('b')], { search: choice.search, city: '' })
			expect(found.locaux.map(profile => profile.carte.slug)).toEqual(['a'])
		}
	})

	test('la mesure de la recherche reste celle du formulaire d’avant', () => {
		expect(read('src/components/home/GuidedSearch.tsx')).toContain('SubmissionTracking')
	})
})

describe('1013 : la page d’accueil', () => {
	const page = read('src/app/(front)/(site)/home-cached/[key]/page.tsx')

	test('le h1, le titre, les données structurées et le texte de référencement sont gardés', () => {
		// The h1 is drawn by the hero « en arche » in lines with pictures: its rendered text is read, not the source.
		expect(page).toContain('<HomeHero />')
		expect(mainTitles(renderToStaticMarkup(<HomeHero />))).toEqual([
			"Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple",
		])
		expect(page).toContain("const TITLE = 'Maquilleuse professionnelle près de chez vous'")
		expect(page).toContain('homeStructuredData')
	})

	test('l’enregistrement d’un profil rafraîchit l’accueil', () => {
		expect(PUBLIC_PAGES.profiles.listes).toContain('/')
	})
})
