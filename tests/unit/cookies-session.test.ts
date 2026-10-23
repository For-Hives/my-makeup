import { describe, expect, test } from 'bun:test'
import { generatePayloadCookie } from 'payload'
import { ADMIN_SESSION_DURATION_S, Admins, adminSessionCookies } from '@/collections/Admins'
import { sessionCookies } from '@/collections/Pros'

describe('cookiesDeSession : les attributs du cookie de session (I09)', () => {
	test('Secure et SameSite=Lax en production', () => {
		expect(sessionCookies(true)).toEqual({ sameSite: 'Lax', secure: true })
	})
	test('pas de Secure hors production (http en local), SameSite=Lax quand même', () => {
		expect(sessionCookies(false)).toEqual({ sameSite: 'Lax', secure: false })
	})
})

describe('cookie de session des comptes admin (ticket 272)', () => {
	const cookieOf = (production: boolean) =>
		generatePayloadCookie({
			collectionAuthConfig: {
				cookies: { ...adminSessionCookies(production), domain: 'example.test' },
				tokenExpiration: ADMIN_SESSION_DURATION_S,
			} as never,
			cookiePrefix: 'payload',
			token: 'jeton-fictif',
		})

	test('en production : Secure, HttpOnly, SameSite=Lax, 8 heures', () => {
		const cookie = cookieOf(true)
		expect(cookie).toContain('Secure=true')
		expect(cookie).toContain('HttpOnly=true')
		expect(cookie).toContain('SameSite=Lax')
		const expires = new Date(/Expires=([^;]+)/.exec(cookie)?.[1] ?? '').getTime()
		expect(Math.abs(expires - Date.now() - 8 * 3600 * 1000)).toBeLessThan(5000)
	})
	test('hors production : pas de Secure (le banc est en http), le reste ne change pas', () => {
		const cookie = cookieOf(false)
		expect(cookie).not.toContain('Secure=true')
		expect(cookie).toContain('HttpOnly=true')
		expect(cookie).toContain('SameSite=Lax')
	})
	test('la collection admins applique ce réglage et garde 8 heures', () => {
		expect(Admins.auth).toMatchObject({
			cookies: adminSessionCookies(process.env.NODE_ENV === 'production'),
			tokenExpiration: 8 * 3600,
		})
	})
})
