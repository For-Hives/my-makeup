import { beforeEach, describe, expect, test } from 'bun:test'
import { accountName, normalizedAddress } from '@/lib/auth/google/account'
import {
	type ConfigGoogle,
	clearDocuments,
	codeClaims,
	discover,
	GoogleUnavailable,
	openCookie,
	type PendingRequest,
	prepareStart,
	RefusedToken,
	seal,
	verifyToken,
} from '@/lib/auth/google/oidc'

/**
 * The OpenID Connect client of the Google sign-in (ticket 090): what it asks, and what it believes.
 * A provider is played in the test: its keys are made here, its answers are a function of the request.
 */

const ISSUER = 'https://accounts.google.com'
const CLIENT = 'client-factice.example.test'
const SECRET = 'secret-factice-du-client'
const SEAL_KEY = 'une-cle-de-sceau-qui-fait-plus-de-32-caracteres'
const config: ConfigGoogle = {
	emetteur: ISSUER,
	clientId: CLIENT,
	clientSecret: SECRET,
	redirectUri: 'https://my-makeup.example.test/auth/google/callback',
}
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0)
const now = () => NOW
const insideValue = (secondes: number) => Math.floor(NOW / 1000) + secondes

const base64url = (donnees: string | Uint8Array) => Buffer.from(donnees).toString('base64url')

async function buildKey() {
	const pair = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	)
	const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
	return { privee: pair.privateKey, publique: { ...jwk, kid: 'cle-1', alg: 'RS256', use: 'sig' } }
}

const key = await buildKey()
const otherKey = await buildKey()

async function sign(
	charge: Record<string, unknown>,
	{ alg = 'RS256', avec = key.privee, kid = 'cle-1' }: { alg?: string; avec?: CryptoKey; kid?: string } = {}
): Promise<string> {
	const header = base64url(JSON.stringify({ alg, kid, typ: 'JWT' }))
	const corps = base64url(JSON.stringify(charge))
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', avec, new TextEncoder().encode(`${header}.${corps}`))
	return `${header}.${corps}.${base64url(new Uint8Array(signature))}`
}

const validLoad = (en: Record<string, unknown> = {}) => ({
	iss: ISSUER,
	aud: CLIENT,
	sub: 'sub-fictif',
	email: 'lea@example.test',
	email_verified: true,
	name: 'Léa Fictive',
	nonce: 'nonce-attendu',
	iat: insideValue(-5),
	exp: insideValue(3600),
	...en,
})

const validDiscovery = {
	issuer: ISSUER,
	authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
	token_endpoint: 'https://oauth2.googleapis.com/token',
	jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
}

const json = (corps: unknown, statut = 200) =>
	new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

/** A provider: discovery, keys and the token endpoint, which answers with the token the test chose. */
function provider(idToken: () => Promise<string>, decouverte: Record<string, unknown> = validDiscovery) {
	const seen: { url: string; init?: RequestInit }[] = []
	const query = async (url: string, init?: RequestInit): Promise<Response> => {
		seen.push({ url, init })
		if (url.endsWith('/.well-known/openid-configuration')) return json(decouverte)
		if (url === validDiscovery.jwks_uri) return json({ keys: [key.publique] })
		if (url === validDiscovery.token_endpoint) return json({ access_token: 'acces-fictif', id_token: await idToken() })
		return new Response('introuvable', { status: 404 })
	}
	return { requeter: query, vues: seen }
}

const request: PendingRequest = {
	state: 'state',
	nonce: 'nonce-attendu',
	verifier: 'verifier-fictif',
	retour: '/auth/profil',
	expire: insideValue(600),
}

beforeEach(() => clearDocuments())

describe('le départ vers Google', () => {
	test('la demande porte le client, le retour, le state, le nonce et le défi PKCE S256, sans le secret', () => {
		const { adresse: address } = prepareStart(config, validDiscovery as never, {
			retour: '/auth/profil',
			secret: SEAL_KEY,
			maintenant: now,
		})
		const url = new URL(address)
		expect(url.origin + url.pathname).toBe(validDiscovery.authorization_endpoint)
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			client_id: CLIENT,
			redirect_uri: config.redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			code_challenge_method: 'S256',
		})
		expect(url.searchParams.get('state')?.length).toBeGreaterThan(30)
		expect(url.searchParams.get('nonce')?.length).toBeGreaterThan(30)
		expect(address).not.toContain(SECRET)
	})

	test('le cookie rend ce que le départ a gardé, et le state du cookie est celui de l’adresse', () => {
		const start = prepareStart(config, validDiscovery as never, {
			retour: '/blog',
			secret: SEAL_KEY,
			maintenant: now,
		})
		const guard = openCookie(start.cookie, SEAL_KEY, now)
		expect(guard?.retour).toBe('/blog')
		expect(guard?.state).toBe(new URL(start.adresse).searchParams.get('state') ?? undefined)
		expect(guard?.expire).toBe(insideValue(600))
	})

	test('le cookie ne vaut rien : changé, signé par une autre clé, périmé, ou sans signature', () => {
		const good = seal(request, SEAL_KEY)
		const [charge = '', signature = ''] = good.split('.')
		const other = base64url(JSON.stringify({ ...request, retour: '//autre.example.test' }))
		expect(openCookie(good, SEAL_KEY, now)).toEqual(request)
		for (const bad of [
			`${other}.${signature}`,
			seal(request, 'une-autre-cle-de-sceau-de-plus-de-32-caracteres'),
			seal({ ...request, expire: insideValue(-1) }, SEAL_KEY),
			charge,
			`${charge}.`,
			`${charge}.${signature}.x`,
			'',
			undefined,
		])
			expect(openCookie(bad, SEAL_KEY, now)).toBeUndefined()
	})
})

describe('la découverte', () => {
	test('elle est gardée : une seule lecture', async () => {
		const { requeter: query, vues: seen } = provider(async () => '')
		await discover(ISSUER, { requeter: query, maintenant: now })
		await discover(ISSUER, { requeter: query, maintenant: now })
		expect(seen).toHaveLength(1)
	})

	test.each([
		['un autre émetteur', { ...validDiscovery, issuer: 'https://autre.example.test' }],
		['un point d’accès en http', { ...validDiscovery, token_endpoint: 'http://oauth2.googleapis.com/token' }],
		['des identifiants dans l’adresse', { ...validDiscovery, jwks_uri: 'https://a:b@www.googleapis.com/certs' }],
		['un document incomplet', { issuer: ISSUER }],
	])('%s : refusé', async (_nom, document) => {
		const { requeter: query } = provider(async () => '', document)
		await expect(discover(ISSUER, { requeter: query, maintenant: now })).rejects.toBeInstanceOf(GoogleUnavailable)
	})

	test('un émetteur local ne peut pas renvoyer vers un autre hôte', async () => {
		const local = 'http://127.0.0.1:7080'
		const query = async () =>
			json({
				...validDiscovery,
				issuer: local,
				authorization_endpoint: `${local}/auth`,
				token_endpoint: 'http://127.0.0.1:9999/token',
				jwks_uri: `${local}/certs`,
			})
		await expect(discover(local, { requeter: query, maintenant: now })).rejects.toBeInstanceOf(GoogleUnavailable)
	})

	test('une panne de Google est une panne, pas un plantage', async () => {
		const query = async () => new Response('<html>503</html>', { status: 503 })
		await expect(discover(ISSUER, { requeter: query, maintenant: now })).rejects.toBeInstanceOf(GoogleUnavailable)
	})
})

describe('le jeton d’identité', () => {
	const check = async (jeton: string) => {
		const { requeter: query } = provider(async () => '')
		return verifyToken(jeton, config, validDiscovery as never, 'nonce-attendu', { requeter: query, maintenant: now })
	}

	test('un jeton juste rend ce que Google dit de la personne', async () => {
		expect(await check(await sign(validLoad()))).toEqual({
			sub: 'sub-fictif',
			email: 'lea@example.test',
			emailVerifie: true,
			nom: 'Léa Fictive',
		})
	})

	test('le nom vient du prénom et du nom de famille quand « name » manque', async () => {
		const r = await check(await sign(validLoad({ name: undefined, given_name: 'Léa', family_name: 'Fictive' })))
		expect(r.nom).toBe('Léa Fictive')
		// Her profile starts with the two names Google gave (issue 1009).
		expect([r.givenName, r.familyName]).toEqual(['Léa', 'Fictive'])
	})

	test('« email_verified » est vrai pour true et pour "true", faux pour tout le reste', async () => {
		for (const [value, expected] of [
			[true, true],
			['true', true],
			[false, false],
			['false', false],
			[undefined, false],
			[1, false],
		] as const) {
			const token = await sign(validLoad({ email_verified: value }))
			if (value === 1) await expect(check(token)).rejects.toBeInstanceOf(RefusedToken)
			else expect((await check(token)).emailVerifie).toBe(expected)
		}
	})

	test('l’émetteur court de Google est accepté', async () => {
		expect((await check(await sign(validLoad({ iss: 'accounts.google.com' })))).sub).toBe('sub-fictif')
	})

	test.each([
		['un autre émetteur', { iss: 'https://autre.example.test' }],
		['un autre client', { aud: 'un-autre-client' }],
		['plusieurs publics dont le nôtre, sans azp', { aud: [CLIENT, 'un-autre-client'] }],
		['un jeton périmé', { exp: insideValue(-120) }],
		['un jeton daté du futur', { iat: insideValue(3600) }],
		['un autre nonce', { nonce: 'rejoue' }],
		['pas de nonce', { nonce: undefined }],
		['pas de sujet', { sub: undefined }],
	])('%s : refusé', async (_nom, changement) => {
		await expect(check(await sign(validLoad(changement)))).rejects.toBeInstanceOf(RefusedToken)
	})

	test('plusieurs publics dont le nôtre, avec notre azp : accepté', async () => {
		const token = await sign(validLoad({ aud: [CLIENT, 'un-autre-client'], azp: CLIENT }))
		expect((await check(token)).sub).toBe('sub-fictif')
	})

	test('une signature faite par une autre clé, une clé inconnue, ou un algorithme autre que RS256 : refusé', async () => {
		await expect(check(await sign(validLoad(), { avec: otherKey.privee }))).rejects.toBeInstanceOf(RefusedToken)
		await expect(check(await sign(validLoad(), { kid: 'inconnue' }))).rejects.toBeInstanceOf(RefusedToken)
		for (const alg of ['none', 'HS256', 'RS512'])
			await expect(check(await sign(validLoad(), { alg }))).rejects.toBeInstanceOf(RefusedToken)
	})

	test('un jeton dont la charge a été changée après la signature : refusé', async () => {
		const [header, , signature] = (await sign(validLoad())).split('.')
		const charge = base64url(JSON.stringify(validLoad({ email: 'autre@example.test' })))
		await expect(check(`${header}.${charge}.${signature}`)).rejects.toBeInstanceOf(RefusedToken)
	})

	test.each([
		'',
		'abc',
		'a.b',
		'a.b.c',
		'a.b.c.d',
	])('un texte qui n’est pas un jeton (« %s ») : refusé', async texte => {
		await expect(check(texte)).rejects.toBeInstanceOf(RefusedToken)
	})
})

describe('l’échange du code', () => {
	test('le code part avec le secret du client et le vérificateur PKCE, par POST, et le jeton est vérifié', async () => {
		const { requeter: query, vues: seen } = provider(async () => sign(validLoad()))
		const r = await codeClaims(
			config,
			validDiscovery as never,
			{ code: 'code-fictif', demande: request },
			{ requeter: query, maintenant: now }
		)
		expect(r.email).toBe('lea@example.test')
		const exchange = seen.find(({ url }) => url === validDiscovery.token_endpoint)
		expect(exchange?.init?.method).toBe('POST')
		const corps = new URLSearchParams(String(exchange?.init?.body))
		expect(Object.fromEntries(corps)).toEqual({
			grant_type: 'authorization_code',
			code: 'code-fictif',
			redirect_uri: config.redirectUri,
			client_id: CLIENT,
			client_secret: SECRET,
			code_verifier: 'verifier-fictif',
		})
	})

	test('Google qui refuse le code (400) est un refus ; Google qui tombe (503, réseau coupé) est une panne', async () => {
		const refusal = async () => json({ error: 'invalid_grant' }, 400)
		const failure = async () => new Response('<html>503</html>', { status: 503 })
		const cut = async (): Promise<Response> => {
			throw new TypeError('fetch failed')
		}
		const attempt = (requeter: () => Promise<Response>) =>
			codeClaims(config, validDiscovery as never, { code: 'c', demande: request }, { requeter, maintenant: now })
		await expect(attempt(refusal)).rejects.toBeInstanceOf(RefusedToken)
		await expect(attempt(failure)).rejects.toBeInstanceOf(GoogleUnavailable)
		await expect(attempt(cut)).rejects.toBeInstanceOf(GoogleUnavailable)
	})
})

describe('le compte vu de Google', () => {
	test.each([
		['  Lea@Example.TEST ', 'lea@example.test'],
		['sans-arobase', undefined],
		['a b@example.test', undefined],
		['', undefined],
		[undefined, undefined],
		[`${'a'.repeat(250)}@example.test`, undefined],
	])('l’adresse « %s » devient %p', (brute, attendu) => {
		expect(normalizedAddress(brute)).toBe(attendu)
	})

	test('le nom est celui de Google, sinon le début de l’adresse, borné à 100 caractères', () => {
		expect(accountName({ sub: 'x', emailVerifie: true, nom: '  Léa   Fictive ' }, 'lea@example.test')).toBe(
			'Léa Fictive'
		)
		expect(accountName({ sub: 'x', emailVerifie: true }, 'lea.fictive@example.test')).toBe('lea.fictive')
		expect(
			Array.from(accountName({ sub: 'x', emailVerifie: true, nom: 'é'.repeat(300) }, 'a@example.test'))
		).toHaveLength(100)
	})
})
