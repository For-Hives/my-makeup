import { afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import {
	activeCleanup,
	cleanupEnd,
	cleanupPlan,
	clearingCookie,
	legacyCookiesPresent,
	MESSAGE_COOKIE,
	MESSAGE_HEADER,
	pathWithoutCleanup,
	setAttributes,
} from '@/lib/auth/legacy-cookies'
import { EnvError, parseServerEnv } from '@/lib/env'
import { proxy } from '@/proxy'

const SITE = 'https://my-makeup.fr'
const LEGACY = [
	'__Secure-next-auth.session-token',
	'__Secure-next-auth.session-token.0',
	'__Secure-next-auth.session-token.1',
	'__Host-next-auth.csrf-token',
	'__Secure-next-auth.callback-url',
]

describe('U65 : la liste des cookies hérités effacés', () => {
	test('la session (et ses morceaux), le jeton CSRF et l’adresse de retour, avec ou sans préfixe', () => {
		const names = [
			...LEGACY,
			'next-auth.session-token',
			'next-auth.session-token.12',
			'next-auth.csrf-token',
			'next-auth.callback-url',
		]
		expect(legacyCookiesPresent(names)).toEqual(names)
	})

	test('rien d’autre : ni le cookie de Payload, ni un nom voisin', () => {
		const other = [
			'payload-token',
			'next-auth.session-tokens',
			'next-auth.session-token.',
			'next-auth.session-token.x',
			'x-next-auth.csrf-token',
			'next-auth.pkce.code_verifier',
			'__Secure-payload-token',
			'mm-signed-out',
		]
		expect(legacyCookiesPresent(other)).toEqual([])
	})
})

describe('U66 : chaque effacement répète les attributs de la pose', () => {
	test.each(LEGACY)('%s : Max-Age=0, même Path, Secure, SameSite, pas de Domain', nom => {
		const pose = setAttributes(nom)
		const erasure = clearingCookie(nom)
		expect(erasure).toMatchObject({
			name: nom,
			value: '',
			maxAge: 0,
			path: pose.path,
			secure: pose.secure,
			sameSite: pose.sameSite,
			httpOnly: pose.httpOnly,
		})
		expect(erasure).not.toHaveProperty('domain')
		expect(erasure.expires.getTime()).toBe(0)
	})

	test('les valeurs de NextAuth v4 : Path=/, HttpOnly, Lax, Secure avec les préfixes seulement', () => {
		for (const name of LEGACY)
			expect(setAttributes(name)).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax', secure: true })
		expect(setAttributes('next-auth.session-token').secure).toBe(false)
		expect(setAttributes('next-auth.csrf-token').secure).toBe(false)
	})
})

describe('la durée de 90 jours, comptée depuis la date de bascule', () => {
	test('fin = bascule + 90 jours', () => {
		expect(cleanupEnd('2027-02-01')?.toISOString()).toBe('2027-05-02T00:00:00.000Z')
	})

	test('actif jusqu’à la fin, inactif ensuite', () => {
		expect(activeCleanup(new Date('2027-05-01T23:59:59Z'), '2027-02-01')).toBe(true)
		expect(activeCleanup(new Date('2027-05-02T00:00:00Z'), '2027-02-01')).toBe(false)
	})

	test('la date règle la fin : une autre date, une autre fin', () => {
		expect(activeCleanup(new Date('2027-05-02T00:00:00Z'), '2027-03-01')).toBe(true)
	})

	test('sans date, le nettoyage est actif (sans fin) ; une date illisible ne compte pas', () => {
		expect(activeCleanup(new Date('2030-01-01T00:00:00Z'), undefined)).toBe(true)
		expect(cleanupEnd('2027-02-30')).toBeUndefined()
		expect(cleanupEnd('demain')).toBeUndefined()
	})

	test('CUTOVER_DATE illisible arrête le démarrage, par son nom', () => {
		const base = { DATABASE_URI: 'postgres://u:p@127.0.0.1:5432/db', PAYLOAD_SECRET: 'x'.repeat(32) }
		expect(() => parseServerEnv({ ...base, CUTOVER_DATE: '2027-02-01' })).not.toThrow()
		expect(() => parseServerEnv({ ...base, CUTOVER_DATE: '' })).not.toThrow()
		try {
			parseServerEnv({ ...base, CUTOVER_DATE: '01/02/2027' })
			throw new Error('should have thrown')
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError)
			expect((error as EnvError).variables).toEqual(['CUTOVER_DATE'])
			expect((error as EnvError).message).not.toContain('01/02/2027')
		}
	})
})

describe('U64 : le back-office, l’API et les fichiers statiques ne sont pas touchés', () => {
	test.each([
		'/admin',
		'/admin/collections/pros',
		'/api/pros/me',
		'/_next/static/a.js',
		'/favicon.ico',
		'/robots.txt',
		'/sitemap.xml',
		'/img/logo.webp',
	])('%s', chemin => {
		expect(pathWithoutCleanup(chemin)).toBe(true)
		const plan = cleanupPlan({
			chemin,
			noms: LEGACY,
			prechargement: false,
			maintenant: new Date(),
			basculeLe: undefined,
		})
		expect(plan.aEffacer).toEqual([])
	})

	test.each([
		'/',
		'/a-propos',
		'/blog/un-article',
		'/auth/signin',
		'/auth/profil',
		'/administration',
	])('%s est une page du site', chemin => {
		expect(pathWithoutCleanup(chemin)).toBe(false)
	})
})

const request = (chemin: string, cookies: string[], entetes: Record<string, string> = {}) =>
	new NextRequest(`${SITE}${chemin}`, {
		headers: { cookie: cookies.map(nom => `${nom}=valeur`).join('; '), ...entetes },
	})

const setCookies = (reponse: Response) => reponse.headers.getSetCookie()

describe('le proxy : le nettoyage à la première requête', () => {
	const before = process.env.CUTOVER_DATE
	afterEach(() => {
		if (before === undefined) delete process.env.CUTOVER_DATE
		else process.env.CUTOVER_DATE = before
	})

	test('une page du site : chaque cookie hérité expiré, un rappel posé, pas de redirection', () => {
		delete process.env.CUTOVER_DATE
		const response = proxy(request('/a-propos', LEGACY))
		expect(response.status).toBe(200)
		const lines = setCookies(response)
		for (const name of LEGACY) {
			const line = lines.find(l => l.startsWith(`${name}=;`))
			expect(line).toBeDefined()
			expect(line).toContain('Max-Age=0')
			expect(line).toContain('Path=/')
			expect(line).toContain('SameSite=lax')
			expect(line).not.toContain('Domain')
		}
		expect(lines.find(l => l.startsWith('__Host-next-auth.csrf-token='))).toContain('Secure')
		expect(lines.find(l => l.startsWith(`${MESSAGE_COOKIE}=1`))).toContain('HttpOnly')
	})

	test('la connexion directement : le message est dû tout de suite, sans rappel', () => {
		delete process.env.CUTOVER_DATE
		const response = proxy(request('/auth/signin', LEGACY))
		expect(response.status).toBe(200)
		expect(response.headers.get('x-middleware-request-x-mm-signed-out')).toBe('1')
		expect(setCookies(response).some(l => l.startsWith(`${MESSAGE_COOKIE}=1`))).toBe(false)
	})

	test('une page privée : une seule redirection vers la connexion, les cookies expirés au passage (pas de boucle)', () => {
		delete process.env.CUTOVER_DATE
		const response = proxy(request('/auth/profil', LEGACY))
		expect(response.status).toBe(307)
		expect(response.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fprofil`)
		expect(setCookies(response).filter(l => l.includes('Max-Age=0'))).toHaveLength(LEGACY.length)
		// The next request carries no old cookie any more: the sign-in page answers, with the reminder.
		const suite = proxy(request('/auth/signin', [MESSAGE_COOKIE]))
		expect(suite.status).toBe(200)
		expect(suite.headers.get('x-middleware-request-x-mm-signed-out')).toBe('1')
	})

	test('le message ne s’affiche qu’une fois : le rappel est effacé en le servant, et sans rappel rien ne s’affiche', () => {
		delete process.env.CUTOVER_DATE
		const firstOne = proxy(request('/auth/signin', [MESSAGE_COOKIE]))
		expect(setCookies(firstOne).find(l => l.startsWith(`${MESSAGE_COOKIE}=;`))).toContain('Max-Age=0')
		const second = proxy(request('/auth/signin', []))
		expect(second.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
		expect(setCookies(second)).toEqual([])
	})

	test('un préchargement ne montre pas le message et ne l’use pas', () => {
		delete process.env.CUTOVER_DATE
		const response = proxy(request('/auth/signin', [MESSAGE_COOKIE], { 'next-router-prefetch': '1' }))
		expect(response.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
		expect(setCookies(response)).toEqual([])
	})

	test('l’en-tête du message envoyé par un visiteur est retiré', () => {
		delete process.env.CUTOVER_DATE
		const response = proxy(request('/auth/signin', [], { [MESSAGE_HEADER]: '1' }))
		expect(response.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
	})

	test('le back-office, l’API et les fichiers : aucun Set-Cookie', () => {
		delete process.env.CUTOVER_DATE
		for (const filePath of ['/admin', '/api/pros/me', '/_next/static/a.js', '/robots.txt'])
			expect(setCookies(proxy(request(filePath, LEGACY)))).toEqual([])
	})

	test('passé les 90 jours, plus rien n’est touché', () => {
		process.env.CUTOVER_DATE = '2020-01-01'
		const response = proxy(request('/a-propos', LEGACY))
		expect(setCookies(response)).toEqual([])
	})

	test('sans cookie hérité, rien n’est posé', () => {
		delete process.env.CUTOVER_DATE
		expect(setCookies(proxy(request('/', ['payload-token'])))).toEqual([])
	})
})
