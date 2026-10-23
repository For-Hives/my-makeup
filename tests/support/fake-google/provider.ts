/**
 * The fake Google of the test bench: an OpenID Connect provider that answers the way Google
 * does, with made-up identities only. The application is pointed at it by configuration
 * (GOOGLE_OIDC_ISSUER) and goes through the same steps as with Google: discovery, authorization
 * request, exchange of the code, signed ID token, keys, profile.
 *
 * What it gives back is chosen by the test, in a cookie sent with the authorization request
 * (./identity.ts): one of four scenarios, and the identity. Without that cookie, a verified
 * made-up person signs in.
 *
 * It is a fake, and it keeps to this machine:
 * - it knows one client, the made-up one of the bench, and refuses credentials that do not say
 *   they are made up;
 * - it sends a browser back to an address of this machine only;
 * - its signing key is drawn when it starts and never leaves the process;
 * - it writes nothing, nowhere, and prints no token and no identity.
 *
 * One function, `repondre`, takes a web request and gives a web response: the container serves
 * it over HTTP (./server.ts), a unit test calls it directly. Web APIs only.
 */

import { CHOICE_COOKIE, type Choice, composeChoice, decodeChoice, isFake, RefusedChoice } from './identity'

export interface Settings {
	/** The address the provider is known under: the `iss` of every token. A local one, without a final slash. */
	emetteur: string
	/** The only client it knows. */
	clientId: string
	secret: string
	/** The clock, in milliseconds. A test gives its own to see a code expire. */
	maintenant?: () => number
}

export interface FakeGoogle {
	emetteur: string
	repondre: (requete: Request) => Promise<Response>
}

/** Google's own paths, so that an address built for Google lands on the same place here. */
export const PATHS = {
	decouverte: '/.well-known/openid-configuration',
	autorisation: '/o/oauth2/v2/auth',
	jeton: '/token',
	profil: '/v1/userinfo',
	cles: '/oauth2/v3/certs',
} as const

/** A code is exchanged within the minute, once. */
const CODE_DURATION_MS = 60_000
/** What Google says of its access tokens: just under an hour. */
const ACCESS_DURATION_S = 3599
const IDENTITY_TOKEN_DURATION_S = 3600

const HOST_LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Nothing the provider says may be kept by a cache or leak through a referrer. */
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } as const

interface Authorization {
	choix: Choice
	redirectUri: string
	portee: string[]
	nonce: string | undefined
	defi: { valeur: string; methode: 'S256' | 'plain' } | undefined
	expire: number
}

interface Access {
	choix: Choice
	portee: string[]
	expire: number
}

const base64url = (octets: ArrayBuffer | Uint8Array | string): string => {
	if (typeof octets === 'string') return Buffer.from(octets, 'utf8').toString('base64url')
	return Buffer.from(octets instanceof ArrayBuffer ? new Uint8Array(octets) : octets).toString('base64url')
}

const sha256 = (texte: string): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))

const random = (octets: number): string => base64url(crypto.getRandomValues(new Uint8Array(octets)))

const json = (corps: unknown, status = 200, entetes: Record<string, string> = {}): Response =>
	new Response(JSON.stringify(corps), {
		status,
		headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...entetes },
	})

/** A page of the provider itself, as Google shows one when it cannot send the browser back. In plain text: nothing is echoed. */
const page = (status: number, code: string, explication: string): Response =>
	new Response(`Faux Google du banc de test. Erreur ${status} : ${code}\n${explication}\n`, {
		status,
		headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
	})

/** An error of the token endpoint, in the shape of RFC 6749. */
const tokenRefusal = (status: number, code: string, description: string): Response =>
	json({ error: code, error_description: description }, status)

const refusedMethod = (admises: string): Response =>
	new Response(null, { status: 405, headers: { ...HEADERS, Allow: admises } })

/** An address of this machine, over http or https, without a fragment: the only place a browser is sent back to. */
function returnLocal(adresse: string): URL | undefined {
	const url = URL.canParse(adresse) ? new URL(adresse) : undefined
	if (!url || url.hash !== '' || !['http:', 'https:'].includes(url.protocol)) return undefined
	return HOST_LOCAL.has(url.hostname) ? url : undefined
}

function readCookie(entete: string | null, nom: string): string | undefined {
	for (const chunk of (entete ?? '').split(';')) {
		const equal = chunk.indexOf('=')
		if (equal !== -1 && chunk.slice(0, equal).trim() === nom) return chunk.slice(equal + 1).trim()
	}
	return undefined
}

/** A part of a `Basic` credential, which RFC 6749 has percent-encoded. Unreadable: nothing. */
const decoder = (texte: string): string | null => {
	try {
		return decodeURIComponent(texte)
	} catch {
		return null
	}
}

/** The client as it presents itself to the token endpoint: in the `Authorization` header, or in the form. */
function clientPresented(requete: Request, formulaire: URLSearchParams): { id: string | null; secret: string | null } {
	const [type, value] = (requete.headers.get('authorization') ?? '').split(' ')
	if (type?.toLowerCase() === 'basic' && value) {
		const [id = '', ...rest] = Buffer.from(value, 'base64').toString('utf8').split(':')
		return { id: decoder(id), secret: decoder(rest.join(':')) }
	}
	return { id: formulaire.get('client_id'), secret: formulaire.get('client_secret') }
}

/** What Google says about the person, by scope: an application that forgets to ask for `email` gets no address. */
function claims({ identite, scenario }: Choice, portee: string[]): Record<string, unknown> {
	return {
		sub: identite.sub,
		...(portee.includes('email') ? { email: identite.email, email_verified: scenario === 'email-verifie' } : {}),
		...(portee.includes('profile')
			? {
					name: identite.nom,
					given_name: identite.prenom,
					family_name: identite.nomDeFamille,
					...(identite.photo === undefined ? {} : { picture: identite.photo }),
				}
			: {}),
	}
}

/** Starts a provider: draws its signing key, and remembers nothing else. */
export async function createFakeGoogle(reglages: Settings): Promise<FakeGoogle> {
	const { emetteur: issuer, clientId, secret, maintenant: now = Date.now } = reglages
	const origin = URL.canParse(issuer) ? new URL(issuer) : undefined
	if (!origin || origin.origin !== issuer || origin.protocol !== 'http:' || !HOST_LOCAL.has(origin.hostname))
		throw new Error('Faux Google : son adresse doit être une adresse http de ce poste, sans « / » final.')
	if (!isFake(clientId) || !isFake(secret))
		throw new Error(
			'Faux Google : l’identifiant client et son secret doivent porter le mot « factice ». Jamais un vrai secret Google ici.'
		)

	const keys = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	)
	const kid = random(12)
	const { n, e } = await crypto.subtle.exportKey('jwk', keys.publicKey)
	const publicKey = { kty: 'RSA', alg: 'RS256', use: 'sig', kid, n, e }

	const authorizations = new Map<string, Authorization>()
	const access = new Map<string, Access>()

	const forgetExpired = (): void => {
		const instant = now()
		for (const [code, { expire: expired }] of authorizations) if (expired <= instant) authorizations.delete(code)
		for (const [token, { expire: expired }] of access) if (expired <= instant) access.delete(token)
	}

	async function sign(charge: Record<string, unknown>): Promise<string> {
		const toSign = `${base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))}.${base64url(JSON.stringify(charge))}`
		const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(toSign))
		return `${toSign}.${base64url(signature)}`
	}

	const discovery = (): Response =>
		json({
			issuer: issuer,
			authorization_endpoint: `${issuer}${PATHS.autorisation}`,
			token_endpoint: `${issuer}${PATHS.jeton}`,
			userinfo_endpoint: `${issuer}${PATHS.profil}`,
			jwks_uri: `${issuer}${PATHS.cles}`,
			response_types_supported: ['code'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			scopes_supported: ['openid', 'email', 'profile'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
			claims_supported: [
				'aud',
				'email',
				'email_verified',
				'exp',
				'family_name',
				'given_name',
				'iat',
				'iss',
				'name',
				'picture',
				'sub',
			],
			code_challenge_methods_supported: ['plain', 'S256'],
			grant_types_supported: ['authorization_code'],
		})

	/** The consent screen, without a screen: the answer is the one the test chose. */
	function allow(requete: Request, url: URL): Response {
		const parameters = url.searchParams
		// Like Google, the two faults below are shown on the provider's own page: nowhere safe to send the browser.
		if (parameters.get('client_id') !== clientId)
			return page(401, 'invalid_client', 'Ce client n’est pas celui du banc de test : vérifie GOOGLE_CLIENT_ID.')
		const redirectUri = parameters.get('redirect_uri')
		const target = redirectUri ? returnLocal(redirectUri) : undefined
		if (!redirectUri || !target)
			return page(
				400,
				'redirect_uri_mismatch',
				'Le faux Google ne renvoie le navigateur que vers une adresse de ce poste (localhost ou 127.0.0.1).'
			)

		const resend = (reponse: Record<string, string>): Response => {
			for (const [name, value] of Object.entries(reponse)) target.searchParams.set(name, value)
			const state = parameters.get('state')
			if (state !== null) target.searchParams.set('state', state)
			return new Response(null, { status: 302, headers: { ...HEADERS, Location: target.href } })
		}

		if (parameters.get('response_type') !== 'code') return resend({ error: 'unsupported_response_type' })
		const scope = (parameters.get('scope') ?? '').split(/\s+/).filter(Boolean)
		if (!scope.includes('openid')) return resend({ error: 'invalid_scope' })
		const challengeValue = parameters.get('code_challenge')
		const method = parameters.get('code_challenge_method') ?? 'plain'
		if (challengeValue !== null && method !== 'S256' && method !== 'plain') return resend({ error: 'invalid_request' })

		let choice: Choice
		try {
			const cookie = readCookie(requete.headers.get('cookie'), CHOICE_COOKIE)
			choice = cookie === undefined ? composeChoice() : decodeChoice(cookie)
		} catch (error) {
			if (!(error instanceof RefusedChoice)) throw error
			return page(400, 'choix_refuse', error.message)
		}

		if (choice.scenario === 'refus') return resend({ error: 'access_denied' })

		forgetExpired()
		const code = random(32)
		authorizations.set(code, {
			choix: choice,
			redirectUri,
			portee: scope,
			nonce: parameters.get('nonce') ?? undefined,
			defi:
				challengeValue === null ? undefined : { valeur: challengeValue, methode: method === 'S256' ? 'S256' : 'plain' },
			expire: now() + CODE_DURATION_MS,
		})
		// The extra parameters Google adds to its own answer: an application must not choke on them.
		return resend({ code, scope: scope.join(' '), authuser: '0', prompt: 'none' })
	}

	async function exchange(requete: Request): Promise<Response> {
		if (!(requete.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded'))
			return tokenRefusal(400, 'invalid_request', 'Un formulaire application/x-www-form-urlencoded est attendu.')
		const form = new URLSearchParams(await requete.text())
		const code = form.get('code') ?? ''
		const authorization = authorizations.get(code)

		// An outage does not look at who is asking: it comes before every other check, and the
		// code stays good, so that a second try fails the same way.
		if (authorization?.choix.scenario === 'panne' && authorization.expire > now())
			return new Response('<!doctype html><title>503</title><h1>503 Service Unavailable</h1>\n', {
				status: 503,
				headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' },
			})

		const client = clientPresented(requete, form)
		if (client.id !== clientId || client.secret !== secret)
			return tokenRefusal(401, 'invalid_client', 'Client ou secret inconnu du banc de test.')
		if (form.get('grant_type') !== 'authorization_code')
			return tokenRefusal(400, 'unsupported_grant_type', 'Seul « authorization_code » est accepté.')

		// A code is good once: it is forgotten as soon as it is presented, whatever comes next.
		authorizations.delete(code)
		if (!authorization || authorization.expire <= now())
			return tokenRefusal(400, 'invalid_grant', 'Code inconnu, déjà échangé ou expiré.')
		if (form.get('redirect_uri') !== authorization.redirectUri)
			return tokenRefusal(400, 'redirect_uri_mismatch', 'redirect_uri diffère de celle de la demande d’autorisation.')
		if (authorization.defi) {
			const proof = form.get('code_verifier') ?? ''
			const expected = authorization.defi.methode === 'S256' ? base64url(await sha256(proof)) : proof
			if (proof === '' || expected !== authorization.defi.valeur)
				return tokenRefusal(400, 'invalid_grant', 'code_verifier absent ou faux.')
		}

		const { choix: choice, portee: scope, nonce } = authorization
		const accessToken = random(32)
		const seconds = Math.floor(now() / 1000)
		forgetExpired()
		access.set(accessToken, { choix: choice, portee: scope, expire: now() + ACCESS_DURATION_S * 1000 })
		const identityToken = await sign({
			iss: issuer,
			azp: clientId,
			aud: clientId,
			...claims(choice, scope),
			at_hash: base64url(new Uint8Array(await sha256(accessToken)).slice(0, 16)),
			...(nonce === undefined ? {} : { nonce }),
			iat: seconds,
			exp: seconds + IDENTITY_TOKEN_DURATION_S,
		})
		return json({
			access_token: accessToken,
			expires_in: ACCESS_DURATION_S,
			scope: scope.join(' '),
			token_type: 'Bearer',
			id_token: identityToken,
		})
	}

	function profile(requete: Request): Response {
		const [type, token] = (requete.headers.get('authorization') ?? '').split(' ')
		const known = type?.toLowerCase() === 'bearer' && token ? access.get(token) : undefined
		if (!known || known.expire <= now())
			return json({ error: 'invalid_token', error_description: 'Jeton d’accès inconnu ou expiré.' }, 401, {
				'WWW-Authenticate': 'Bearer error="invalid_token"',
			})
		return json(claims(known.choix, known.portee))
	}

	async function router(requete: Request): Promise<Response> {
		const url = new URL(requete.url)
		const reading = requete.method === 'GET' || requete.method === 'HEAD'
		switch (url.pathname) {
			case '/':
				return new Response(
					'Faux Google du banc de test de My Makeup. Rien ici n’est réel : ni compte, ni secret. Voir docs/tests/banc.md.\n',
					{ headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } }
				)
			case PATHS.decouverte:
				return reading ? discovery() : refusedMethod('GET, HEAD')
			case PATHS.cles:
				return reading ? json({ keys: [publicKey] }) : refusedMethod('GET, HEAD')
			case PATHS.autorisation:
				return requete.method === 'GET' ? allow(requete, url) : refusedMethod('GET')
			case PATHS.jeton:
				return requete.method === 'POST' ? exchange(requete) : refusedMethod('POST')
			case PATHS.profil:
				return requete.method === 'GET' || requete.method === 'POST' ? profile(requete) : refusedMethod('GET, POST')
			default:
				return page(404, 'not_found', 'Le faux Google ne connaît pas cette adresse.')
		}
	}

	return {
		emetteur: issuer,
		repondre: async requete => {
			try {
				return await router(requete)
			} catch {
				// Never the message of the fault: it could quote what the request carried.
				return page(500, 'server_error', 'Le faux Google a rencontré une erreur inattendue.')
			}
		},
	}
}
