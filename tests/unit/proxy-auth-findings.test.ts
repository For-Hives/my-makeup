import { afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { MESSAGE_COOKIE } from '@/lib/auth/legacy-cookies'
import { comesFromOtherSite, relayPage } from '@/lib/auth/relay-page'
import { proxy } from '@/proxy'

/** The findings 1, 7 and 8 of ticket 223, on the proxy. Made-up host and token: only the end date of a token is read. */

const SITE = 'https://my-makeup.fr'
const token = (exp: number) => {
	const base64url = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url')
	return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ exp })}.signature`
}
const inCourse = token(Math.floor(Date.now() / 1000) + 3600)
const expired = token(Math.floor(Date.now() / 1000) - 60)

const request = (chemin: string, entetes: Record<string, string> = {}, methode = 'GET') =>
	new NextRequest(`${SITE}${chemin}`, { headers: entetes, method: methode })

afterEach(() => {
	delete process.env.CUTOVER_DATE
})

describe('constat 1 : une arrivée depuis un autre site garde la session', () => {
	const headers = (provenance: string, jetonDeSession = inCourse) => ({
		cookie: `payload-token=${jetonDeSession}`,
		'sec-fetch-site': provenance,
	})

	test.each([
		'/auth/profil',
		'/auth/apercu-profil',
		'/auth/init-account',
		'/auth/profil/photo',
	])('%s, cookie valide, cross-site : la page de relais, jamais mise en cache', async chemin => {
		const response = proxy(request(`${chemin}?a=1&b=2`, headers('cross-site')))
		expect(response.status).toBe(200)
		expect(response.headers.get('location')).toBeNull()
		expect(response.headers.get('content-type')).toContain('text/html')
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(response.headers.get('x-robots-tag')).toContain('noindex')
		const page = await response.text()
		// The navigation restarts from the site, to the very same address, query kept and escaped.
		expect(page).toContain(`url=${chemin}?a=1&amp;b=2"`)
		expect(page).toBe(relayPage(`${chemin}?a=1&b=2`))
	})

	test.each(['same-origin', 'same-site', 'none'])('Sec-Fetch-Site %s : la page répond elle-même', provenance => {
		const response = proxy(request('/auth/profil', headers(provenance)))
		expect(response.headers.get('x-middleware-next')).toBe('1')
	})

	test('sans l’en-tête (navigateur ancien, outil) : la page répond elle-même', () => {
		const response = proxy(request('/auth/profil', { cookie: `payload-token=${inCourse}` }))
		expect(response.headers.get('x-middleware-next')).toBe('1')
	})

	test('sans cookie, la redirection vers la connexion ne change pas', () => {
		const response = proxy(request('/auth/profil', { 'sec-fetch-site': 'cross-site' }))
		expect(response.status).toBe(307)
		expect(response.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fprofil`)
	})

	test('cookie expiré, cross-site : la connexion avec le message, comme avant', () => {
		const response = proxy(request('/auth/profil', headers('cross-site', expired)))
		expect(response.status).toBe(307)
		expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe('session-expiree')
	})

	test('une action serveur (POST) et les pages publiques ne passent jamais par le relais', () => {
		expect(proxy(request('/auth/profil', headers('cross-site'), 'POST')).headers.get('x-middleware-next')).toBe('1')
		for (const filePath of ['/', '/a-propos', '/auth/signin', '/auth/google/callback'])
			expect(proxy(request(filePath, headers('cross-site'))).headers.get('x-middleware-next')).toBe('1')
	})

	test('seule la valeur cross-site compte', () => {
		expect(comesFromOtherSite(new Headers({ 'sec-fetch-site': 'cross-site' }))).toBe(true)
		expect(comesFromOtherSite(new Headers({ 'sec-fetch-site': 'same-site' }))).toBe(false)
		expect(comesFromOtherSite(new Headers())).toBe(false)
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
		const response = proxy(request(chemin))
		const target = new URL(response.headers.get('x-middleware-rewrite') ?? '')
		expect(target.pathname).toBe('/unknown-page')
		expect(response.headers.get('x-robots-tag')).toBe('noindex')
	})

	test('une adresse qui se décode, accents compris, suit son chemin', () => {
		for (const filePath of ['/profil/%C3%A9l%C3%A9a/photos', '/blog/un-article/suite', '/talent/ana%20b/x'])
			expect(proxy(request(filePath)).headers.get('x-middleware-rewrite')).toBeNull()
	})

	test('les fichiers de Next ne sont pas touchés', () => {
		expect(proxy(request('/_next/static/%E0%A4%A.js')).headers.get('x-middleware-rewrite')).toBeNull()
	})

	test('sous l’API, une adresse illisible répond un 400 en JSON, pas la page 404', async () => {
		const response = proxy(request('/api/pros/%E0%A4%A'))
		expect(response.status).toBe(400)
		expect(response.headers.get('x-middleware-rewrite')).toBeNull()
		expect(await response.json()).toEqual({ errors: [{ message: 'Adresse illisible.' }] })
		expect(proxy(request('/api/pros/%C3%A9')).status).toBe(200)
	})
})

describe('constat 8 : une réponse qui efface des cookies n’est jamais gardée par un cache partagé', () => {
	const LEGACY = ['next-auth.session-token', '__Secure-next-auth.session-token']
	const withCookies = (chemin: string, noms: string[]) =>
		request(chemin, { cookie: noms.map(nom => `${nom}=valeur`).join('; ') })

	test('une page publique qui efface un cookie hérité : private, no-store', () => {
		const response = proxy(withCookies('/a-propos', LEGACY))
		expect(response.headers.getSetCookie().length).toBeGreaterThan(0)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
	})

	test('le rappel du message : private, no-store aussi, qu’on le pose ou qu’on l’efface', () => {
		const pose = proxy(withCookies('/', LEGACY))
		expect(pose.headers.getSetCookie().some(ligne => ligne.startsWith(`${MESSAGE_COOKIE}=1`))).toBe(true)
		expect(pose.headers.get('cache-control')).toBe('private, no-store')
		const erased = proxy(withCookies('/auth/signin', [MESSAGE_COOKIE]))
		expect(erased.headers.getSetCookie().some(ligne => ligne.startsWith(`${MESSAGE_COOKIE}=;`))).toBe(true)
		expect(erased.headers.get('cache-control')).toBe('private, no-store')
	})

	test('la redirection vers la connexion qui efface des cookies : private, no-store', () => {
		const response = proxy(withCookies('/auth/profil', LEGACY))
		expect(response.status).toBe(307)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
	})

	test('sans cookie à effacer, la réponse garde ses en-têtes', () => {
		const response = proxy(withCookies('/a-propos', ['payload-token']))
		expect(response.headers.getSetCookie()).toEqual([])
		expect(response.headers.get('cache-control')).toBeNull()
	})
})

describe('1022 : l’ancienne adresse de l’aperçu', () => {
	const session = { cookie: `payload-token=${inCourse}` }

	test('avec une session : une 308 en un saut vers la page du profil, sans cache', () => {
		const preview = proxy(request('/auth/apercu-profil', session))
		expect(preview.status).toBe(308)
		expect(preview.headers.get('location')).toBe(`${SITE}/auth/profil?mode=preview`)
		expect(preview.headers.get('cache-control')).toBe('private, no-store')
		expect(preview.headers.get('x-robots-tag')).toContain('noindex')
		const edit = proxy(request('/auth/apercu-profil?mode=edition', session))
		expect(edit.status).toBe(308)
		expect(edit.headers.get('location')).toBe(`${SITE}/auth/profil`)
	})

	test('sans session : la connexion, qui ramène à cette adresse, comme avant', () => {
		const response = proxy(request('/auth/apercu-profil'))
		expect(response.status).toBe(307)
		expect(response.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fapercu-profil`)
	})
})
