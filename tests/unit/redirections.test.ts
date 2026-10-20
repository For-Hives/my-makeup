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
		for (const chemin of ['/', '/blog', '/Blog', '/search', '/profil/zoe-lefevre', '/favicon.webp', '/blog/un-article'])
			expect(shapeRedirect(chemin)).toBeNull()
	})

	test('les redirections de chemin viennent de la table des adresses gelées', () => {
		expect([...PATH_REDIRECTS]).toEqual([['/toutes-les-news', '/blog']])
	})

	test('chaque exemple des deux familles de forme, et ceux qui y passent, va où la table le dit', () => {
		const exemples = FROZEN_URL_FAMILIES.filter(famille => famille.rule !== undefined).flatMap(famille =>
			famille.examples.map(exemple => ({ famille, ...exemple }))
		)
		expect(exemples.length).toBeGreaterThan(0)
		for (const { famille, from, to } of exemples) {
			const redirection = shapeRedirect(splitAddress(from).path)
			expect(redirection?.chemin).toBe(splitAddress(to ?? '').path)
			expect<number | undefined>(redirection?.status).toBe(famille.status)
		}
	})
})

describe('U64 : ce que la forme ne touche pas', () => {
	test('/admin, /api et /_next ne sont jamais interceptés, même avec une barre en trop', () => {
		for (const prefixe of UNFROZEN_PREFIXES) {
			expect(shapeRedirect(prefixe)).toBeNull()
			expect(shapeRedirect(`${prefixe}/`)).toBeNull()
			expect(shapeRedirect(`${prefixe}//x`)).toBeNull()
			expect(shapeRedirect(`//${prefixe.slice(1)}/x/`)).toBeNull()
		}
		expect(shapeRedirect('/api/health')).toBeNull()
		expect(shapeRedirect('/_next/static/chunks/a.js')).toBeNull()
		expect(shapeRedirect('/admin/collections/profiles')).toBeNull()
	})

	test('les fichiers statiques de `public/` ne sont pas interceptés', () => {
		for (const chemin of ['/favicon.webp', '/BingSiteAuth.xml', '/robots.txt', '/assets/back.webp'])
			expect(shapeRedirect(chemin)).toBeNull()
	})

	test('un préfixe voisin n’est pas un préfixe libre', () => {
		expect(shapeRedirect('/administration/')).toEqual({ chemin: '/administration', status: 308 })
		expect(shapeRedirect('/apiary//x')).toEqual({ chemin: '/apiary/x', status: 301 })
	})
})
