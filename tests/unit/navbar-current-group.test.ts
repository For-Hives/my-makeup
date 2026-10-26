import { describe, expect, test } from 'bun:test'
import { currentGroup, NAVIGATION } from '@/components/layout/links'

/**
 * The group of the bar that holds the current page (issue 1137, docs/navbar.md): « Particulier », « Maquilleuse » and
 * « Solutions » are ringed by the sketched ellipse when the visitor is on one of their pages, as « Blog » is on its own.
 */

const GROUPS = NAVIGATION.flatMap(entry => ('enfants' in entry ? [entry] : []))

describe('the group that holds the current page', () => {
	test('the bar has three groups', () => {
		expect(GROUPS.map(group => group.nom)).toEqual(['Particulier', 'Maquilleuse', 'Solutions'])
	})

	for (const group of GROUPS) {
		for (const child of group.enfants) {
			test(`${child.href} belongs to « ${group.nom} » and to no other group`, () => {
				expect(currentGroup(child.href)).toBe(group.nom)
			})
		}
	}

	test('a page of no group has no current group: the home page, the blog, the search, the sign-in', () => {
		for (const path of [
			'/',
			'/blog',
			'/blog/un-article',
			'/search',
			'/auth/signin',
			'/contact',
			'/a-propos',
			'/profil/zoe',
		])
			expect(currentGroup(path)).toBeNull()
	})

	test('only an exact address counts: a longer address or a neighbour is not a page of the group', () => {
		expect(currentGroup('/particulier')).toBeNull()
		expect(currentGroup('/particulier/trouver-une-maquilleuse/suite')).toBeNull()
		expect(currentGroup('/solutions')).toBeNull()
	})

	test('a trailing slash and the empty path are tolerated', () => {
		expect(currentGroup('/maquilleuse/partenariats/')).toBe('Maquilleuse')
		expect(currentGroup('')).toBeNull()
	})
})
