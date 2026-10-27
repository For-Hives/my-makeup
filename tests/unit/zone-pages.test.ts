import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { DEPARTMENTS } from '../../src/lib/departments'
import { isExcluded, sitemapEntries } from '../../src/lib/seo/sitemap'
import { zonePageMetadata, zoneStructuredData } from '../../src/lib/seo/zone-page'
import {
	departmentFromSlug,
	departmentSlug,
	indexableZones,
	ZONE_THRESHOLD,
	type ZoneProfile,
	zoneMembers,
	zonePath,
	zoneStatus,
} from '../../src/lib/seo/zones'
import { isSlug } from '../../src/lib/slug'
import { readIndexablePages } from '../../src/services/public/indexable-pages'

/**
 * Ticket 1015: a page « maquilleuse près de chez vous » by département, indexable from 1 indexable profile (owner decision of 24/10/2026).
 * One rule (src/lib/seo/zones.ts) decides the page, the robots tag, the sitemap and the plan of the site.
 */

const ROOT = join(import.meta.dir, '../..')

const profile = (n: number, extra: Partial<ZoneProfile> = {}): ZoneProfile => ({
	slug: `artiste-${n}`,
	departement: '74',
	indexable: true,
	listed: true,
	misAJourLe: null,
	...extra,
})
const many = (count: number, extra: Partial<ZoneProfile> = {}): ZoneProfile[] =>
	Array.from({ length: count }, (_, index) => profile(index + 1, extra))

describe('the threshold, at its bounds', () => {
	test('the threshold is 1: a single publishable, listed profile makes the zone indexable', () => {
		expect(ZONE_THRESHOLD).toBe(1)
	})

	test.each([
		[0, 'absent'],
		[1, 'indexable'],
		[2, 'indexable'],
		[3, 'indexable'],
	] as const)('%i profiles: %s', (count, expected) => {
		expect(zoneStatus(count)).toBe(expected)
	})

	test('a zone with 0, 1 and 2 listed indexable profiles is in the list of indexable zones from 1', () => {
		for (const [count, expected] of [
			[0, 0],
			[1, 1],
			[2, 1],
		] as const)
			expect({ count, zones: indexableZones(many(count)).length }).toEqual({ count, zones: expected })
	})
})

describe('who counts in a zone', () => {
	test('a profile counts when she is publishable, listed, and in the département', () => {
		expect(zoneMembers(many(3), '74')).toHaveLength(3)
	})

	test('not a thin one, not one that is not listed, not another département, not one with no département', () => {
		const profiles = [
			...many(2),
			profile(10, { indexable: false }),
			profile(11, { listed: false }),
			profile(12, { departement: '73' }),
			profile(13, { departement: null }),
		]
		expect(zoneMembers(profiles, '74').map(({ slug }) => slug)).toEqual(['artiste-1', 'artiste-2'])
		expect(indexableZones(profiles).map(({ code, count }) => [code, count])).toEqual([
			['74', 2],
			['73', 1],
		])
	})

	test('a zone whose only profiles do not count has no page at all, never an empty one', () => {
		const profiles = [profile(10, { listed: false }), profile(11, { indexable: false })]
		expect(zoneStatus(zoneMembers(profiles, '74').length)).toBe('absent')
		expect(indexableZones(profiles)).toEqual([])
	})

	test('the indexable zones are listed by slug, each with its count and its latest change', () => {
		const profiles = [
			...many(3, { departement: '74', misAJourLe: '2026-01-02T00:00:00.000Z' }).map((p, i) =>
				i === 1 ? { ...p, misAJourLe: '2026-03-04T00:00:00.000Z' } : p
			),
			...many(3, { departement: '73' }).map(p => ({ ...p, slug: `b-${p.slug}` })),
			...many(1, { departement: '38' }).map(p => ({ ...p, slug: `c-${p.slug}` })),
			...many(1, { departement: '69', listed: false }).map(p => ({ ...p, slug: `d-${p.slug}` })),
		]
		expect(indexableZones(profiles)).toEqual([
			{ code: '74', slug: 'haute-savoie', name: 'Haute-Savoie', count: 3, misAJourLe: '2026-03-04T00:00:00.000Z' },
			{ code: '38', slug: 'isere', name: 'Isère', count: 1, misAJourLe: null },
			{ code: '73', slug: 'savoie', name: 'Savoie', count: 3, misAJourLe: null },
		])
	})
})

describe('the address of a zone', () => {
	test('every département has a distinct address segment that is a valid slug', () => {
		const slugs = Object.keys(DEPARTMENTS).map(departmentSlug)
		expect(new Set(slugs).size).toBe(slugs.length)
		for (const slug of slugs) expect(isSlug(slug)).toBe(true)
	})

	test('the segment gives its département back, and nothing else does', () => {
		for (const code of Object.keys(DEPARTMENTS)) expect(departmentFromSlug(departmentSlug(code))).toBe(code)
		expect(departmentSlug('74')).toBe('haute-savoie')
		expect(departmentSlug('21')).toBe('cote-d-or')
		for (const unknown of ['', 'inconnu', 'Haute-Savoie', '74', 'haute-savoie/', 'a'.repeat(300), '__proto__'])
			expect(departmentFromSlug(unknown)).toBeNull()
	})

	test('the path has no final slash', () => {
		expect(zonePath('74')).toBe('/maquilleuses/haute-savoie')
	})
})

describe('the sitemap', () => {
	test('lists a zone from one profile, and never a zone with no profile that counts', () => {
		const zones = indexableZones([
			...many(1),
			...many(1, { departement: '73', listed: false }).map(p => ({ ...p, slug: `b-${p.slug}` })),
			...many(1, { departement: '38', indexable: false }).map(p => ({ ...p, slug: `c-${p.slug}` })),
		])
		const locs = sitemapEntries({ zones }).map(({ loc }) => loc)
		expect(locs).toContain('https://my-makeup.fr/maquilleuses/haute-savoie')
		expect(locs.filter(loc => loc.includes('/maquilleuses/'))).toEqual([
			'https://my-makeup.fr/maquilleuses/haute-savoie',
		])
	})

	test('carries the date of the last change of the zone', () => {
		const zones = indexableZones(many(3, { misAJourLe: '2026-05-06T07:08:09.000Z' }))
		expect(sitemapEntries({ zones }).find(({ loc }) => loc.endsWith('/haute-savoie'))?.lastmod).toBe(
			'2026-05-06T07:08:09.000Z'
		)
	})

	test('a zone address is not excluded by the exclusion rules', () => {
		expect(isExcluded('/maquilleuses/haute-savoie')).toBe(false)
	})
})

describe('the metadata and the structured data of a zone page', () => {
	test('indexable from 1: a canonical address, no noindex', () => {
		for (const count of [1, 2, 3]) {
			const metadata = zonePageMetadata({ code: '74', count })
			expect(metadata.alternates?.canonical).toBe('https://my-makeup.fr/maquilleuses/haute-savoie')
			expect(metadata.robots).toBeUndefined()
		}
		const metadata = zonePageMetadata({ code: '74', count: 3 })
		expect(metadata.alternates?.canonical).toBe('https://my-makeup.fr/maquilleuses/haute-savoie')
		expect(metadata.robots).toBeUndefined()
		expect(String(JSON.stringify(metadata.title))).toContain('Haute-Savoie')
	})

	test('with no profile (a state the page never serves: it answers 404): noindex, follow, and no canonical address', () => {
		for (const count of [0]) {
			const metadata = zonePageMetadata({ code: '74', count })
			expect(metadata.robots).toEqual({ index: false, follow: true })
			expect(metadata.alternates).toBeUndefined()
		}
	})

	test('the structured data: a breadcrumb, a collection of profile addresses, and nothing else', () => {
		const data = zoneStructuredData({ code: '74', slugs: ['artiste-1', 'artiste-2', 'artiste-3'] })
		const json = JSON.stringify(data)
		expect(json).toContain('BreadcrumbList')
		expect(json).toContain('CollectionPage')
		expect(json).toContain('ItemList')
		expect(json).toContain('https://my-makeup.fr/profil/artiste-2')
		expect(json).not.toMatch(/aggregateRating|ratingValue|review|address|telephone|email|priceRange/i)
	})
})

describe('the page', () => {
	const page = readFileSync(join(ROOT, 'src/app/(front)/(site)/maquilleuses/[department]/page.tsx'), 'utf8')

	test('is cached like the page of a talent, and renders at its first visit', () => {
		expect(page).not.toMatch(/export const dynamic\s*=/)
		expect(page).toMatch(/export const revalidate = 3600/)
		expect(page).toMatch(/export function generateStaticParams\(\)[^\n]*\{\s*return \[\]\s*\}/)
		expect(page).toContain('export const dynamicParams = true')
	})

	test('decides with the rule of the sitemap, and answers 404 for an unknown or an empty zone', () => {
		expect(page).toContain('zoneStatus(')
		expect(page).toContain('notFound()')
	})
})

describe('the reading that gives the zones to the sitemap', () => {
	const doc = (slug: string, extra: Record<string, unknown> = {}) => ({
		slug,
		firstName: 'Prénom',
		lastName: slug,
		updatedAt: '2026-02-03T00:00:00.000Z',
		city: { name: 'Annecy', department: '74' },
		...extra,
	})
	const payload = (profiles: unknown[]) =>
		({
			find: async ({ collection }: { collection: string }) => ({
				docs: collection === 'profiles' ? profiles : [],
				hasNextPage: false,
			}),
		}) as unknown as Payload

	test('counts the profiles of a département that are listed, and only them', async () => {
		const pages = await readIndexablePages(
			payload([
				doc('a-un'),
				doc('a-deux'),
				doc('a-trois'),
				doc('a-indisponible', { available: false }),
				doc('a-vide', { fullyEmpty: true }),
				doc('a-etranger', { zoneKind: 'countries', countries: ['BE'], city: null }),
				doc('b-un', { city: { name: 'Chambéry', department: '73' } }),
				doc('b-deux', { city: { name: 'Chambéry', department: '73' } }),
			])
		)
		expect(pages.zones.map(({ code, count }) => [code, count])).toEqual([
			['74', 3],
			['73', 2],
		])
		expect(pages.profils).toHaveLength(8)
	})

	test('no profile gives no zone, one gives a zone, and so do two and three', async () => {
		for (const [count, zones] of [
			[0, 0],
			[1, 1],
			[2, 1],
			[3, 1],
		] as const) {
			const pages = await readIndexablePages(payload(Array.from({ length: count }, (_, i) => doc(`p-${i}`))))
			expect({ count, zones: pages.zones.length }).toEqual({ count, zones })
		}
	})
})
