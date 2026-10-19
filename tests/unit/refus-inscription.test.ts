import { beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { freinDeJournal, freinDInscription } from '@/lib/auth/sign-up-rate-limits'
import { journaliserUnRefus, secondesAvantUneInscription } from '@/lib/auth/sign-up-refusal'
import { proxy } from '@/proxy'

beforeEach(() => {
	freinDInscription.vider()
	freinDeJournal.vider()
})

describe('le refus de l’inscription par le proxy (ticket 084)', () => {
	test('secondesAvantUneInscription lit le frein sans rien prendre', () => {
		for (let i = 0; i < 20; i++) expect(secondesAvantUneInscription('a')).toBeUndefined()
		for (let i = 0; i < 5; i++) expect(freinDInscription.prendre('a').autorise).toBe(true)
		expect(secondesAvantUneInscription('a')).toBeGreaterThan(0)
		// Reading again changes nothing, and another address is free.
		expect(secondesAvantUneInscription('a')).toBeGreaterThan(0)
		expect(secondesAvantUneInscription('b')).toBeUndefined()
	})

	test('le journal prend 3 lignes par heure pour une adresse et une issue, pas plus', async () => {
		const lignes: string[] = []
		const journal = async ({ type, code }: { type: string; code: string }) => {
			lignes.push(`${type}/${code}`)
		}

		for (let i = 0; i < 10; i++) await journaliserUnRefus(journal, 'a', 'sign-up', 'trop-de-tentatives')
		await journaliserUnRefus(journal, 'a', 'sign-up', 'donnees-invalides')
		await journaliserUnRefus(journal, 'b', 'sign-up', 'trop-de-tentatives')

		expect(lignes).toEqual([
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
		const cible = (r: Response) => r.headers.get('x-middleware-rewrite')
		for (let i = 0; i < 5; i++) {
			expect(cible(proxy(post('/auth/signup', '203.0.113.9')))).toBeNull()
			freinDInscription.prendre('203.0.113.9')
		}

		expect(cible(proxy(post('/auth/signup', '203.0.113.9')))).toContain('/auth/signup/throttled')
		// Not a read of the page, not another address, not another page.
		expect(cible(proxy(post('/auth/signup', '203.0.113.9', 'GET')))).toBeNull()
		expect(cible(proxy(post('/auth/signup', '203.0.113.10')))).toBeNull()
		expect(cible(proxy(post('/auth/signin', '203.0.113.9')))).toBeNull()
	})
})
