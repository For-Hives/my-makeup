import { afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { COOKIE_DE_MESSAGE } from '@/lib/auth/cookies-herites'
import { pageDeRelais, venueDUnAutreSite } from '@/lib/auth/page-de-relais'
import { proxy } from '@/proxy'

/** The findings 1, 7 and 8 of ticket 223, on the proxy. Made-up host and token: only the end date of a token is read. */

const SITE = 'https://my-makeup.fr'
const jeton = (exp: number) => {
	const base64url = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url')
	return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ exp })}.signature`
}
const enCours = jeton(Math.floor(Date.now() / 1000) + 3600)
const expire = jeton(Math.floor(Date.now() / 1000) - 60)

const requete = (chemin: string, entetes: Record<string, string> = {}, methode = 'GET') =>
	new NextRequest(`${SITE}${chemin}`, { headers: entetes, method: methode })

afterEach(() => {
	delete process.env.BASCULE_LE
})

describe('constat 1 : une arrivée depuis un autre site garde la session', () => {
	const entetes = (provenance: string, jetonDeSession = enCours) => ({
		cookie: `payload-token=${jetonDeSession}`,
		'sec-fetch-site': provenance,
	})

	test.each([
		'/auth/profil',
		'/auth/apercu-profil',
		'/auth/init-account',
		'/auth/profil/photo',
	])('%s, cookie valide, cross-site : la page de relais, jamais mise en cache', async chemin => {
		const reponse = proxy(requete(`${chemin}?a=1&b=2`, entetes('cross-site')))
		expect(reponse.status).toBe(200)
		expect(reponse.headers.get('location')).toBeNull()
		expect(reponse.headers.get('content-type')).toContain('text/html')
		expect(reponse.headers.get('cache-control')).toBe('private, no-store')
		expect(reponse.headers.get('x-robots-tag')).toContain('noindex')
		const page = await reponse.text()
		// The navigation restarts from the site, to the very same address, query kept and escaped.
		expect(page).toContain(`url=${chemin}?a=1&amp;b=2"`)
		expect(page).toBe(pageDeRelais(`${chemin}?a=1&b=2`))
	})

	test.each(['same-origin', 'same-site', 'none'])('Sec-Fetch-Site %s : la page répond elle-même', provenance => {
		const reponse = proxy(requete('/auth/profil', entetes(provenance)))
		expect(reponse.headers.get('x-middleware-next')).toBe('1')
	})

	test('sans l’en-tête (navigateur ancien, outil) : la page répond elle-même', () => {
		const reponse = proxy(requete('/auth/profil', { cookie: `payload-token=${enCours}` }))
		expect(reponse.headers.get('x-middleware-next')).toBe('1')
	})

	test('sans cookie, la redirection vers la connexion ne change pas', () => {
		const reponse = proxy(requete('/auth/profil', { 'sec-fetch-site': 'cross-site' }))
		expect(reponse.status).toBe(307)
		expect(reponse.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fprofil`)
	})

	test('cookie expiré, cross-site : la connexion avec le message, comme avant', () => {
		const reponse = proxy(requete('/auth/profil', entetes('cross-site', expire)))
		expect(reponse.status).toBe(307)
		expect(new URL(reponse.headers.get('location') ?? '').searchParams.get('error')).toBe('session-expiree')
	})

	test('une action serveur (POST) et les pages publiques ne passent jamais par le relais', () => {
		expect(proxy(requete('/auth/profil', entetes('cross-site'), 'POST')).headers.get('x-middleware-next')).toBe('1')
		for (const chemin of ['/', '/profil/ana', '/auth/signin', '/auth/google/retour'])
			expect(proxy(requete(chemin, entetes('cross-site'))).headers.get('x-middleware-next')).toBe('1')
	})

	test('seule la valeur cross-site compte', () => {
		expect(venueDUnAutreSite(new Headers({ 'sec-fetch-site': 'cross-site' }))).toBe(true)
		expect(venueDUnAutreSite(new Headers({ 'sec-fetch-site': 'same-site' }))).toBe(false)
		expect(venueDUnAutreSite(new Headers())).toBe(false)
	})
})

describe('constat 7 : une adresse au pourcentage mal formé répond la page 404 du site', () => {
	test.each([
		'/profil/%E0%A4%A',
		'/talent/%E0%A4%A',
		'/blog/%E0%A4%A',
		'/%',
		'/blog/a%zz',
	])('%s est réécrite vers une adresse qui n’existe pas', chemin => {
		const reponse = proxy(requete(chemin))
		const cible = new URL(reponse.headers.get('x-middleware-rewrite') ?? '')
		expect(cible.pathname).toBe('/introuvable-adresse-illisible')
		expect(reponse.headers.get('x-robots-tag')).toBe('noindex')
	})

	test('une adresse qui se décode, accents compris, suit son chemin', () => {
		for (const chemin of ['/profil/%C3%A9l%C3%A9a', '/blog/un-article', '/talent/ana%20b'])
			expect(proxy(requete(chemin)).headers.get('x-middleware-rewrite')).toBeNull()
	})

	test('l’API et les fichiers de Next ne sont pas touchés', () => {
		for (const chemin of ['/api/pros/%E0%A4%A', '/_next/static/%E0%A4%A.js'])
			expect(proxy(requete(chemin)).headers.get('x-middleware-rewrite')).toBeNull()
	})
})

describe('constat 8 : une réponse qui efface des cookies n’est jamais gardée par un cache partagé', () => {
	const HERITES = ['next-auth.session-token', '__Secure-next-auth.session-token']
	const avecCookies = (chemin: string, noms: string[]) =>
		requete(chemin, { cookie: noms.map(nom => `${nom}=valeur`).join('; ') })

	test('une page publique qui efface un cookie hérité : private, no-store', () => {
		const reponse = proxy(avecCookies('/profil/ana', HERITES))
		expect(reponse.headers.getSetCookie().length).toBeGreaterThan(0)
		expect(reponse.headers.get('cache-control')).toBe('private, no-store')
	})

	test('le rappel du message : private, no-store aussi, qu’on le pose ou qu’on l’efface', () => {
		const pose = proxy(avecCookies('/', HERITES))
		expect(pose.headers.getSetCookie().some(ligne => ligne.startsWith(`${COOKIE_DE_MESSAGE}=1`))).toBe(true)
		expect(pose.headers.get('cache-control')).toBe('private, no-store')
		const efface = proxy(avecCookies('/auth/signin', [COOKIE_DE_MESSAGE]))
		expect(efface.headers.getSetCookie().some(ligne => ligne.startsWith(`${COOKIE_DE_MESSAGE}=;`))).toBe(true)
		expect(efface.headers.get('cache-control')).toBe('private, no-store')
	})

	test('la redirection vers la connexion qui efface des cookies : private, no-store', () => {
		const reponse = proxy(avecCookies('/auth/profil', HERITES))
		expect(reponse.status).toBe(307)
		expect(reponse.headers.get('cache-control')).toBe('private, no-store')
	})

	test('sans cookie à effacer, la réponse garde ses en-têtes', () => {
		const reponse = proxy(avecCookies('/profil/ana', ['payload-token']))
		expect(reponse.headers.getSetCookie()).toEqual([])
		expect(reponse.headers.get('cache-control')).toBeNull()
	})
})
