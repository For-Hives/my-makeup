/**
 * The shape of an address (ticket 072; plan 02 U62 and U64): one redirect to the final address, for a
 * repeated slash, a final slash, and the addresses the frozen table moves. Pure: no server.
 */

import { describe, expect, test } from 'bun:test'
import { FROZEN_URL_FAMILIES, splitAddress, UNFROZEN_PREFIXES } from '../../src/lib/frozen-urls'
import { PATH_REDIRECTS, shapeRedirect } from '../../src/lib/urls/shape'

describe('U62 : la double barre et la barre finale', () => {
	test('`//x` répond 301 vers `/x`', () => {
		expect(shapeRedirect('//x')).toEqual({ chemin: '/x', status: 301 })
		expect(shapeRedirect('//profil/zoe-lefevre')).toEqual({ chemin: '/profil/zoe-lefevre', status: 301 })
		expect(shapeRedirect('/a///b//c')).toEqual({ chemin: '/a/b/c', status: 301 })
		expect(shapeRedirect('//')).toEqual({ chemin: '/', status: 301 })
	})

	test('une barre finale répond 308, en un saut, vers le même chemin sans elle', () => {
		expect(shapeRedirect('/blog/')).toEqual({ chemin: '/blog', status: 308 })
		expect(shapeRedirect('/talent/maquillage-mariee/')).toEqual({
			chemin: '/talent/maquillage-mariee',
			status: 308,
		})
		expect(shapeRedirect('/search/')).toEqual({ chemin: '/search', status: 308 })
	})

	test('la double barre et la barre finale ensemble : une seule redirection, 301', () => {
		expect(shapeRedirect('//blog/')).toEqual({ chemin: '/blog', status: 301 })
		expect(shapeRedirect('/blog//')).toEqual({ chemin: '/blog', status: 301 })
		expect(shapeRedirect('///')).toEqual({ chemin: '/', status: 301 })
	})

	test('`/toutes-les-news` répond 301 vers `/blog`, et ses variantes de forme vont droit à `/blog`', () => {
		expect(shapeRedirect('/toutes-les-news')).toEqual({ chemin: '/blog', status: 301 })
		expect(shapeRedirect('//toutes-les-news')).toEqual({ chemin: '/blog', status: 301 })
		expect(shapeRedirect('/toutes-les-news/')).toEqual({ chemin: '/blog', status: 308 })
		expect(shapeRedirect('//toutes-les-news/')).toEqual({ chemin: '/blog', status: 301 })
	})

	test('une adresse de la bonne forme ne redirige pas, la casse compte', () => {
		for (const filePath of [
			'/',
			'/blog',
			'/Blog',
			'/search',
			'/profil/zoe-lefevre',
			'/favicon.webp',
			'/blog/un-article',
		])
			expect(shapeRedirect(filePath)).toBeNull()
	})

	test('les redirections de chemin viennent de la table des adresses gelées', () => {
		expect([...PATH_REDIRECTS]).toEqual([
			['/toutes-les-news', '/blog'],
			['/auth/init-account', '/auth/profil'],
		])
	})

	test('une adresse retirée pour de bon répond 308, une adresse déplacée 301 (`/auth/init-account`, 27/10/2026)', () => {
		expect(shapeRedirect('/auth/init-account')).toEqual({ chemin: '/auth/profil', status: 308 })
		expect(shapeRedirect('/auth/init-account/')).toEqual({ chemin: '/auth/profil', status: 308 })
		expect(shapeRedirect('//auth/init-account')).toEqual({ chemin: '/auth/profil', status: 301 })
		expect(shapeRedirect('/toutes-les-news')).toEqual({ chemin: '/blog', status: 301 })
	})

	test('chaque exemple des deux familles de forme, et ceux qui y passent, va où la table le dit', () => {
		const examples = FROZEN_URL_FAMILIES.filter(famille => famille.rule !== undefined).flatMap(famille =>
			famille.examples.map(exemple => ({ famille, ...exemple }))
		)
		expect(examples.length).toBeGreaterThan(0)
		for (const { famille: family, from, to } of examples) {
			const redirection = shapeRedirect(splitAddress(from).path)
			expect(redirection?.chemin).toBe(splitAddress(to ?? '').path)
			expect<number | undefined>(redirection?.status).toBe(family.status)
		}
	})
})

describe('U64 : ce que la forme ne touche pas', () => {
	test('/admin, /api et /_next ne sont jamais interceptés, même avec une barre en trop', () => {
		for (const prefix of UNFROZEN_PREFIXES) {
			expect(shapeRedirect(prefix)).toBeNull()
			expect(shapeRedirect(`${prefix}/`)).toBeNull()
			expect(shapeRedirect(`${prefix}//x`)).toBeNull()
			expect(shapeRedirect(`//${prefix.slice(1)}/x/`)).toBeNull()
		}
		expect(shapeRedirect('/api/health')).toBeNull()
		expect(shapeRedirect('/_next/static/chunks/a.js')).toBeNull()
		expect(shapeRedirect('/admin/collections/profiles')).toBeNull()
	})

	test('les fichiers statiques de `public/` ne sont pas interceptés', () => {
		for (const filePath of ['/favicon.webp', '/BingSiteAuth.xml', '/robots.txt', '/assets/back.webp'])
			expect(shapeRedirect(filePath)).toBeNull()
	})

	test('un préfixe voisin n’est pas un préfixe libre', () => {
		expect(shapeRedirect('/administration/')).toEqual({ chemin: '/administration', status: 308 })
		expect(shapeRedirect('/apiary//x')).toEqual({ chemin: '/apiary/x', status: 301 })
	})
})
