import { describe, expect, test } from 'bun:test'
import { retourSur, urlDeConnexion } from '@/lib/auth/retour'

const SITE = 'https://my-makeup.fr'

describe('retourSur : le retour après la connexion (U63)', () => {
	test('une page interne est respectée, requête et ancre comprises', () => {
		expect(retourSur('/auth/profil?x=1#haut', SITE)).toBe('/auth/profil?x=1#haut')
		expect(retourSur('https://my-makeup.fr/auth/init-account', SITE)).toBe('/auth/init-account')
	})

	test.each([
		'https://evil.example/auth/profil',
		'//evil.example',
		'/\\evil.example',
		'\t//evil.example',
		'/.//evil.example',
		'/%2e//evil.example',
		'/x/..//evil.example',
		'/./\\evil.example',
		'/auth/..//evil.example/x',
		'javascript:alert(1)',
		'data:text/html,x',
		'',
		'   ',
	])('%j est ignoré', brut => {
		expect(retourSur(brut, SITE)).toBe('/auth/profil')
	})

	test('ni texte ni valeur : la page par défaut', () => {
		expect(retourSur(undefined, SITE)).toBe('/auth/profil')
		expect(retourSur(42, SITE)).toBe('/auth/profil')
		expect(retourSur(['/mon-espace', '/autre'], SITE)).toBe('/mon-espace')
	})

	test('une page d’authentification ou de l’API ne sert jamais de retour (pas de boucle)', () => {
		for (const brut of ['/auth/signin', '/auth/signin?callbackUrl=/x', '/auth/signup', '/auth/error', '/api/pros/me'])
			expect(retourSur(brut, SITE)).toBe('/auth/profil')
	})
})

describe('urlDeConnexion', () => {
	test('la page de connexion avec la page de retour', () => {
		expect(urlDeConnexion('/auth/profil')).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
	})
})
