import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * The OpenID Connect client of the Google sign-in (ticket 090), written by hand with `fetch` and
 * WebCrypto: the verified table of versions holds no OAuth library, and the flow is short.
 *
 * Authorization code with PKCE (S256), a `state` and a `nonce` kept in a sealed, short-lived cookie.
 * Everything that comes back is checked before it is believed:
 * - the `state` of the address equals the one of the cookie, and the cookie is signed by us;
 * - the code is exchanged server to server, with the client secret and the PKCE verifier;
 * - the ID token is signed RS256 by a key the provider publishes, and says the right issuer, audience,
 *   nonce and an end date that has not passed.
 *
 * The issuer is Google, or on this machine the fake Google of the test bench (`GOOGLE_OIDC_ISSUER`,
 * ticket 039). The endpoints come from the discovery document of that issuer; a document that names
 * another issuer, a plain-http endpoint on Google, or an endpoint on another host than a local
 * issuer's own, is refused. Nothing here logs a code, a token or a claim.
 *
 * No `next` import: the tests load this file too.
 */

const MAX_DELAY_MS = 10_000
const REQUEST_LIFE_S = 10 * 60
const CLOCK_TOLERANCE_S = 60
const DOCUMENTS_TTL_MS = 60 * 60 * 1000

/** Sends a request and gives the answer: `fetch`, or a double in a test. */
export type Query = (url: string, init?: RequestInit) => Promise<Response>

const queryByDefault: Query = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(MAX_DELAY_MS) })

export interface ConfigGoogle {
	/** The issuer: `https://accounts.google.com`, or the fake Google of the bench. */
	emetteur: string
	clientId: string
	clientSecret: string
	/** Where the provider sends the browser back: the site's own address, never read from a request. */
	redirectUri: string
}

/** The sign-in cannot go on, for a reason that is the provider's or the network's, not the visitor's. */
export class GoogleUnavailable extends Error {
	constructor(message = 'Google ne répond pas comme prévu.') {
		super(message)
		this.name = 'GoogleIndisponible'
	}
}

// ---------------------------------------------------------------------------------------------
// Discovery and keys
// ---------------------------------------------------------------------------------------------

const Discovery = z.object({
	issuer: z.string(),
	authorization_endpoint: z.string(),
	token_endpoint: z.string(),
	jwks_uri: z.string(),
})
export type Discovery = z.infer<typeof Discovery>

const JwkSet = z.object({
	keys: z.array(
		z.looseObject({ kty: z.string(), kid: z.string().optional(), n: z.string().optional(), e: z.string().optional() })
	),
})
type JwkKey = z.infer<typeof JwkSet>['keys'][number]

const isLocal = (emetteur: string): boolean => !emetteur.startsWith('https://')

/** An endpoint is believed when it is https, or on the host of a local issuer. */
function trustedAddress(valeur: string, emetteur: string): boolean {
	if (!URL.canParse(valeur)) return false
	const url = new URL(valeur)
	if (isLocal(emetteur)) return url.origin === new URL(emetteur).origin
	return url.protocol === 'https:' && url.username === '' && url.password === ''
}

const documents = new Map<string, { jusqua: number; valeur: unknown }>()

async function cachedDocument<T>(
	cle: string,
	maintenant: number,
	lire: () => Promise<T>,
	conserver: boolean
): Promise<T> {
	const guard = documents.get(cle)
	if (conserver && guard && guard.jusqua > maintenant) return guard.valeur as T
	const value = await lire()
	documents.set(cle, { jusqua: maintenant + DOCUMENTS_TTL_MS, valeur: value })
	return value
}

/** Forgets what was read about the providers: the tests start from nothing. */
export const clearDocuments = (): void => documents.clear()

async function readJson(reponse: Response): Promise<unknown> {
	if (!reponse.ok) throw new GoogleUnavailable()
	try {
		return await reponse.json()
	} catch {
		throw new GoogleUnavailable()
	}
}

/** The discovery document of the issuer, kept for an hour. */
export async function discover(
	emetteur: string,
	{ requeter = queryByDefault, maintenant = Date.now }: { requeter?: Query; maintenant?: () => number } = {}
): Promise<Discovery> {
	return cachedDocument(
		`decouverte:${emetteur}`,
		maintenant(),
		async () => {
			const parsed = Discovery.safeParse(await readJson(await requeter(`${emetteur}/.well-known/openid-configuration`)))
			if (!parsed.success || parsed.data.issuer !== emetteur) throw new GoogleUnavailable()
			const addresses = [parsed.data.authorization_endpoint, parsed.data.token_endpoint, parsed.data.jwks_uri]
			if (!addresses.every(adresse => trustedAddress(adresse, emetteur))) throw new GoogleUnavailable()
			return parsed.data
		},
		true
	)
}

async function signatureKey(
	decouverte: Discovery,
	kid: string,
	{ requeter, maintenant }: { requeter: Query; maintenant: () => number }
): Promise<JwkKey | undefined> {
	const find = (cles: JwkKey[]) => cles.find(cle => cle.kid === kid && cle.kty === 'RSA' && cle.n && cle.e)
	const read = async () => {
		const parsed = JwkSet.safeParse(await readJson(await requeter(decouverte.jwks_uri)))
		if (!parsed.success) throw new GoogleUnavailable()
		return parsed.data.keys
	}
	const key = `cles:${decouverte.jwks_uri}`
	const known = find(await cachedDocument(key, maintenant(), read, true))
	if (known) return known
	// A key published since: read the set again once, then give up.
	return find(await cachedDocument(key, maintenant(), read, false))
}

// ---------------------------------------------------------------------------------------------
// The request, and the sealed cookie that keeps its secrets until the return
// ---------------------------------------------------------------------------------------------

const random = (octets = 32): string => randomBytes(octets).toString('base64url')

const sha256Base64Url = (texte: string): string => createHash('sha256').update(texte).digest('base64url')

/** What the browser's cookie keeps between the departure and the return. */
export interface PendingRequest {
	state: string
	nonce: string
	/** The PKCE verifier. */
	verifier: string
	/** The page to come back to: already reduced to a path of this site by the caller. */
	retour: string
	/** When the request ends, Unix seconds. */
	expire: number
}

export interface GoogleStart {
	/** The address of the consent screen of the provider. */
	adresse: string
	/** The value of the sealed cookie. */
	cookie: string
}

/** Builds the request and the cookie that must come back with the answer. */
export function prepareStart(
	config: ConfigGoogle,
	decouverte: Discovery,
	{ retour, secret, maintenant = Date.now }: { retour: string; secret: string; maintenant?: () => number }
): GoogleStart {
	const pendingRequest: PendingRequest = {
		state: random(),
		nonce: random(),
		verifier: random(),
		retour,
		expire: Math.floor(maintenant() / 1000) + REQUEST_LIFE_S,
	}
	const address = new URL(decouverte.authorization_endpoint)
	address.search = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state: pendingRequest.state,
		nonce: pendingRequest.nonce,
		code_challenge: sha256Base64Url(pendingRequest.verifier),
		code_challenge_method: 'S256',
	}).toString()
	return { adresse: address.toString(), cookie: seal(pendingRequest, secret) }
}

const signature = (charge: string, secret: string): string =>
	createHmac('sha256', secret).update(`google-oidc:${charge}`).digest('base64url')

/** `charge.signature`, the charge being the request in base64url JSON. */
export function seal(demande: PendingRequest, secret: string): string {
	const charge = Buffer.from(JSON.stringify(demande)).toString('base64url')
	return `${charge}.${signature(charge, secret)}`
}

const ForgotPasswordRequest = z.object({
	state: z.string().min(1),
	nonce: z.string().min(1),
	verifier: z.string().min(1),
	retour: z.string(),
	expire: z.number(),
})

/** The request a cookie holds, if our signature is on it and it has not ended; nothing otherwise. */
export function openCookie(
	valeur: string | undefined,
	secret: string,
	maintenant: () => number = Date.now
): PendingRequest | undefined {
	if (!valeur) return undefined
	const [charge = '', recue = '', remaining] = valeur.split('.')
	if (remaining !== undefined || charge === '' || recue === '') return undefined
	const expected = signature(charge, secret)
	const a = Buffer.from(recue)
	const b = Buffer.from(expected)
	if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
	try {
		const pendingRequest = ForgotPasswordRequest.parse(JSON.parse(Buffer.from(charge, 'base64url').toString('utf8')))
		return pendingRequest.expire * 1000 > maintenant() ? pendingRequest : undefined
	} catch {
		return undefined
	}
}

// ---------------------------------------------------------------------------------------------
// The return: code to token, token to claims
// ---------------------------------------------------------------------------------------------

/** What Google says about the person, once its ID token has been checked. */
export interface Claims {
	sub: string
	email?: string
	emailVerifie: boolean
	nom?: string
}

const Tokens = z.object({ id_token: z.string().min(1) })

const Header = z.object({ alg: z.string(), kid: z.string() })

const Charge = z.looseObject({
	iss: z.string(),
	aud: z.union([z.string(), z.array(z.string())]),
	exp: z.number(),
	iat: z.number().optional(),
	nonce: z.string().optional(),
	sub: z.string().min(1),
	email: z.string().optional(),
	email_verified: z.union([z.boolean(), z.string()]).optional(),
	name: z.string().optional(),
	given_name: z.string().optional(),
	family_name: z.string().optional(),
})

const decoder = (morceau: string): unknown => JSON.parse(Buffer.from(morceau, 'base64url').toString('utf8'))

/** The issuers an ID token may name: the configured one, and Google's short spelling of its own. */
function acceptedIssuers(emetteur: string): string[] {
	return emetteur === 'https://accounts.google.com' ? [emetteur, 'accounts.google.com'] : [emetteur]
}

export interface CallbackDependencies {
	requeter?: Query
	maintenant?: () => number
}

/**
 * Exchanges the code for the ID token and checks it. Throws `GoogleIndisponible` when the provider
 * fails, and `JetonRefuse` when what it sent cannot be believed.
 */
export async function codeClaims(
	config: ConfigGoogle,
	decouverte: Discovery,
	{ code, demande: pendingRequest }: { code: string; demande: PendingRequest },
	{ requeter = queryByDefault, maintenant = Date.now }: CallbackDependencies = {}
): Promise<Claims> {
	let response: Response
	try {
		response = await requeter(decouverte.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: config.redirectUri,
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code_verifier: pendingRequest.verifier,
			}).toString(),
			redirect: 'error',
		})
	} catch {
		throw new GoogleUnavailable()
	}
	// A 4xx is the provider refusing a code it does not know (used twice, forged): not an outage.
	if (response.status >= 400 && response.status < 500) throw new RefusedToken()
	const tokens = Tokens.safeParse(await readJson(response))
	if (!tokens.success) throw new RefusedToken()
	return verifyToken(tokens.data.id_token, config, decouverte, pendingRequest.nonce, { requeter, maintenant })
}

/** What the provider sent cannot be believed: a bad signature, issuer, audience, nonce or date. */
export class RefusedToken extends Error {
	constructor() {
		super('Le jeton d’identité est refusé.')
		this.name = 'JetonRefuse'
	}
}

export async function verifyToken(
	jeton: string,
	config: ConfigGoogle,
	decouverte: Discovery,
	nonce: string,
	{ requeter = queryByDefault, maintenant = Date.now }: CallbackDependencies = {}
): Promise<Claims> {
	const parts = jeton.split('.')
	if (parts.length !== 3) throw new RefusedToken()
	const [rawHeader = '', chargeBrute = '', signatureBrute = ''] = parts
	let header: z.infer<typeof Header>
	let charge: z.infer<typeof Charge>
	try {
		header = Header.parse(decoder(rawHeader))
		charge = Charge.parse(decoder(chargeBrute))
	} catch {
		throw new RefusedToken()
	}
	// Only RS256: a token that asks for `none` or for a symmetric algorithm is a forgery.
	if (header.alg !== 'RS256') throw new RefusedToken()
	const jwk = await signatureKey(decouverte, header.kid, { requeter, maintenant })
	if (!jwk) throw new RefusedToken()
	let signed = false
	try {
		const key = await crypto.subtle.importKey(
			'jwk',
			{ kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		)
		signed = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key,
			Buffer.from(signatureBrute, 'base64url'),
			new TextEncoder().encode(`${rawHeader}.${chargeBrute}`)
		)
	} catch {
		throw new RefusedToken()
	}
	if (!signed) throw new RefusedToken()

	const nowS = Math.floor(maintenant() / 1000)
	const audiences = Array.isArray(charge.aud) ? charge.aud : [charge.aud]
	const authorizedParty = typeof charge.azp === 'string' ? charge.azp : undefined
	const invalid =
		!acceptedIssuers(config.emetteur).includes(charge.iss) ||
		!audiences.includes(config.clientId) ||
		(audiences.length > 1 && authorizedParty !== config.clientId) ||
		charge.exp + CLOCK_TOLERANCE_S <= nowS ||
		(charge.iat !== undefined && charge.iat - CLOCK_TOLERANCE_S > nowS) ||
		charge.nonce !== nonce
	if (invalid) throw new RefusedToken()

	const name =
		charge.name?.trim() || [charge.given_name, charge.family_name].filter(Boolean).join(' ').trim() || undefined
	return {
		sub: charge.sub,
		...(charge.email !== undefined && { email: charge.email }),
		emailVerifie: charge.email_verified === true || charge.email_verified === 'true',
		...(name !== undefined && { nom: name }),
	}
}
