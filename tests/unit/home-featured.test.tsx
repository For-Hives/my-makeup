/**
 * The home page after the redesign (issue 1066): « Mise en avant », an editorial selection set by an admin,
 * replaces « Récemment mises à jour »; the block on the right of the head says what the platform does; the
 * texts of « Comment ça marche » stay, without the title and without the fold, as the words of a community.
 * Made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeaturedProfiles } from '@/components/home/FeaturedProfiles'
import { HeroIllustration } from '@/components/home/HeroIllustration'
import { FEATURED_MAX, featureActionOf } from '@/lib/profile/featured'
import { featuredCards } from '@/services/public/profile-block'
import type { DirectoryProfile } from '@/services/public/profiles'

const read = (file: string): string => readFileSync(join(import.meta.dir, '../..', file), 'utf8')

function entry(slug: string, over: Partial<DirectoryProfile> = {}): DirectoryProfile {
	return {
		carte: { slug, pid: 1 as never, nom: slug, specialite: null, lieu: 'Annecy', superMaquilleuse: false, photo: null },
		unreachable: false,
		indexable: true,
		featured: false,
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

describe('1066 : la sélection « Mise en avant »', () => {
	test('aucun profil coché : aucune carte', () => {
		expect(featuredCards([entry('a'), entry('b')], FEATURED_MAX)).toEqual([])
		expect(featuredCards([], FEATURED_MAX)).toEqual([])
	})

	test('jamais plus de six cartes, même avec neuf profils cochés ; l’ordre de l’annuaire décide', () => {
		const directory = Array.from({ length: 9 }, (_, rank) => entry(`p${rank}`, { featured: true }))
		expect(FEATURED_MAX).toBe(6)
		expect(featuredCards(directory, FEATURED_MAX).map(card => card.slug)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
	})

	test('un profil non publiable n’y figure jamais, même coché ; ni un profil sans contact', () => {
		const directory = [
			entry('publiable', { featured: true }),
			entry('non-publiable', { featured: true, indexable: false }),
			entry('sans-contact', { featured: true, unreachable: true }),
			entry('non-coche'),
		]
		expect(featuredCards(directory, FEATURED_MAX).map(card => card.slug)).toEqual(['publiable'])
	})
})

describe('1066 : le journal de la mise en avant', () => {
	test('une action par changement, aucune quand rien ne change', () => {
		expect(featureActionOf({ featured: false }, { featured: true })).toBe('feature')
		expect(featureActionOf(null, { featured: true })).toBe('feature')
		expect(featureActionOf({ featured: true }, { featured: false })).toBe('unfeature')
		expect(featureActionOf({ featured: true }, { featured: true })).toBeNull()
		expect(featureActionOf({ featured: false }, { featured: false })).toBeNull()
		expect(featureActionOf(null, { featured: false })).toBeNull()
		expect(featureActionOf({ featured: true }, {})).toBeNull()
	})
})

describe('1066 : le bloc « Mise en avant »', () => {
	test('un titre, une carte par profil, et rien sans carte', () => {
		const cards = ['un', 'deux', 'trois', 'quatre'].map(slug => entry(slug).carte)
		const html = renderToStaticMarkup(<FeaturedProfiles cartes={cards} />)
		expect(html).toContain('Mise en avant')
		expect(html).not.toContain('Récemment mises à jour')
		expect(html.match(/href="\/profil\//g)).toHaveLength(4)
		expect(renderToStaticMarkup(<FeaturedProfiles cartes={[]} />)).toBe('')
	})
})

describe('1066 : le bloc à droite du haut de page', () => {
	const html = renderToStaticMarkup(<HeroIllustration />)

	test('dit en trois lignes ce que la plateforme fait pour la cliente', () => {
		expect(html).toContain('Cherchez par événement et par lieu')
		expect(html).toContain('Consultez des profils vérifiés')
		expect(html).toContain('Écrivez en direct à la maquilleuse')
	})

	test('une illustration faite de composants : ni photo, ni nom, ni donnée personnelle', () => {
		expect(html).not.toContain('<img')
		expect(html).not.toMatch(/@|\d{2} \d{2} \d{2}/)
		expect(html).toContain('aria-hidden="true"')
	})
})

describe('1066 : la page d’accueil', () => {
	const page = read('src/app/(front)/(site)/home-cached/[key]/page.tsx')

	test('l’accroche, le titre, les données structurées sont gardés au caractère près', () => {
		expect(page).toContain('Trouver la maquilleuse qui vous correspond n&apos;a jamais été aussi simple')
		expect(page).toContain("const TITLE = 'Maquilleuse professionnelle près de chez vous'")
		expect(page).toContain('homeStructuredData')
		expect(page).toContain('<GuidedSearch />')
	})

	test('« Comment ça marche » n’a plus de titre ni de pli ; les trois textes restent', () => {
		expect(page).not.toContain('Comment ça marche')
		expect(page).not.toContain('<details')
		for (const component of ['Presentation', 'Project', 'Collaboration']) expect(page).toContain(`<${component} />`)
		expect(read('src/components/home/Presentation.tsx')).toContain('une communauté')
	})

	test('« Vos projets, nos meilleurs talents » est gardé, « Récemment mises à jour » n’existe plus', () => {
		expect(read('src/components/home/Talents.tsx')).toContain('Vos projets, nos meilleurs talents.')
		expect(page).not.toContain('RecentProfiles')
		expect(page).toContain('FeaturedProfiles')
	})

	test('la sélection se lit dans le cache de Next, sous l’étiquette des profils, sans casser la page', () => {
		const cached = read('src/services/public/cached.ts')
		const declaration = cached.slice(cached.indexOf('export const cachedFeaturedProfiles'))
		expect(declaration.slice(0, declaration.indexOf('\n)\n'))).toContain('tags: [TAGS.profils]')
		expect(page).toContain('cachedFeaturedProfiles')
		expect(page).toMatch(/catch[\s\S]*return \[\]/)
		expect(page).not.toMatch(/cookies\(|headers\(/)
	})
})
