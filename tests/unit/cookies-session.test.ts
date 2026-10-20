import { describe, expect, test } from 'bun:test'
import { sessionCookies } from '@/collections/Pros'

describe('cookiesDeSession : les attributs du cookie de session (I09)', () => {
	test('Secure et SameSite=Lax en production', () => {
		expect(sessionCookies(true)).toEqual({ sameSite: 'Lax', secure: true })
	})
	test('pas de Secure hors production (http en local), SameSite=Lax quand même', () => {
		expect(sessionCookies(false)).toEqual({ sameSite: 'Lax', secure: false })
	})
})
