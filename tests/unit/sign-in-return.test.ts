import { describe, expect, test } from 'bun:test'
import {
	ACCOUNT_ONBOARDING_PAGE,
	DEFAULT_DASHBOARD,
	destinationAfterSignIn,
	safeReturnTo,
	signInUrl,
} from '@/lib/auth/return-to'

const SITE = 'https://my-makeup.fr'

describe('retourSur : le retour après la connexion (U63)', () => {
	test('une page interne est respectée, requête et ancre comprises', () => {
		expect(safeReturnTo('/auth/profil?x=1#haut', SITE)).toBe('/auth/profil?x=1#haut')
		expect(safeReturnTo('https://my-makeup.fr/auth/init-account', SITE)).toBe('/auth/init-account')
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
		expect(safeReturnTo(brut, SITE)).toBe('/auth/profil')
	})

	test('ni texte ni valeur : la page par défaut', () => {
		expect(safeReturnTo(undefined, SITE)).toBe('/auth/profil')
		expect(safeReturnTo(42, SITE)).toBe('/auth/profil')
		expect(safeReturnTo(['/mon-espace', '/autre'], SITE)).toBe('/mon-espace')
	})

	test('une page d’authentification ou de l’API ne sert jamais de retour (pas de boucle)', () => {
		for (const raw of ['/auth/signin', '/auth/signin?callbackUrl=/x', '/auth/signup', '/auth/error', '/api/pros/me'])
			expect(safeReturnTo(raw, SITE)).toBe('/auth/profil')
	})
})

describe('urlDeConnexion', () => {
	test('la page de connexion avec la page de retour', () => {
		expect(signInUrl('/auth/profil')).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
	})
})

describe('destinationAfterSignIn : le profil encore à accueillir passe par l’accueil (ticket 296)', () => {
	test('sans lien précis, un accueil à faire mène à l’accueil', () => {
		expect(destinationAfterSignIn(DEFAULT_DASHBOARD, true)).toBe(ACCOUNT_ONBOARDING_PAGE)
	})

	test('sans lien précis, un accueil terminé (profil actif) mène à l’espace', () => {
		expect(destinationAfterSignIn(DEFAULT_DASHBOARD, false)).toBe(DEFAULT_DASHBOARD)
	})

	test('un lien précis vers une page privée est respecté, accueil à faire ou non', () => {
		for (const page of ['/auth/apercu-profil', '/auth/profil?x=1#carte-photo', '/auth/init-account']) {
			expect(destinationAfterSignIn(page, true)).toBe(page)
			expect(destinationAfterSignIn(page, false)).toBe(page)
		}
	})

	test('un lien du même site vide ou hors site retombe sur la page par défaut, puis suit la règle', () => {
		expect(destinationAfterSignIn(safeReturnTo('https://evil.example/x', SITE), true)).toBe(ACCOUNT_ONBOARDING_PAGE)
		expect(destinationAfterSignIn(safeReturnTo(undefined, SITE), true)).toBe(ACCOUNT_ONBOARDING_PAGE)
	})
})
