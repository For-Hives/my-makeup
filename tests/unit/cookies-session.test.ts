import { describe, expect, test } from 'bun:test'
import { cookiesDeSession } from '@/collections/Pros'

describe('cookiesDeSession : les attributs du cookie de session (I09)', () => {
	test('Secure et SameSite=Lax en production', () => {
		expect(cookiesDeSession(true)).toEqual({ sameSite: 'Lax', secure: true })
	})
	test('pas de Secure hors production (http en local), SameSite=Lax quand même', () => {
		expect(cookiesDeSession(false)).toEqual({ sameSite: 'Lax', secure: false })
	})
})
