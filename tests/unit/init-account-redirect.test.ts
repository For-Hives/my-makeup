import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * The onboarding is gone (27/10/2026, register `sans-onboarding`): its address is frozen, and answers a permanent
 * redirect in one hop. With a session cookie it goes to her space; without, straight to the sign-in page that brings
 * her back to her space (never 308 then 307: two hops). Made-up host and cookie value: only their presence is read.
 */

const SITE = 'https://my-makeup.fr'
const SESSION = { cookie: 'payload-token=x.y.z' }
const request = (chemin: string, entetes: Record<string, string> = {}) =>
	new NextRequest(`${SITE}${chemin}`, { headers: entetes })

describe('/auth/init-account : 308 en un saut', () => {
	test('avec un cookie de session : 308 vers /auth/profil', () => {
		const response = proxy(request('/auth/init-account', SESSION))
		expect(response.status).toBe(308)
		expect(response.headers.get('location')).toBe(`${SITE}/auth/profil`)
	})

	test('sans cookie : 308 vers la connexion qui ramène à l’espace, en un seul saut', () => {
		const response = proxy(request('/auth/init-account'))
		expect(response.status).toBe(308)
		expect(response.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fprofil`)
	})

	test('la requête de l’ancienne adresse (?etape=fin) n’est pas reportée, la barre finale non plus', () => {
		const withQuery = proxy(request('/auth/init-account?etape=fin', SESSION))
		expect(withQuery.headers.get('location')).toBe(`${SITE}/auth/profil`)
		const withSlash = proxy(request('/auth/init-account/', SESSION))
		expect(withSlash.status).toBe(308)
		expect(withSlash.headers.get('location')).toBe(`${SITE}/auth/profil`)
	})

	test('une barre finale sur une page de l’espace garde sa requête, comme partout (la règle de forme)', () => {
		const withSession = proxy(request('/auth/apercu-profil/?mode=edition', SESSION))
		expect(withSession.status).toBe(308)
		expect(withSession.headers.get('location')).toBe(`${SITE}/auth/apercu-profil?mode=edition`)
	})

	test('la destination, avec une session, ne redirige pas elle-même', () => {
		const next = proxy(request('/auth/profil', SESSION))
		expect(next.headers.get('location')).toBeNull()
	})
})
