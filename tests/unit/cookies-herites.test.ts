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
const HERITES = [
	'__Secure-next-auth.session-token',
	'__Secure-next-auth.session-token.0',
	'__Secure-next-auth.session-token.1',
	'__Host-next-auth.csrf-token',
	'__Secure-next-auth.callback-url',
]

describe('U65 : la liste des cookies hérités effacés', () => {
	test('la session (et ses morceaux), le jeton CSRF et l’adresse de retour, avec ou sans préfixe', () => {
		const noms = [
			...HERITES,
			'next-auth.session-token',
			'next-auth.session-token.12',
			'next-auth.csrf-token',
			'next-auth.callback-url',
		]
		expect(legacyCookiesPresent(noms)).toEqual(noms)
	})

	test('rien d’autre : ni le cookie de Payload, ni un nom voisin', () => {
		const autres = [
			'payload-token',
			'next-auth.session-tokens',
			'next-auth.session-token.',
			'next-auth.session-token.x',
			'x-next-auth.csrf-token',
			'next-auth.pkce.code_verifier',
			'__Secure-payload-token',
			'mm-signed-out',
		]
		expect(legacyCookiesPresent(autres)).toEqual([])
	})
})

describe('U66 : chaque effacement répète les attributs de la pose', () => {
	test.each(HERITES)('%s : Max-Age=0, même Path, Secure, SameSite, pas de Domain', nom => {
		const pose = setAttributes(nom)
		const effacement = clearingCookie(nom)
		expect(effacement).toMatchObject({
			name: nom,
			value: '',
			maxAge: 0,
			path: pose.path,
			secure: pose.secure,
			sameSite: pose.sameSite,
			httpOnly: pose.httpOnly,
		})
		expect(effacement).not.toHaveProperty('domain')
		expect(effacement.expires.getTime()).toBe(0)
	})

	test('les valeurs de NextAuth v4 : Path=/, HttpOnly, Lax, Secure avec les préfixes seulement', () => {
		for (const nom of HERITES)
			expect(setAttributes(nom)).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax', secure: true })
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

	test('BASCULE_LE illisible arrête le démarrage, par son nom', () => {
		const base = { DATABASE_URI: 'postgres://u:p@127.0.0.1:5432/db', PAYLOAD_SECRET: 'x'.repeat(32) }
		expect(() => parseServerEnv({ ...base, BASCULE_LE: '2027-02-01' })).not.toThrow()
		expect(() => parseServerEnv({ ...base, BASCULE_LE: '' })).not.toThrow()
		try {
			parseServerEnv({ ...base, BASCULE_LE: '01/02/2027' })
			throw new Error('should have thrown')
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError)
			expect((error as EnvError).variables).toEqual(['BASCULE_LE'])
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
			noms: HERITES,
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

const requete = (chemin: string, cookies: string[], entetes: Record<string, string> = {}) =>
	new NextRequest(`${SITE}${chemin}`, {
		headers: { cookie: cookies.map(nom => `${nom}=valeur`).join('; '), ...entetes },
	})

const setCookies = (reponse: Response) => reponse.headers.getSetCookie()

describe('le proxy : le nettoyage à la première requête', () => {
	const avant = process.env.BASCULE_LE
	afterEach(() => {
		if (avant === undefined) delete process.env.BASCULE_LE
		else process.env.BASCULE_LE = avant
	})

	test('une page du site : chaque cookie hérité expiré, un rappel posé, pas de redirection', () => {
		delete process.env.BASCULE_LE
		const reponse = proxy(requete('/a-propos', HERITES))
		expect(reponse.status).toBe(200)
		const lignes = setCookies(reponse)
		for (const nom of HERITES) {
			const ligne = lignes.find(l => l.startsWith(`${nom}=;`))
			expect(ligne).toBeDefined()
			expect(ligne).toContain('Max-Age=0')
			expect(ligne).toContain('Path=/')
			expect(ligne).toContain('SameSite=lax')
			expect(ligne).not.toContain('Domain')
		}
		expect(lignes.find(l => l.startsWith('__Host-next-auth.csrf-token='))).toContain('Secure')
		expect(lignes.find(l => l.startsWith(`${MESSAGE_COOKIE}=1`))).toContain('HttpOnly')
	})

	test('la connexion directement : le message est dû tout de suite, sans rappel', () => {
		delete process.env.BASCULE_LE
		const reponse = proxy(requete('/auth/signin', HERITES))
		expect(reponse.status).toBe(200)
		expect(reponse.headers.get('x-middleware-request-x-mm-signed-out')).toBe('1')
		expect(setCookies(reponse).some(l => l.startsWith(`${MESSAGE_COOKIE}=1`))).toBe(false)
	})

	test('une page privée : une seule redirection vers la connexion, les cookies expirés au passage (pas de boucle)', () => {
		delete process.env.BASCULE_LE
		const reponse = proxy(requete('/auth/profil', HERITES))
		expect(reponse.status).toBe(307)
		expect(reponse.headers.get('location')).toBe(`${SITE}/auth/signin?callbackUrl=%2Fauth%2Fprofil`)
		expect(setCookies(reponse).filter(l => l.includes('Max-Age=0'))).toHaveLength(HERITES.length)
		// The next request carries no old cookie any more: the sign-in page answers, with the reminder.
		const suite = proxy(requete('/auth/signin', [MESSAGE_COOKIE]))
		expect(suite.status).toBe(200)
		expect(suite.headers.get('x-middleware-request-x-mm-signed-out')).toBe('1')
	})

	test('le message ne s’affiche qu’une fois : le rappel est effacé en le servant, et sans rappel rien ne s’affiche', () => {
		delete process.env.BASCULE_LE
		const premiere = proxy(requete('/auth/signin', [MESSAGE_COOKIE]))
		expect(setCookies(premiere).find(l => l.startsWith(`${MESSAGE_COOKIE}=;`))).toContain('Max-Age=0')
		const seconde = proxy(requete('/auth/signin', []))
		expect(seconde.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
		expect(setCookies(seconde)).toEqual([])
	})

	test('un préchargement ne montre pas le message et ne l’use pas', () => {
		delete process.env.BASCULE_LE
		const reponse = proxy(requete('/auth/signin', [MESSAGE_COOKIE], { 'next-router-prefetch': '1' }))
		expect(reponse.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
		expect(setCookies(reponse)).toEqual([])
	})

	test('l’en-tête du message envoyé par un visiteur est retiré', () => {
		delete process.env.BASCULE_LE
		const reponse = proxy(requete('/auth/signin', [], { [MESSAGE_HEADER]: '1' }))
		expect(reponse.headers.get('x-middleware-request-x-mm-signed-out')).toBeNull()
	})

	test('le back-office, l’API et les fichiers : aucun Set-Cookie', () => {
		delete process.env.BASCULE_LE
		for (const chemin of ['/admin', '/api/pros/me', '/_next/static/a.js', '/robots.txt'])
			expect(setCookies(proxy(requete(chemin, HERITES)))).toEqual([])
	})

	test('passé les 90 jours, plus rien n’est touché', () => {
		process.env.BASCULE_LE = '2020-01-01'
		const reponse = proxy(requete('/a-propos', HERITES))
		expect(setCookies(reponse)).toEqual([])
	})

	test('sans cookie hérité, rien n’est posé', () => {
		delete process.env.BASCULE_LE
		expect(setCookies(proxy(requete('/', ['payload-token'])))).toEqual([])
	})
})
