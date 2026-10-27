/**
 * The preset of the search page without any criterion: « Les plus consultées en France » when the visits of the last
 * 30 days say it, « Les mieux classées » (the documented order) when they do not. Pure functions, made-up profiles.
 */

import { describe, expect, test } from 'bun:test'
import {
	MOST_VIEWED_MIN_PROFILES,
	MOST_VIEWED_MIN_VIEWS,
	orderMostViewed,
	PRESET_SIZE,
	selectPreset,
} from '@/lib/search/preset'

interface Fake {
	carte: { slug: string }
	publishable: boolean
	unreachable: boolean
	departement: string | null
}

const profile = (slug: string, extra: Partial<Fake> = {}): Fake => ({
	carte: { slug },
	publishable: true,
	unreachable: false,
	departement: '74',
	...extra,
})
const slugs = (list: readonly Fake[]): string[] => list.map(({ carte }) => carte.slug)

/** A directory in the order the page `/classement` announces: p1 first. */
const DIRECTORY = Array.from({ length: 12 }, (_, i) => profile(`p${i + 1}`))
const enough = (names: string[]): string[] => names

describe('orderMostViewed : ce qui sort du comptage', () => {
	test('seuls les profils au-dessus du plancher restent, le plus vu d’abord, l’égalité par ordre alphabétique', () => {
		const totals = new Map([
			['rare', MOST_VIEWED_MIN_VIEWS - 1],
			['b', 50],
			['a', 50],
			['top', 400],
			['limite', MOST_VIEWED_MIN_VIEWS],
		])
		expect(orderMostViewed(totals)).toEqual(['top', 'a', 'b', 'limite'])
	})

	test('l’ordre ne porte aucun nombre', () => {
		for (const item of orderMostViewed(new Map([['a', 99]]))) expect(typeof item).toBe('string')
	})

	test('au plus 24 profils sont gardés : de quoi remplacer ceux que la sélection écarte', () => {
		const totals = new Map(Array.from({ length: 40 }, (_, i) => [`s${String(i).padStart(2, '0')}`, 100 + i] as const))
		expect(orderMostViewed(totals)).toHaveLength(24)
	})
})

describe('selectPreset : les plus consultées quand les visites le disent', () => {
	test('assez de profils vus : le palmarès, dans l’ordre des visites', () => {
		const viewed = ['p9', 'p3', 'p7', 'p1', 'p12', 'p5', 'p2']
		const preset = selectPreset(DIRECTORY, viewed)
		expect(preset.kind).toBe('most-viewed')
		expect(slugs(preset.profiles)).toEqual(['p9', 'p3', 'p7', 'p1', 'p12', 'p5'])
		expect(preset.title).toBe('Les plus consultées en France')
		expect(preset.intro).toContain('30 derniers jours')
	})

	test('le palmarès ne montre jamais un profil absent de l’annuaire, sans moyen de contact, non publiable ou hors de France', () => {
		const directory = [
			profile('masque-ou-absent-de-lannuaire-non'),
			profile('sans-contact', { unreachable: true }),
			profile('non-publiable', { publishable: false }),
			profile('belgique', { departement: null }),
			...DIRECTORY.slice(0, 7),
		]
		const viewed = ['inconnu', 'sans-contact', 'non-publiable', 'belgique', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
		const preset = selectPreset(directory, viewed)
		expect(preset.kind).toBe('most-viewed')
		expect(slugs(preset.profiles)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
	})

	test('il faut au moins autant de profils éligibles que de places : en dessous, ce n’est pas un palmarès', () => {
		expect(MOST_VIEWED_MIN_PROFILES).toBe(PRESET_SIZE)
		const preset = selectPreset(DIRECTORY, enough(['p4', 'p2', 'p8', 'p1', 'p3']))
		expect(preset.kind).toBe('best-ranked')
	})

	test('les profils vus qui ne sont plus éligibles ne comptent pas dans le minimum', () => {
		const directory = [profile('x1', { unreachable: true }), profile('x2', { unreachable: true }), ...DIRECTORY]
		const preset = selectPreset(directory, ['x1', 'x2', 'p1', 'p2', 'p3', 'p4'])
		expect(preset.kind).toBe('best-ranked')
	})
})

describe('selectPreset : sinon, l’ordre documenté, dit tel quel', () => {
	test('sans comptage lisible (lecture en échec), c’est l’ordre de l’annuaire, intitulé « Les mieux classées »', () => {
		const preset = selectPreset(DIRECTORY, null)
		expect(preset.kind).toBe('best-ranked')
		expect(preset.title).toBe('Les mieux classées')
		expect(slugs(preset.profiles)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
		expect(preset.intro).not.toMatch(/consult|demand|populaire|tendance/i)
	})

	test('le repli applique les mêmes règles de visibilité', () => {
		const directory = [
			profile('sans-contact', { unreachable: true }),
			profile('brouillon', { publishable: false }),
			...DIRECTORY,
		]
		expect(slugs(selectPreset(directory, null).profiles)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
	})

	test('un annuaire trop petit donne ce qu’il y a, sans rien inventer', () => {
		expect(slugs(selectPreset(DIRECTORY.slice(0, 2), null).profiles)).toEqual(['p1', 'p2'])
		expect(selectPreset([], null).profiles).toEqual([])
	})
})
