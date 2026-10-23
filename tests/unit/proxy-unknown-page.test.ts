import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import type { PageAnswer } from '@/lib/urls/unknown-page'
import { proxy, unknownAddressProxy } from '@/proxy'

/** Ticket 231, on the proxy: the lookup is made only for a plain pass-through, and a failure lets the page answer. */

const SITE = 'https://my-makeup.fr'
const requestAlt = (chemin: string, methode = 'GET', entetes: Record<string, string> = {}) =>
	new NextRequest(`${SITE}${chemin}`, { method: methode, headers: entetes })

/** The proxy as Next calls it, with a made-up lookup in place of the database. */
async function respond(
	chemin: string,
	existe: (famille: string, segment: string) => Promise<PageAnswer>,
	entetes = {}
) {
	const request = requestAlt(chemin, 'GET', entetes)
	const firstOne = proxy(request)
	// A plain pass-through is the one answer the lookup may replace.
	const url = chemin.split('/')
	return unknownAddressProxy(
		request,
		await firstOne,
		{ famille: url[1] as 'profil' | 'talent' | 'blog', segment: decodeURIComponent(url[2] ?? '') },
		existe
	)
}

describe('une adresse inconnue sous /profil, /talent ou /blog', () => {
	test.each([
		'/profil/inconnu',
		'/talent/inconnu',
		'/blog/inconnu',
	])('%s est réécrite vers la 404 du site', async chemin => {
		const response = await respond(chemin, async () => false)
		expect(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname).toBe('/unknown-page')
		expect(response.headers.get('x-robots-tag')).toBe('noindex')
	})

	test('l’ancienne adresse d’un profil répond un seul 308 vers son slug, sans passer par la page (269)', async () => {
		const response = await respond('/profil/Zoe%20Lefevre?utm=1', async () => ({ vers: '/profil/zoe-lefevre' }))
		expect(response.status).toBe(308)
		const location = response.headers.get('location') ?? ''
		expect(location).not.toContain(',')
		expect(new URL(location).pathname).toBe('/profil/zoe-lefevre')
		expect(new URL(location).search).toBe('?utm=1')
	})

	test('une page qui existe passe jusqu’à la page', async () => {
		const response = await respond('/talent/existe', async () => true)
		expect(response.headers.get('x-middleware-rewrite')).toBeNull()
		expect(response.headers.get('x-middleware-next')).toBe('1')
	})

	test('une lecture qui échoue laisse la page répondre', async () => {
		const response = await respond('/blog/inconnu', async () => {
			throw new Error('base muette')
		})
		expect(response.headers.get('x-middleware-rewrite')).toBeNull()
		expect(response.headers.get('x-middleware-next')).toBe('1')
	})

	test('les cookies du nettoyage de l’ancienne authentification suivent la réécriture', async () => {
		const response = await respond('/profil/inconnu', async () => false, { cookie: 'next-auth.session-token=x' })
		expect(response.headers.get('x-middleware-rewrite')).not.toBeNull()
		expect(response.cookies.get('next-auth.session-token')?.value).toBe('')
	})
})

describe('ce que le proxy envoie à la lecture', () => {
	test('une adresse à un seul segment, en GET, sans réponse propre : une promesse', () => {
		expect(proxy(requestAlt('/talent/x'))).toBeInstanceOf(Promise)
		expect(proxy(requestAlt('/profil/x', 'HEAD'))).toBeInstanceOf(Promise)
	})

	test.each([
		['/profil/x/', 'GET'],
		['/profil/x', 'POST'],
		['/a-propos', 'GET'],
		['/blog/a/b', 'GET'],
		['/profil/%E0%A4%A', 'GET'],
	])('%s (%s) répond tout de suite, sans lecture', (chemin, methode) => {
		expect(proxy(requestAlt(chemin, methode))).not.toBeInstanceOf(Promise)
	})
})
