/**
 * The pages of the results, the brake and the failing read (ticket 100; plan 02 U18, E41 and I30 on
 * the logic). Unit tests: no database, no server. The page is tests/e2e/recherche-mot-cle.spec.ts.
 */

import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { PER_PAGE, paginate, sectionsOfPage } from '@/lib/search/pagination'
import { rateLimitSearch, SEARCHES_PER_MINUTE } from '@/lib/search/rate-limit'
import { READ_TIMEOUT_MS, readWithoutBlocking } from '@/lib/search/read'
import { proxy } from '@/proxy'

describe('U18 et E41 : les pages de 20, sans doublon', () => {
	const list = Array.from({ length: 45 }, (_, i) => `p${i + 1}`)

	test('20 par page, la dernière garde le reste', () => {
		expect(PER_PAGE).toBe(20)
		expect(paginate(list, 1)).toMatchObject({ page: 1, pages: 3, total: 45, premier: 1 })
		expect(paginate(list, 1).elements).toHaveLength(20)
		expect(paginate(list, 3).elements).toEqual(['p41', 'p42', 'p43', 'p44', 'p45'])
	})

	test('les pages mises bout à bout redonnent la liste, chaque profil une seule fois', () => {
		const read = [1, 2, 3].flatMap(page => paginate(list, page).elements)
		expect(read).toEqual(list)
		expect(new Set(read).size).toBe(read.length)
	})

	test('une page hors bornes est ramenée dans les bornes ; une liste vide est une page vide', () => {
		expect(paginate(list, 99).page).toBe(3)
		expect(paginate(list, 0).page).toBe(1)
		expect(paginate(list, Number.NaN).page).toBe(1)
		expect(paginate([], 4)).toEqual({ elements: [], page: 1, pages: 1, total: 0, premier: 1 })
	})

	test('une page à cheval sur deux sections montre la fin de l’une et le début de l’autre, sans rien répéter', () => {
		// 12 of the city, 15 of the département, 10 of the rest: the pages of 20 cut the second section.
		const lengths = [12, 15, 10]
		const all = Array.from({ length: 37 }, (_, i) => i)
		const seen: number[] = []
		for (const page of [1, 2]) {
			const p = paginate(all, page)
			const parts = sectionsOfPage(p, lengths)
			expect(parts.flat()).toEqual(p.elements)
			seen.push(...parts.flat())
		}
		expect(seen).toEqual(all)
		expect(sectionsOfPage(paginate(all, 1), lengths).map(part => part.length)).toEqual([12, 8, 0])
		expect(sectionsOfPage(paginate(all, 2), lengths).map(part => part.length)).toEqual([0, 7, 10])
	})
})

const request = (chemin: string, adresse?: string, methode = 'GET') =>
	new NextRequest(`http://localhost:3100${chemin}`, {
		method: methode,
		headers: adresse ? { 'x-forwarded-for': adresse } : {},
	})

const rateLimitAlt = (limite: number) =>
	createRateLimit({ nom: `essai-recherche-${crypto.randomUUID()}`, limite, fenetreMs: 60_000 })

describe('le frein de la recherche (I30 côté unité)', () => {
	test('la 61e requête d’une adresse est refusée en 429, en français, avec Retry-After', () => {
		const rateLimit = rateLimitAlt(SEARCHES_PER_MINUTE)
		const headers = new Headers({ 'x-forwarded-for': '192.0.2.1' })
		for (let i = 0; i < SEARCHES_PER_MINUTE; i += 1)
			expect(
				rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: headers }, rateLimit),
				`requête ${i + 1}`
			).toBeNull()
		const refused = rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: headers }, rateLimit)
		expect(refused?.status).toBe(429)
		expect(refused?.corps).toContain('Trop de recherches')
		expect(refused?.corps).toContain('lang="fr"')
		expect(Number(refused?.entetes['Retry-After'])).toBeGreaterThan(0)
		expect(Number(refused?.entetes['Retry-After'])).toBeLessThanOrEqual(60)
		expect(refused?.entetes['Cache-Control']).toBe('no-store')
	})

	test('une autre adresse passe, et la minute écoulée libère l’adresse freinée', () => {
		const rateLimit = rateLimitAlt(3)
		const a = new Headers({ 'x-forwarded-for': '192.0.2.1' })
		const b = new Headers({ 'x-forwarded-for': '192.0.2.2' })
		for (let i = 0; i < 3; i += 1) rateLimit.prendre('192.0.2.1')
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: a }, rateLimit)?.status).toBe(429)
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: b }, rateLimit)).toBeNull()
		expect(rateLimit.prendre('192.0.2.1', Date.now() + 61_000)).toEqual({ autorise: true })
	})

	test('une requête qui n’est pas passée par le proxy n’est jamais freinée : pas d’en-tête, adresse locale écrite par Next', () => {
		const rateLimit = rateLimitAlt(1)
		for (const url of [undefined, '127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1', '[::1]'])
			for (let i = 0; i < 5; i += 1)
				expect(
					rateLimitSearch(
						{ chemin: '/search', methode: 'GET', entetes: new Headers(url ? { 'x-forwarded-for': url } : {}) },
						rateLimit
					),
					String(url)
				).toBeNull()
		// An address that is not local is counted at once.
		const remote = new Headers({ 'x-forwarded-for': '203.0.113.9' })
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: remote }, rateLimit)).toBeNull()
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: remote }, rateLimit)?.status).toBe(429)
	})

	test('seule la recherche est comptée : pas une autre page, un envoi, un préchargement, ni une requête sans proxy', () => {
		const rateLimit = rateLimitAlt(1)
		const headers = new Headers({ 'x-forwarded-for': '192.0.2.3' })
		const preload = new Headers({ 'x-forwarded-for': '192.0.2.3', 'next-router-prefetch': '1' })
		for (let i = 0; i < 5; i += 1) {
			expect(rateLimitSearch({ chemin: '/', methode: 'GET', entetes: headers }, rateLimit)).toBeNull()
			expect(rateLimitSearch({ chemin: '/profil/ana', methode: 'GET', entetes: headers }, rateLimit)).toBeNull()
			expect(rateLimitSearch({ chemin: '/search', methode: 'POST', entetes: headers }, rateLimit)).toBeNull()
			expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: preload }, rateLimit)).toBeNull()
			expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: new Headers() }, rateLimit)).toBeNull()
		}
		// None of those took a place: the first real search still passes, the second is refused.
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: headers }, rateLimit)).toBeNull()
		expect(rateLimitSearch({ chemin: '/search', methode: 'GET', entetes: headers }, rateLimit)?.status).toBe(429)
	})

	test('par le proxy : la 61e recherche est refusée, l’accueil et un profil restent servis, une autre adresse passe', async () => {
		const url = '198.51.100.61'
		for (let i = 0; i < SEARCHES_PER_MINUTE; i += 1)
			expect(proxy(request(`/search?city=Annecy&page=${i + 1}`, url)).status, `requête ${i + 1}`).not.toBe(429)
		const refused = proxy(request('/search?city=Annecy', url))
		expect(refused.status).toBe(429)
		expect(refused.headers.get('content-type')).toContain('text/html')
		expect(refused.headers.get('retry-after')).not.toBeNull()
		expect(refused.headers.get('x-robots-tag')).toBe('noindex, follow')
		expect(await refused.text()).toContain('Trop de recherches')
		for (const filePath of ['/', '/profil/ana', '/blog', '/talent/mariee'])
			expect(proxy(request(filePath, url)).status, filePath).not.toBe(429)
		expect(proxy(request('/search?city=Annecy', '198.51.100.62')).status).not.toBe(429)
	})

	test('la barre finale est redirigée avant le frein : elle ne prend pas de place', () => {
		const url = '198.51.100.63'
		for (let i = 0; i < 10; i += 1) expect(proxy(request('/search/?city=Annecy', url)).status).toBe(308)
		for (let i = 0; i < SEARCHES_PER_MINUTE; i += 1)
			expect(proxy(request('/search?city=Annecy', url)).status).not.toBe(429)
	})
})

function logAlt() {
	const lines: string[] = []
	const before = console.error
	console.error = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '))
	}
	return {
		lignes: lines,
		restaurer: () => {
			console.error = before
		},
	}
}

describe('la lecture qui ne bloque jamais (ticket 100)', () => {
	test('une lecture qui réussit rend sa valeur', async () => {
		expect(await readWithoutBlocking(async () => 42)).toEqual({ reussie: true, valeur: 42 })
	})

	test('une lecture qui échoue rend un échec sans lever, et ne journalise que la classe de l’erreur', async () => {
		const log = logAlt()
		const reading = await readWithoutBlocking(async () => {
			throw new Error('connexion refusée : requête pour « mariage Annecy »')
		})
		log.restaurer()
		expect(reading).toEqual({ reussie: false })
		expect(log.lignes).toHaveLength(1)
		expect(log.lignes.join(' ')).not.toContain('mariage')
		expect(log.lignes.join(' ')).not.toContain('Annecy')
	})

	test('une lecture qui ne répond pas est coupée au délai, et le délai tient sous les 10 secondes du ticket', async () => {
		const log = logAlt()
		const startedAt = performance.now()
		const reading = await readWithoutBlocking(() => new Promise<never>(() => {}), 50)
		log.restaurer()
		expect(reading).toEqual({ reussie: false })
		expect(performance.now() - startedAt).toBeLessThan(1000)
		expect(READ_TIMEOUT_MS).toBeLessThan(10_000)
	})
})
