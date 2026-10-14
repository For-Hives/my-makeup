import { describe, expect, test } from 'bun:test'
import { enTetesEspace } from '@/lib/auth/entetes-espace'
import { MATCHERS_DU_PROXY, redirectionDeLEspace } from '@/lib/auth/espace-ferme'
import { config } from '@/proxy'

describe('redirectionDeLEspace : la porte rapide des pages privées', () => {
	test('sans cookie, une page privée renvoie à la connexion avec la page de retour', () => {
		expect(redirectionDeLEspace('/auth/profil', '', false)).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
		expect(redirectionDeLEspace('/auth/init-account', '', false)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Finit-account'
		)
	})

	test('la requête fait partie du retour', () => {
		expect(redirectionDeLEspace('/auth/profil', '?a=1&b=2', false)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fa%3D1%26b%3D2'
		)
	})

	test('avec un cookie, la page décide (aucune redirection ici)', () => {
		expect(redirectionDeLEspace('/auth/profil', '', true)).toBeNull()
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
			expect(redirectionDeLEspace(chemin, '', false)).toBeNull()
	})

	test('les sous-chemins d’une page privée sont privés', () => {
		expect(redirectionDeLEspace('/auth/profil/photos', '', false)).not.toBeNull()
	})

	test('le matcher du proxy dit la même chose que la table', () => {
		expect(config.matcher).toEqual(MATCHERS_DU_PROXY)
	})
})

describe('U71 : les pages de l’espace ne sont jamais en cache', () => {
	test('Cache-Control: private, no-store et noindex', () => {
		const entetes = Object.fromEntries(enTetesEspace().map(({ key, value }) => [key, value]))
		expect(entetes['Cache-Control']).toBe('private, no-store')
		expect(entetes['X-Robots-Tag']).toContain('noindex')
	})
})
