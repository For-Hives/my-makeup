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

const DELAI_MAX_MS = 10_000
const VIE_DE_LA_DEMANDE_S = 10 * 60
const TOLERANCE_HORLOGE_S = 60
const DUREE_DES_DOCUMENTS_MS = 60 * 60 * 1000

/** Sends a request and gives the answer: `fetch`, or a double in a test. */
export type Requeter = (url: string, init?: RequestInit) => Promise<Response>

const requeterParDefaut: Requeter = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(DELAI_MAX_MS) })

export interface ConfigGoogle {
	/** The issuer: `https://accounts.google.com`, or the fake Google of the bench. */
	emetteur: string
	clientId: string
	clientSecret: string
	/** Where the provider sends the browser back: the site's own address, never read from a request. */
	redirectUri: string
}

/** The sign-in cannot go on, for a reason that is the provider's or the network's, not the visitor's. */
export class GoogleIndisponible extends Error {
	constructor(message = 'Google ne répond pas comme prévu.') {
		super(message)
		this.name = 'GoogleIndisponible'
	}
}

// ---------------------------------------------------------------------------------------------
// Discovery and keys
// ---------------------------------------------------------------------------------------------

const Decouverte = z.object({
	issuer: z.string(),
	authorization_endpoint: z.string(),
	token_endpoint: z.string(),
	jwks_uri: z.string(),
})
export type Decouverte = z.infer<typeof Decouverte>

const Cles = z.object({
	keys: z.array(
		z.looseObject({ kty: z.string(), kid: z.string().optional(), n: z.string().optional(), e: z.string().optional() })
	),
})
type CleJwk = z.infer<typeof Cles>['keys'][number]

const estLocal = (emetteur: string): boolean => !emetteur.startsWith('https://')

/** An endpoint is believed when it is https, or on the host of a local issuer. */
function adresseDeConfiance(valeur: string, emetteur: string): boolean {
	if (!URL.canParse(valeur)) return false
	const url = new URL(valeur)
	if (estLocal(emetteur)) return url.origin === new URL(emetteur).origin
	return url.protocol === 'https:' && url.username === '' && url.password === ''
}

const documents = new Map<string, { jusqua: number; valeur: unknown }>()

async function documentEnCache<T>(
	cle: string,
	maintenant: number,
	lire: () => Promise<T>,
	conserver: boolean
): Promise<T> {
	const garde = documents.get(cle)
	if (conserver && garde && garde.jusqua > maintenant) return garde.valeur as T
	const valeur = await lire()
	documents.set(cle, { jusqua: maintenant + DUREE_DES_DOCUMENTS_MS, valeur })
	return valeur
}

/** Forgets what was read about the providers: the tests start from nothing. */
export const oublierLesDocuments = (): void => documents.clear()

async function lireJson(reponse: Response): Promise<unknown> {
	if (!reponse.ok) throw new GoogleIndisponible()
	try {
		return await reponse.json()
	} catch {
		throw new GoogleIndisponible()
	}
}

/** The discovery document of the issuer, kept for an hour. */
export async function decouvrir(
	emetteur: string,
	{ requeter = requeterParDefaut, maintenant = Date.now }: { requeter?: Requeter; maintenant?: () => number } = {}
): Promise<Decouverte> {
	return documentEnCache(
		`decouverte:${emetteur}`,
		maintenant(),
		async () => {
			const lu = Decouverte.safeParse(await lireJson(await requeter(`${emetteur}/.well-known/openid-configuration`)))
			if (!lu.success || lu.data.issuer !== emetteur) throw new GoogleIndisponible()
			const adresses = [lu.data.authorization_endpoint, lu.data.token_endpoint, lu.data.jwks_uri]
			if (!adresses.every(adresse => adresseDeConfiance(adresse, emetteur))) throw new GoogleIndisponible()
			return lu.data
		},
		true
	)
}

async function cleDeSignature(
	decouverte: Decouverte,
	kid: string,
	{ requeter, maintenant }: { requeter: Requeter; maintenant: () => number }
): Promise<CleJwk | undefined> {
	const chercher = (cles: CleJwk[]) => cles.find(cle => cle.kid === kid && cle.kty === 'RSA' && cle.n && cle.e)
	const lire = async () => {
		const lu = Cles.safeParse(await lireJson(await requeter(decouverte.jwks_uri)))
		if (!lu.success) throw new GoogleIndisponible()
		return lu.data.keys
	}
	const cle = `cles:${decouverte.jwks_uri}`
	const connue = chercher(await documentEnCache(cle, maintenant(), lire, true))
	if (connue) return connue
	// A key published since: read the set again once, then give up.
	return chercher(await documentEnCache(cle, maintenant(), lire, false))
}

// ---------------------------------------------------------------------------------------------
// The request, and the sealed cookie that keeps its secrets until the return
// ---------------------------------------------------------------------------------------------

const aleatoire = (octets = 32): string => randomBytes(octets).toString('base64url')

const sha256Base64Url = (texte: string): string => createHash('sha256').update(texte).digest('base64url')

/** What the browser's cookie keeps between the departure and the return. */
export interface DemandeEnCours {
	state: string
	nonce: string
	/** The PKCE verifier. */
	verifier: string
	/** The page to come back to: already reduced to a path of this site by the caller. */
	retour: string
	/** When the request ends, Unix seconds. */
	expire: number
}

export interface Depart {
	/** The address of the consent screen of the provider. */
	adresse: string
	/** The value of the sealed cookie. */
	cookie: string
}

/** Builds the request and the cookie that must come back with the answer. */
export function preparerLeDepart(
	config: ConfigGoogle,
	decouverte: Decouverte,
	{ retour, secret, maintenant = Date.now }: { retour: string; secret: string; maintenant?: () => number }
): Depart {
	const demande: DemandeEnCours = {
		state: aleatoire(),
		nonce: aleatoire(),
		verifier: aleatoire(),
		retour,
		expire: Math.floor(maintenant() / 1000) + VIE_DE_LA_DEMANDE_S,
	}
	const adresse = new URL(decouverte.authorization_endpoint)
	adresse.search = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state: demande.state,
		nonce: demande.nonce,
		code_challenge: sha256Base64Url(demande.verifier),
		code_challenge_method: 'S256',
	}).toString()
	return { adresse: adresse.toString(), cookie: sceller(demande, secret) }
}

const signature = (charge: string, secret: string): string =>
	createHmac('sha256', secret).update(`google-oidc:${charge}`).digest('base64url')

/** `charge.signature`, the charge being the request in base64url JSON. */
export function sceller(demande: DemandeEnCours, secret: string): string {
	const charge = Buffer.from(JSON.stringify(demande)).toString('base64url')
	return `${charge}.${signature(charge, secret)}`
}

const Demande = z.object({
	state: z.string().min(1),
	nonce: z.string().min(1),
	verifier: z.string().min(1),
	retour: z.string(),
	expire: z.number(),
})

/** The request a cookie holds, if our signature is on it and it has not ended; nothing otherwise. */
export function ouvrirLeCookie(
	valeur: string | undefined,
	secret: string,
	maintenant: () => number = Date.now
): DemandeEnCours | undefined {
	if (!valeur) return undefined
	const [charge = '', recue = '', reste] = valeur.split('.')
	if (reste !== undefined || charge === '' || recue === '') return undefined
	const attendue = signature(charge, secret)
	const a = Buffer.from(recue)
	const b = Buffer.from(attendue)
	if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
	try {
		const demande = Demande.parse(JSON.parse(Buffer.from(charge, 'base64url').toString('utf8')))
		return demande.expire * 1000 > maintenant() ? demande : undefined
	} catch {
		return undefined
	}
}

// ---------------------------------------------------------------------------------------------
// The return: code to token, token to claims
// ---------------------------------------------------------------------------------------------

/** What Google says about the person, once its ID token has been checked. */
export interface Revendications {
	sub: string
	email?: string
	emailVerifie: boolean
	nom?: string
}

const Jetons = z.object({ id_token: z.string().min(1) })

const Entete = z.object({ alg: z.string(), kid: z.string() })

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
function emetteursAcceptes(emetteur: string): string[] {
	return emetteur === 'https://accounts.google.com' ? [emetteur, 'accounts.google.com'] : [emetteur]
}

export interface DependancesDuRetour {
	requeter?: Requeter
	maintenant?: () => number
}

/**
 * Exchanges the code for the ID token and checks it. Throws `GoogleIndisponible` when the provider
 * fails, and `JetonRefuse` when what it sent cannot be believed.
 */
export async function revendicationsDuCode(
	config: ConfigGoogle,
	decouverte: Decouverte,
	{ code, demande }: { code: string; demande: DemandeEnCours },
	{ requeter = requeterParDefaut, maintenant = Date.now }: DependancesDuRetour = {}
): Promise<Revendications> {
	let reponse: Response
	try {
		reponse = await requeter(decouverte.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: config.redirectUri,
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code_verifier: demande.verifier,
			}).toString(),
			redirect: 'error',
		})
	} catch {
		throw new GoogleIndisponible()
	}
	// A 4xx is the provider refusing a code it does not know (used twice, forged): not an outage.
	if (reponse.status >= 400 && reponse.status < 500) throw new JetonRefuse()
	const jetons = Jetons.safeParse(await lireJson(reponse))
	if (!jetons.success) throw new JetonRefuse()
	return verifierLeJeton(jetons.data.id_token, config, decouverte, demande.nonce, { requeter, maintenant })
}

/** What the provider sent cannot be believed: a bad signature, issuer, audience, nonce or date. */
export class JetonRefuse extends Error {
	constructor() {
		super('Le jeton d’identité est refusé.')
		this.name = 'JetonRefuse'
	}
}

export async function verifierLeJeton(
	jeton: string,
	config: ConfigGoogle,
	decouverte: Decouverte,
	nonce: string,
	{ requeter = requeterParDefaut, maintenant = Date.now }: DependancesDuRetour = {}
): Promise<Revendications> {
	const morceaux = jeton.split('.')
	if (morceaux.length !== 3) throw new JetonRefuse()
	const [enteteBrut = '', chargeBrute = '', signatureBrute = ''] = morceaux
	let entete: z.infer<typeof Entete>
	let charge: z.infer<typeof Charge>
	try {
		entete = Entete.parse(decoder(enteteBrut))
		charge = Charge.parse(decoder(chargeBrute))
	} catch {
		throw new JetonRefuse()
	}
	// Only RS256: a token that asks for `none` or for a symmetric algorithm is a forgery.
	if (entete.alg !== 'RS256') throw new JetonRefuse()
	const jwk = await cleDeSignature(decouverte, entete.kid, { requeter, maintenant })
	if (!jwk) throw new JetonRefuse()
	let signe = false
	try {
		const cle = await crypto.subtle.importKey(
			'jwk',
			{ kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		)
		signe = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			cle,
			Buffer.from(signatureBrute, 'base64url'),
			new TextEncoder().encode(`${enteteBrut}.${chargeBrute}`)
		)
	} catch {
		throw new JetonRefuse()
	}
	if (!signe) throw new JetonRefuse()

	const maintenantS = Math.floor(maintenant() / 1000)
	const audiences = Array.isArray(charge.aud) ? charge.aud : [charge.aud]
	const azp = typeof charge.azp === 'string' ? charge.azp : undefined
	const fautes =
		!emetteursAcceptes(config.emetteur).includes(charge.iss) ||
		!audiences.includes(config.clientId) ||
		(audiences.length > 1 && azp !== config.clientId) ||
		charge.exp + TOLERANCE_HORLOGE_S <= maintenantS ||
		(charge.iat !== undefined && charge.iat - TOLERANCE_HORLOGE_S > maintenantS) ||
		charge.nonce !== nonce
	if (fautes) throw new JetonRefuse()

	const nom =
		charge.name?.trim() || [charge.given_name, charge.family_name].filter(Boolean).join(' ').trim() || undefined
	return {
		sub: charge.sub,
		...(charge.email !== undefined && { email: charge.email }),
		emailVerifie: charge.email_verified === true || charge.email_verified === 'true',
		...(nom !== undefined && { nom }),
	}
}
