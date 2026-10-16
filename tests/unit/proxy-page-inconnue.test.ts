import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { proxy, proxyDeLAdresseInconnue } from '@/proxy'

/** Ticket 231, on the proxy: the lookup is made only for a plain pass-through, and a failure lets the page answer. */

const SITE = 'https://my-makeup.fr'
const requete = (chemin: string, methode = 'GET', entetes: Record<string, string> = {}) =>
	new NextRequest(`${SITE}${chemin}`, { method: methode, headers: entetes })

/** The proxy as Next calls it, with a made-up lookup in place of the database. */
async function repondre(chemin: string, existe: (famille: string, segment: string) => Promise<boolean>, entetes = {}) {
	const demande = requete(chemin, 'GET', entetes)
	const premiere = proxy(demande)
	// A plain pass-through is the one answer the lookup may replace.
	const adresse = chemin.split('/')
	return proxyDeLAdresseInconnue(
		demande,
		await premiere,
		{ famille: adresse[1] as 'profil' | 'talent' | 'blog', segment: decodeURIComponent(adresse[2] ?? '') },
		existe
	)
}

describe('une adresse inconnue sous /profil, /talent ou /blog', () => {
	test.each([
		'/profil/inconnu',
		'/talent/inconnu',
		'/blog/inconnu',
	])('%s est réécrite vers la 404 du site', async chemin => {
		const reponse = await repondre(chemin, async () => false)
		expect(new URL(reponse.headers.get('x-middleware-rewrite') ?? '').pathname).toBe('/introuvable-adresse-illisible')
		expect(reponse.headers.get('x-robots-tag')).toBe('noindex')
	})

	test('une page qui existe passe jusqu’à la page', async () => {
		const reponse = await repondre('/talent/existe', async () => true)
		expect(reponse.headers.get('x-middleware-rewrite')).toBeNull()
		expect(reponse.headers.get('x-middleware-next')).toBe('1')
	})

	test('une lecture qui échoue laisse la page répondre', async () => {
		const reponse = await repondre('/blog/inconnu', async () => {
			throw new Error('base muette')
		})
		expect(reponse.headers.get('x-middleware-rewrite')).toBeNull()
		expect(reponse.headers.get('x-middleware-next')).toBe('1')
	})

	test('les cookies du nettoyage de l’ancienne authentification suivent la réécriture', async () => {
		const reponse = await repondre('/profil/inconnu', async () => false, { cookie: 'next-auth.session-token=x' })
		expect(reponse.headers.get('x-middleware-rewrite')).not.toBeNull()
		expect(reponse.cookies.get('next-auth.session-token')?.value).toBe('')
	})
})

describe('ce que le proxy envoie à la lecture', () => {
	test('une adresse à un seul segment, en GET, sans réponse propre : une promesse', () => {
		expect(proxy(requete('/talent/x'))).toBeInstanceOf(Promise)
		expect(proxy(requete('/profil/x', 'HEAD'))).toBeInstanceOf(Promise)
	})

	test.each([
		['/profil/x/', 'GET'],
		['/profil/x', 'POST'],
		['/a-propos', 'GET'],
		['/blog/a/b', 'GET'],
		['/profil/%E0%A4%A', 'GET'],
	])('%s (%s) répond tout de suite, sans lecture', (chemin, methode) => {
		expect(proxy(requete(chemin, methode))).not.toBeInstanceOf(Promise)
	})
})
