import { beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { authLogRateLimit, signUpRateLimit } from '@/lib/auth/sign-up-rate-limits'
import { logRefusal, secondsBeforeSignUp } from '@/lib/auth/sign-up-refusal'
import { proxy } from '@/proxy'

beforeEach(() => {
	signUpRateLimit.vider()
	authLogRateLimit.vider()
})

describe('le refus de l’inscription par le proxy (ticket 084)', () => {
	test('secondesAvantUneInscription lit le frein sans rien prendre', () => {
		for (let i = 0; i < 20; i++) expect(secondsBeforeSignUp('a')).toBeUndefined()
		for (let i = 0; i < 5; i++) expect(signUpRateLimit.prendre('a').autorise).toBe(true)
		expect(secondsBeforeSignUp('a')).toBeGreaterThan(0)
		// Reading again changes nothing, and another address is free.
		expect(secondsBeforeSignUp('a')).toBeGreaterThan(0)
		expect(secondsBeforeSignUp('b')).toBeUndefined()
	})

	test('le journal prend 3 lignes par heure pour une adresse et une issue, pas plus', async () => {
		const lines: string[] = []
		const log = async ({ type, code }: { type: string; code: string }) => {
			lines.push(`${type}/${code}`)
		}

		for (let i = 0; i < 10; i++) await logRefusal(log, 'a', 'sign-up', 'trop-de-tentatives')
		await logRefusal(log, 'a', 'sign-up', 'donnees-invalides')
		await logRefusal(log, 'b', 'sign-up', 'trop-de-tentatives')

		expect(lines).toEqual([
			'sign-up/trop-de-tentatives',
			'sign-up/trop-de-tentatives',
			'sign-up/trop-de-tentatives',
			'sign-up/donnees-invalides',
			'sign-up/trop-de-tentatives',
		])
	})

	const post = (chemin: string, adresse: string, methode = 'POST') =>
		new NextRequest(`http://localhost:3283${chemin}`, { method: methode, headers: { 'x-forwarded-for': adresse } })

	test('le proxy envoie la sixième inscription de l’heure à la route qui répond 429, et elle seule', () => {
		const target = (r: Response) => r.headers.get('x-middleware-rewrite')
		for (let i = 0; i < 5; i++) {
			expect(target(proxy(post('/auth/signup', '203.0.113.9')))).toBeNull()
			signUpRateLimit.prendre('203.0.113.9')
		}

		expect(target(proxy(post('/auth/signup', '203.0.113.9')))).toContain('/auth/signup/throttled')
		// Not a read of the page, not another address, not another page.
		expect(target(proxy(post('/auth/signup', '203.0.113.9', 'GET')))).toBeNull()
		expect(target(proxy(post('/auth/signup', '203.0.113.10')))).toBeNull()
		expect(target(proxy(post('/auth/signin', '203.0.113.9')))).toBeNull()
	})
})
