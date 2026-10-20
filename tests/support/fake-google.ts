/**
 * The fake Google of the bench, seen from a test: where it answers, how a test chooses who
 * signs in, and how to play the browser in front of it.
 *
 *   const google = fauxGoogle()
 *   const choix = google.choisir({ scenario: 'email-non-verifie', email: 'lea@example.test' })
 *
 *   await context.addCookies(choix.cookies)                    // a browser: then click the Google button
 *   const retour = await google.autoriser(adresse, choix)      // an HTTP client: where Google sends the browser back
 *
 * The provider itself runs in a container of the bench (compose.test.yml, service « fake-google »,
 * code in tests/support/fake-google/). The application is pointed at it by GOOGLE_OIDC_ISSUER.
 *
 * `allerRetour` plays a whole sign-in as an application would, tokens checked: it proves the
 * provider, and is not the sign-in of the application.
 *
 * Nothing of bun here: Playwright loads this file under Node.
 */

import { z } from 'zod'
import { RefusedBench, type Variables } from './bench'
import { type Ask, CHOICE_COOKIE, type Choice, composeChoice, encodeChoice, isFake } from './fake-google/identity'
import type { BrowserCookie } from './session'

export {
	type Ask as Demande,
	type Choice as Choix,
	type Identity as Identite,
	SCENARIOS,
	type Scenario,
} from './fake-google/identity'

/** A choice, ready to travel with the authorization request. */
export interface ChoiceReady {
	choix: Choice
	/** For a client that is not a browser: the header to send with the authorization request. */
	enTetes: { Cookie: string }
	/** For a browser: `await context.addCookies(choix.cookies)`, before the click on the Google button. */
	cookies: BrowserCookie[]
}

/** What Google says about the person, in an ID token or at the profile endpoint. */
const Claims = z.looseObject({
	sub: z.string(),
	email: z.string().optional(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
	given_name: z.string().optional(),
	family_name: z.string().optional(),
	picture: z.string().optional(),
})

export type Claims = z.infer<typeof Claims>

const IdentityToken = Claims.extend({
	iss: z.string(),
	aud: z.string(),
	exp: z.number(),
	iat: z.number(),
	at_hash: z.string(),
	nonce: z.string().optional(),
})

const Discovery = z.object({
	issuer: z.string(),
	authorization_endpoint: z.string(),
	token_endpoint: z.string(),
	userinfo_endpoint: z.string(),
	jwks_uri: z.string(),
})

const Tokens = z.object({
	access_token: z.string(),
	id_token: z.string(),
	token_type: z.literal('Bearer'),
	expires_in: z.number(),
	scope: z.string(),
})

const Keys = z.object({
	keys: z.array(z.object({ kty: z.literal('RSA'), kid: z.string(), n: z.string(), e: z.string() })),
})

/** How a sign-in played by `allerRetour` ended. `retour` is where Google sent the browser back. */
export type GoReturn = { retour: URL; dureeMs: number } & (
	| {
			issue: 'connecte'
			/** The ID token, its signature checked against the keys of the provider. */
			revendications: z.infer<typeof IdentityToken>
			/** What the profile endpoint says with the access token. */
			profil: Claims
	  }
	| { issue: 'refus'; erreur: string }
	| { issue: 'panne'; statut: number }
)

export interface GoReturnOptions {
	/** The address the application would be called back at. Made up by default: nothing is ever fetched there. */
	redirectUri?: string
	portee?: string[]
}

/** What a test may replace. Nothing to give on the bench. */
export interface Dependencies {
	/** Sends a request and gives the answer back as it is: a redirection is never followed. */
	requeter?: (requete: Request) => Promise<Response>
	maintenant?: () => number
}

export interface ToolFakeGoogle {
	/** Where the fake Google answers: the issuer the application is configured with. */
	emetteur: string
	/** The made-up client of the bench. */
	clientId: string
	secret: string
	/** Who signs in, and how it ends. Nothing asked: a verified, made-up person. */
	choisir: (demande?: Ask) => ChoiceReady
	/**
	 * Plays the browser: sends the authorization request with this choice, and gives the address
	 * Google sends the browser back to. Refuses an address that is not the fake Google's.
	 */
	autoriser: (adresse: string | URL, choix?: ChoiceReady) => Promise<URL>
	/** Plays a whole sign-in, as the application would: request, code, tokens, signature, profile. */
	allerRetour: (choix?: ChoiceReady, options?: GoReturnOptions) => Promise<GoReturn>
}

const HOST_LOCAL = ['localhost', '127.0.0.1', '[::1]']

const base64url = (octets: ArrayBuffer | Uint8Array): string =>
	Buffer.from(octets instanceof ArrayBuffer ? new Uint8Array(octets) : octets).toString('base64url')

const random = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)))

const sha256 = (texte: string): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))

const readJson = (morceau: string): unknown => JSON.parse(Buffer.from(morceau, 'base64url').toString('utf8'))

/**
 * The fake Google this process is set for. Throws `BancRefuse` when the environment names no
 * provider, a provider that is not on this machine, or credentials that could be real ones: a
 * test never talks to Google.
 */
export function fakeGoogle(variables: Variables = process.env, dependances: Dependencies = {}): ToolFakeGoogle {
	const { requeter: query = requete => fetch(requete), maintenant: now = Date.now } = dependances
	const issuer = variables.GOOGLE_OIDC_ISSUER
	if (!issuer)
		throw new RefusedBench(
			'Aucun faux Google n’est réglé (GOOGLE_OIDC_ISSUER manque). Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	const origin = URL.canParse(issuer) ? new URL(issuer) : undefined
	if (origin?.origin !== issuer || origin.protocol !== 'http:' || !HOST_LOCAL.includes(origin.hostname))
		throw new RefusedBench(
			'GOOGLE_OIDC_ISSUER ne désigne pas le faux Google du banc, sur ce poste : rien n’est envoyé. Un test ne parle jamais à Google.'
		)
	const clientId = variables.GOOGLE_CLIENT_ID ?? ''
	const secret = variables.GOOGLE_CLIENT_SECRET ?? ''
	if (!isFake(clientId) || !isFake(secret))
		throw new RefusedBench(
			'GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être ceux du banc, qui portent le mot « factice » : jamais un vrai secret Google dans un test.'
		)

	/** Asks the provider, and nobody else. */
	const makeRequest = (adresse: string | URL, init: RequestInit = {}): Promise<Response> => {
		const url = new URL(adresse)
		if (url.origin !== issuer)
			throw new RefusedBench('Cette adresse n’est pas celle du faux Google du banc : rien n’est envoyé.')
		return query(new Request(url, { ...init, redirect: 'manual' }))
	}

	const pick = (demande: Ask = {}): ChoiceReady => {
		const choice = composeChoice(demande)
		const value = encodeChoice(choice)
		return {
			choix: choice,
			enTetes: { Cookie: `${CHOICE_COOKIE}=${value}` },
			cookies: [
				{
					name: CHOICE_COOKIE,
					value: value,
					url: issuer,
					expires: Math.floor(now() / 1000) + 3600,
					httpOnly: true,
					secure: false,
					// Sent on the navigation from the site to the provider: a top-level GET.
					sameSite: 'Lax',
				},
			],
		}
	}

	const allow = async (adresse: string | URL, choix: ChoiceReady = pick()): Promise<URL> => {
		const response = await makeRequest(adresse, { headers: choix.enTetes })
		const returnUrl = response.headers.get('location')
		if (response.status !== 302 || !returnUrl)
			throw new Error(
				`Le faux Google n’a pas renvoyé le navigateur (réponse ${response.status}) : ${(await response.text()).trim()}`
			)
		return new URL(returnUrl)
	}

	async function checkToken(jeton: string, adresseDesCles: string, nonce: string, acces: string) {
		const [header = '', charge = '', signature = ''] = jeton.split('.')
		const { alg, kid } = z.object({ alg: z.string(), kid: z.string() }).parse(readJson(header))
		const key = Keys.parse(await (await makeRequest(adresseDesCles)).json()).keys.find(
			candidate => candidate.kid === kid
		)
		if (alg !== 'RS256' || !key)
			throw new Error('Jeton d’identité : signé par une clé que le fournisseur ne publie pas.')
		const publicOnes = await crypto.subtle.importKey(
			'jwk',
			key,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		)
		const signed = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicOnes,
			Buffer.from(signature, 'base64url'),
			new TextEncoder().encode(`${header}.${charge}`)
		)
		if (!signed) throw new Error('Jeton d’identité : signature fausse.')

		const claims = IdentityToken.parse(readJson(charge))
		const half = base64url(new Uint8Array(await sha256(acces)).slice(0, 16))
		const faults = [
			claims.iss !== issuer && 'iss',
			claims.aud !== clientId && 'aud',
			claims.nonce !== nonce && 'nonce',
			claims.at_hash !== half && 'at_hash',
			claims.exp * 1000 <= now() && 'exp',
		].filter(Boolean)
		if (faults.length > 0) throw new Error(`Jeton d’identité : revendications fausses (${faults.join(', ')}).`)
		return claims
	}

	const goReturn = async (
		choix: ChoiceReady = pick(),
		{
			redirectUri = `${variables.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100'}/retour-du-faux-google`,
			portee = ['openid', 'email', 'profile'],
		}: GoReturnOptions = {}
	): Promise<GoReturn> => {
		const startedAt = performance.now()
		const duration = () => performance.now() - startedAt
		const points = Discovery.parse(await (await makeRequest(`${issuer}/.well-known/openid-configuration`)).json())
		if (points.issuer !== issuer) throw new Error('Le fournisseur ne se présente pas sous l’adresse réglée.')

		const [state, nonce, proof] = [random(), random(), random()]
		const request = new URL(points.authorization_endpoint)
		request.search = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: portee.join(' '),
			state: state,
			nonce,
			code_challenge: base64url(await sha256(proof)),
			code_challenge_method: 'S256',
		}).toString()

		const returnUrl = await allow(request, choix)
		if (`${returnUrl.origin}${returnUrl.pathname}` !== redirectUri || returnUrl.searchParams.get('state') !== state)
			throw new Error('Le fournisseur n’a pas renvoyé le navigateur à l’adresse demandée, avec l’état demandé.')
		const error = returnUrl.searchParams.get('error')
		if (error) return { issue: 'refus', erreur: error, retour: returnUrl, dureeMs: duration() }

		const exchange = await makeRequest(points.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: returnUrl.searchParams.get('code') ?? '',
				redirect_uri: redirectUri,
				client_id: clientId,
				client_secret: secret,
				code_verifier: proof,
			}).toString(),
		})
		if (exchange.status >= 500)
			return { issue: 'panne', statut: exchange.status, retour: returnUrl, dureeMs: duration() }
		if (exchange.status !== 200)
			throw new Error(
				`Le fournisseur a refusé l’échange du code (réponse ${exchange.status}) : ${await exchange.text()}`
			)
		const tokens = Tokens.parse(await exchange.json())

		const claims = await checkToken(tokens.id_token, points.jwks_uri, nonce, tokens.access_token)
		const response = await makeRequest(points.userinfo_endpoint, {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		})
		if (response.status !== 200)
			throw new Error(`Le fournisseur a refusé le jeton d’accès (réponse ${response.status}).`)
		return {
			issue: 'connecte',
			revendications: claims,
			profil: Claims.parse(await response.json()),
			retour: returnUrl,
			dureeMs: duration(),
		}
	}

	return { emetteur: issuer, clientId, secret, choisir: pick, autoriser: allow, allerRetour: goReturn }
}
