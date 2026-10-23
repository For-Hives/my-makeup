/**
 * The home page (issue 1013): a short guided form with visible labels that leads to the search with the
 * parameters of before, three recently updated makeup artists, and the marketing texts folded into a section
 * that stays in the HTML. Made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuidedSearch } from '@/components/home/GuidedSearch'
import { RecentProfiles } from '@/components/home/RecentProfiles'
import { PUBLIC_PAGES } from '@/lib/revalidate'
import { EVENT_CHOICES } from '@/lib/search/event-choices'
import { readSearch, searchByWord } from '@/lib/search/input'
import { normalizeTexts } from '@/lib/search/relevance'
import { find } from '@/lib/search/results'
import { RECENT_PROFILES_COUNT, recentCards } from '@/services/public/profile-block'
import type { DirectoryProfile } from '@/services/public/profiles'

const read = (file: string): string => readFileSync(join(import.meta.dir, '../..', file), 'utf8')

function entry(slug: string, over: Partial<DirectoryProfile> = {}): DirectoryProfile {
	return {
		carte: { slug, pid: 1 as never, nom: slug, specialite: null, lieu: 'Annecy', superMaquilleuse: false, photo: null },
		unreachable: false,
		indexable: true,
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

describe('1013 : « Récemment mises à jour »', () => {
	test('trois cartes au plus, les plus récentes d’abord ; ni profil non publiable, ni profil sans contact', () => {
		const directory = [
			entry('ancienne', { updatedAt: 1000 }),
			entry('recente', { updatedAt: 5000 }),
			entry('sans-contact', { updatedAt: 9000, unreachable: true }),
			entry('non-publiable', { updatedAt: 9500, indexable: false }),
			entry('moyenne', { updatedAt: 3000 }),
			entry('autre', { updatedAt: 2000 }),
		]
		expect(RECENT_PROFILES_COUNT).toBe(3)
		expect(recentCards(directory, RECENT_PROFILES_COUNT).map(card => card.slug)).toEqual([
			'recente',
			'moyenne',
			'autre',
		])
	})

	test('à date égale, l’ordre de l’annuaire décide ; un annuaire vide ne donne rien', () => {
		const directory = [entry('un'), entry('deux'), entry('trois'), entry('quatre')]
		expect(recentCards(directory, 3).map(card => card.slug)).toEqual(['un', 'deux', 'trois'])
		expect(recentCards([], 3)).toEqual([])
	})

	test('le bloc porte son titre, trois cartes sans suivi de rang, et rien sans carte', () => {
		const cards = [entry('un'), entry('deux'), entry('trois')].map(profile => profile.carte)
		const html = renderToStaticMarkup(<RecentProfiles cartes={cards} />)
		expect(html).toContain('Récemment mises à jour')
		expect(html.match(/href="\/profil\//g)).toHaveLength(3)
		expect(renderToStaticMarkup(<RecentProfiles cartes={[]} />)).toBe('')
	})
})

describe('1013 : la page d’accueil', () => {
	const page = read('src/app/(front)/(site)/home-cached/[key]/page.tsx')

	test('le h1, le titre, les données structurées et le texte de référencement sont gardés', () => {
		expect(page).toContain('Trouver la maquilleuse qui vous correspond n&apos;a jamais été aussi simple')
		expect(page).toContain("const TITLE = 'Maquilleuse professionnelle près de chez vous'")
		expect(page).toContain('homeStructuredData')
		for (const component of ['Presentation', 'Project', 'Collaboration']) expect(page).toContain(`<${component} />`)
	})

	test('les textes repliés sont dans un <details> : ils restent dans le HTML', () => {
		expect(page).toMatch(/<details[\s\S]*Comment ça marche[\s\S]*<Presentation \/>[\s\S]*<\/details>/)
	})

	test('les profils récents se lisent dans le cache de Next, sous l’étiquette des profils, sans casser la page', () => {
		const cached = read('src/services/public/cached.ts')
		const declaration = cached.slice(cached.indexOf('export const cachedRecentProfiles'))
		expect(declaration.slice(0, declaration.indexOf('\n)\n'))).toContain('tags: [TAGS.profils]')
		expect(page).toContain('cachedRecentProfiles')
		expect(page).toMatch(/catch[\s\S]*return \[\]/)
		expect(page).not.toMatch(/cookies\(|headers\(/)
	})

	test('l’enregistrement d’un profil rafraîchit l’accueil', () => {
		expect(PUBLIC_PAGES.profiles.listes).toContain('/')
	})
})
