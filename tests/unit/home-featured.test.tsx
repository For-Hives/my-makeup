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
import { ModerationEvents } from '@/collections/ModerationEvents'
import { Profiles } from '@/collections/Profiles'
import { FeaturedProfiles } from '@/components/home/FeaturedProfiles'
import { HomeHero } from '@/components/home/HomeHero'
import { SectionHead } from '@/components/home/SectionHead'
import {
	FEATURED_CANDIDATES_MAX,
	FEATURED_MAX,
	featuredDrawScript,
	LEGACY_FEATURE_ACTIONS,
	sampleCandidates,
} from '@/lib/profile/featured'
import { ACTION_LABELS } from '@/lib/profile/moderation'
import { verifyActionOf } from '@/lib/profile/verified'
import { featuredCandidates } from '@/services/public/featured'
import type { DirectoryProfile } from '@/services/public/profiles'
import { mainTitles } from '../support/url-parity'

const read = (file: string): string => readFileSync(join(import.meta.dir, '../..', file), 'utf8')

function entry(slug: string, over: Partial<DirectoryProfile> = {}): DirectoryProfile {
	return {
		carte: { slug, pid: 1 as never, nom: slug, specialite: null, lieu: 'Annecy', superMaquilleuse: false, photo: null },
		unreachable: false,
		publishable: true,
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

describe('1066 : les candidats de « Mise en avant » sont les profils vérifiés', () => {
	test('aucun profil vérifié : aucune carte', () => {
		expect(featuredCandidates([entry('a'), entry('b')], FEATURED_CANDIDATES_MAX)).toEqual([])
		expect(featuredCandidates([], FEATURED_CANDIDATES_MAX)).toEqual([])
	})

	test('seuls les profils vérifiés comptent, dans l’ordre de l’annuaire', () => {
		const directory = [entry('a', { verified: true }), entry('b'), entry('c', { verified: true })]
		expect(featuredCandidates(directory, FEATURED_CANDIDATES_MAX).map(card => card.slug)).toEqual(['a', 'c'])
	})

	test('un profil non publiable n’y figure jamais, même vérifié ; ni un profil sans contact', () => {
		const directory = [
			entry('publiable', { verified: true }),
			entry('non-publiable', { verified: true, publishable: false }),
			entry('sans-contact', { verified: true, unreachable: true }),
			entry('non-verifie'),
		]
		expect(featuredCandidates(directory, FEATURED_CANDIDATES_MAX).map(card => card.slug)).toEqual(['publiable'])
	})

	test('au-delà du plafond, un échantillon tiré au hasard, remis dans l’ordre de l’annuaire', () => {
		const directory = Array.from({ length: 40 }, (_, rank) =>
			entry(`p${String(rank).padStart(2, '0')}`, { verified: true })
		)
		expect(FEATURED_MAX).toBe(6)
		expect(FEATURED_CANDIDATES_MAX).toBe(24)
		const slugs = (random: () => number) =>
			featuredCandidates(directory, FEATURED_CANDIDATES_MAX, random).map(c => c.slug)
		const first = slugs(() => 0.1)
		const second = slugs(() => 0.9)
		for (const sample of [first, second]) {
			expect(sample).toHaveLength(FEATURED_CANDIDATES_MAX)
			expect(new Set(sample).size).toBe(FEATURED_CANDIDATES_MAX)
			expect([...sample].sort()).toEqual(sample)
		}
		expect(first).not.toEqual(second)
		// Under the ceiling nothing is dropped: all the verified profiles are candidates, in order.
		expect(featuredCandidates(directory.slice(0, 10), FEATURED_CANDIDATES_MAX, () => 0.5)).toHaveLength(10)
	})

	test('l’échantillon donne à chaque profil la même chance', () => {
		const items = Array.from({ length: 40 }, (_, index) => index)
		const counts = new Array<number>(40).fill(0)
		let seed = 12345
		const random = () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296
			return seed / 4294967296
		}
		for (let run = 0; run < 4000; run += 1)
			for (const item of sampleCandidates(items, 24, random)) counts[item] = (counts[item] ?? 0) + 1
		// Each is expected in 60 % of 4000 draws, that is 2400.
		for (const count of counts) expect(Math.abs(count - 2400)).toBeLessThan(200)
	})
})

describe('1066 : le tirage au hasard dans le navigateur', () => {
	/** Runs the inline script against a stub of the page, with a chosen source of randomness. */
	function drawn(count: number, random: () => number): string {
		let css = ''
		const document = {
			createElement: () => ({
				set textContent(value: string) {
					css = value
				},
			}),
			head: { appendChild: () => {} },
		}
		new Function('document', 'Math', featuredDrawScript(count, FEATURED_MAX))(document, { floor: Math.floor, random })
		return css
	}
	const shown = (css: string): number[] =>
		[...css.matchAll(/nth-child\((\d+)\)\{display:block!important\}/g)].map(match => Number(match[1]))

	test('six rangs tirés parmi les candidats, tous les autres cachés', () => {
		const css = drawn(20, () => 0.37)
		expect(css.startsWith('.featured-list>li{display:none!important}')).toBe(true)
		const rows = shown(css)
		expect(rows).toHaveLength(FEATURED_MAX)
		expect(new Set(rows).size).toBe(FEATURED_MAX)
		for (const row of rows) {
			expect(row).toBeGreaterThanOrEqual(1)
			expect(row).toBeLessThanOrEqual(20)
		}
	})

	test('chaque rechargement peut donner un autre tirage, sans jamais sortir de la liste', () => {
		const first = shown(drawn(20, () => 0.01))
		const second = shown(drawn(20, () => 0.99))
		expect(first).not.toEqual(second)
		let seed = 7
		const random = () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296
			return seed / 4294967296
		}
		const seen = new Set<number>()
		for (let run = 0; run < 300; run += 1) for (const row of shown(drawn(9, random))) seen.add(row)
		expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
	})

	test('issue 1170 : une super maquilleuse pèse double dans le tirage, sans jamais être seule', () => {
		let seed = 99
		const random = () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296
			return seed / 4294967296
		}
		const drawnWith = (boosted: number): number[] => {
			let css = ''
			const document = {
				createElement: () => ({
					set textContent(value: string) {
						css = value
					},
				}),
				head: { appendChild: () => {} },
			}
			new Function('document', 'Math', featuredDrawScript(12, FEATURED_MAX, boosted))(document, {
				floor: Math.floor,
				random,
			})
			return shown(css)
		}
		const counts = new Array<number>(13).fill(0)
		const others = new Set<number>()
		for (let run = 0; run < 3000; run += 1)
			for (const row of drawnWith(2)) {
				counts[row] = (counts[row] ?? 0) + 1
				if (row > 2) others.add(row)
			}
		// Rows 1 and 2 are the boosted ones: clearly more often than a plain row, and the others still come out.
		expect((counts[1] ?? 0) / (counts[3] ?? 1)).toBeGreaterThan(1.3)
		expect(others.size).toBe(10)
		for (const run of [0.01, 0.5, 0.99]) expect(new Set(drawnWith(2).concat([run])).size).toBeGreaterThan(5)
	})

	test('le script est court et ne lit aucune donnée d’un profil', () => {
		const script = featuredDrawScript(20, FEATURED_MAX)
		expect(script.length).toBeLessThan(800)
		expect(script).not.toMatch(/fetch|XMLHttpRequest|localStorage|cookie|import\(/)
	})
})

describe('1066 : le journal de la vérification', () => {
	test('une action par changement, aucune quand rien ne change', () => {
		expect(verifyActionOf({ verified: false }, { verified: true })).toBe('verify')
		expect(verifyActionOf(null, { verified: true })).toBe('verify')
		expect(verifyActionOf({ verified: true }, { verified: false })).toBe('unverify')
		expect(verifyActionOf({ verified: true }, { verified: true })).toBeNull()
		expect(verifyActionOf({ verified: false }, { verified: false })).toBeNull()
		expect(verifyActionOf(null, { verified: false })).toBeNull()
		expect(verifyActionOf({ verified: true }, {})).toBeNull()
	})

	test('les deux anciennes actions restent lisibles : dans l’énumération et avec une étiquette', () => {
		expect(LEGACY_FEATURE_ACTIONS).toEqual(['feature', 'unfeature'])
		const options = ModerationEvents.fields.find(field => 'name' in field && field.name === 'action') as {
			options: { value: string; label: string }[]
		}
		expect(options.options.map(({ value }) => value)).toEqual([
			'hide',
			'suspend',
			'restore',
			'feature',
			'unfeature',
			'verify',
			'unverify',
		])
		for (const { value, label } of options.options) {
			expect(label).toBe(ACTION_LABELS[value as keyof typeof ACTION_LABELS])
			expect(label).not.toBe('')
		}
	})

	test('la case « Mise en avant » n’existe plus ; « Vérifiée » dit à quoi elle sert', () => {
		const names = Profiles.fields.map(field => ('name' in field ? field.name : ''))
		expect(names).not.toContain('featured')
		const verified = Profiles.fields.find(field => 'name' in field && field.name === 'verified') as {
			admin: { description: string }
		}
		expect(verified.admin.description).toContain('Mise en avant')
		expect(verified.admin.description).toContain('tirée au hasard')
	})
})

describe('1066 : le bloc « Mise en avant »', () => {
	const many = (count: number) => Array.from({ length: count }, (_, index) => entry(`profil-${index}`).carte)

	test('un titre, une carte par candidat, et rien sans carte', () => {
		const html = renderToStaticMarkup(<FeaturedProfiles cartes={many(4)} />)
		expect(html).toContain('Mise en avant')
		expect(html).not.toContain('Récemment mises à jour')
		expect(html.match(/href="\/profil\//g)).toHaveLength(4)
		expect(renderToStaticMarkup(<FeaturedProfiles cartes={[]} />)).toBe('')
	})

	test('les cartes sont celles du kit, sans clic mesuré, et sans bannière : le bandeau du haut de page est le seul de l’accueil', () => {
		const html = renderToStaticMarkup(<FeaturedProfiles cartes={many(3)} />)
		expect(html.match(/data-profile-card/g)).toHaveLength(3)
		expect(html).not.toContain('data-result-card')
		// Andy, 26/10/2026: « un seul bandeau le plus cohérent ». The kit banner that opened this section is gone.
		expect(html).not.toContain('art-marquee')
		expect(html).not.toContain('Des maquilleuses indépendantes, partout en France')
		expect(html.startsWith('<section aria-labelledby="accueil-mise-en-avant"')).toBe(true)
		expect(html).toContain('home-section')
	})

	test('la tête de section garde ses classes d’origine tant que `display` n’est pas demandé (Projet et spécialités intacts)', () => {
		const plain = renderToStaticMarkup(<SectionHead titre="Titre" />)
		expect(plain).toContain(
			'class="reveal mt-6 text-balance font-bold text-3xl text-gray-900 tracking-tight md:text-4xl lg:text-5xl lg:leading-[1.1]"'
		)
		expect(renderToStaticMarkup(<SectionHead titre="Titre" display />)).toContain('font-display')
	})

	test('jusqu’à six candidats, aucun script : rien à tirer', () => {
		expect(renderToStaticMarkup(<FeaturedProfiles cartes={many(6)} />)).not.toContain('<script')
	})

	test('au-delà de six, tous les candidats sont dans le HTML, et le script de tirage est avant la liste', () => {
		const html = renderToStaticMarkup(<FeaturedProfiles cartes={many(15)} />)
		expect(html.match(/href="\/profil\//g)).toHaveLength(15)
		const script = html.indexOf('<script')
		expect(script).toBeGreaterThan(-1)
		expect(script).toBeLessThan(html.indexOf('<ul'))
		expect(html).toContain('})(15,6,0)')
		expect(html).toContain('class="featured-list ')
		// No client component, no state: the page ships no byte of JavaScript for the draw.
		expect(read('src/components/home/FeaturedProfiles.tsx')).not.toMatch(/['"]use client['"]/)
	})

	test('la feuille de style montre les six premiers sans script, et ne cache rien par la transparence', () => {
		const css = read('src/app/(front)/globals.css')
		expect(css).toMatch(/\.featured-list > li:nth-child\(n \+ 7\) \{\s*display: none;\s*\}/)
		expect(FEATURED_MAX + 1).toBe(7)
		expect(css.slice(css.indexOf('.featured-list'), css.indexOf('Motion (issue 1069'))).not.toContain('opacity')
	})
})

describe('1066 : le haut de page', () => {
	// The drawing of issue 1066 gave way to the arch (decision of 25/10/2026), and its three lines to the essential: the
	// heading, one sentence and the search (Andy, 25/10/2026).
	const html = renderToStaticMarkup(<HomeHero />)

	test('il ne dit plus en trois lignes ce que fait la plateforme : la phrase et la recherche le disent', () => {
		expect(html).not.toContain('Cherchez par événement et par lieu')
		expect(html).not.toContain('Consultez des profils vérifiés')
		expect(html).toContain('Des maquilleuses professionnelles')
		expect(html).toContain('action="/search"')
	})

	test('ni nom, ni donnée personnelle : l’arche montre des ombres, le titre des mots seuls', () => {
		// The numbers of an icon path (`d="…"`) are not text: they are left out before looking for a phone number.
		const text = html
			.split(' d="')
			.map((part, index) => (index === 0 ? part : part.slice(part.indexOf('"') + 1)))
			.join('')
		expect(text).not.toMatch(/@|\d{2} \d{2} \d{2}/)
		expect(html.match(/<img\b[^>]*aria-hidden="true"/g)).toBeNull()
	})
})

describe('1066 : la page d’accueil', () => {
	const page = read('src/app/(front)/(site)/home-cached/[key]/page.tsx')

	test('le titre de l’onglet et les données structurées sont gardés ; le h1 est celui du haut de page en arche', () => {
		expect(mainTitles(renderToStaticMarkup(<HomeHero />))).toEqual([
			'Trouvez la maquilleuse qui vous correspond près de chez vous.',
		])
		expect(page).toContain("const TITLE = 'Maquilleuse professionnelle près de chez vous'")
		expect(page).toContain('homeStructuredData')
		expect(page).toContain('<HomeHero />')
		expect(read('src/components/home/HomeHero.tsx')).toContain('<GuidedSearch />')
	})

	test('« Comment ça marche » n’a plus de titre ni de pli ; les trois textes restent', () => {
		expect(page).not.toContain('Comment ça marche')
		expect(page).not.toContain('<details')
		for (const component of ['Presentation', 'Project', 'Collaboration']) expect(page).toContain(`<${component} />`)
		expect(read('src/components/home/Presentation.tsx')).toContain('avant tout une')
	})

	test('« Vos projets, nos meilleurs talents » est gardé, « Récemment mises à jour » n’existe plus', () => {
		expect(read('src/components/home/Talents.tsx')).toContain('Vos projets, nos meilleurs talents.')
		expect(page).not.toContain('RecentProfiles')
		expect(page).toContain('FeaturedProfiles')
	})

	test('les candidats se lisent dans le cache de Next, sous l’étiquette des profils, sans casser la page', () => {
		const cached = read('src/services/public/cached.ts')
		const declaration = cached.slice(cached.indexOf('export const cachedFeaturedProfiles'))
		expect(declaration.slice(0, declaration.indexOf('\n)\n'))).toContain('tags: [TAGS.profils]')
		expect(page).toContain('cachedFeaturedProfiles')
		expect(page).toMatch(/catch[\s\S]*return \[\]/)
		expect(page).not.toMatch(/cookies\(|headers\(/)
	})
})
