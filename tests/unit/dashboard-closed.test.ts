import { describe, expect, test } from 'bun:test'
import { dashboardRedirection } from '@/lib/auth/closed-dashboard'
import { dashboardHeaders } from '@/lib/auth/dashboard-headers'
import * as moduleProxy from '@/proxy'

const config = (moduleProxy as { config?: { matcher?: unknown } }).config

describe('redirectionDeLEspace : la porte rapide des pages privées', () => {
	test('sans cookie, une page privée renvoie à la connexion avec la page de retour', () => {
		expect(dashboardRedirection('/auth/profil', '', false)).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
		expect(dashboardRedirection('/auth/init-account', '', false)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Finit-account'
		)
	})

	test('la requête fait partie du retour', () => {
		expect(dashboardRedirection('/auth/profil', '?a=1&b=2', false)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fa%3D1%26b%3D2'
		)
	})

	test('avec un cookie, la page décide (aucune redirection ici)', () => {
		expect(dashboardRedirection('/auth/profil', '', true)).toBeNull()
	})

	test('la connexion elle-même, le site et l’API ne sont jamais fermés (pas de boucle)', () => {
		for (const chemin of [
			'/auth/signin',
			'/auth/signup',
			'/auth/profilx',
			'/',
			'/profil/ana',
			'/api/pros/me',
			'/admin',
		])
			expect(dashboardRedirection(chemin, '', false)).toBeNull()
	})

	test('les sous-chemins d’une page privée sont privés', () => {
		expect(dashboardRedirection('/auth/profil/photos', '', false)).not.toBeNull()
	})

	test('le proxy n’a pas de matcher : il voit chaque requête (robots, ticket 070) et la table décide de la porte', () => {
		expect((config as { matcher?: unknown } | undefined)?.matcher).toBeUndefined()
	})
})

describe('U71 : les pages de l’espace ne sont jamais en cache', () => {
	test('Cache-Control: private, no-store et noindex', () => {
		const entetes = Object.fromEntries(dashboardHeaders().map(({ key, value }) => [key, value]))
		expect(entetes['Cache-Control']).toBe('private, no-store')
		expect(entetes['X-Robots-Tag']).toContain('noindex')
	})
})
