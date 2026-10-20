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
 * The provider itself runs in a container of the bench (compose.test.yml, service « faux-google »,
 * code in tests/outils/faux-google/). The application is pointed at it by GOOGLE_OIDC_ISSUER.
 *
 * `allerRetour` plays a whole sign-in as an application would, tokens checked: it proves the
 * provider, and is not the sign-in of the application.
 *
 * Nothing of bun here: Playwright loads this file under Node.
 */

import { z } from 'zod'
import { BancRefuse, type Variables } from './bench'
import {
	type Choix,
	COOKIE_DU_CHOIX,
	composerChoix,
	type Demande,
	encoderChoix,
	estFactice,
} from './fake-google/identity'
import type { CookieDeNavigateur } from './session'

export { type Choix, type Demande, type Identite, SCENARIOS, type Scenario } from './fake-google/identity'

/** A choice, ready to travel with the authorization request. */
export interface ChoixPret {
	choix: Choix
	/** For a client that is not a browser: the header to send with the authorization request. */
	enTetes: { Cookie: string }
	/** For a browser: `await context.addCookies(choix.cookies)`, before the click on the Google button. */
	cookies: CookieDeNavigateur[]
}

/** What Google says about the person, in an ID token or at the profile endpoint. */
const Revendications = z.looseObject({
	sub: z.string(),
	email: z.string().optional(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
	given_name: z.string().optional(),
	family_name: z.string().optional(),
	picture: z.string().optional(),
})

export type Revendications = z.infer<typeof Revendications>

const JetonDIdentite = Revendications.extend({
	iss: z.string(),
	aud: z.string(),
	exp: z.number(),
	iat: z.number(),
	at_hash: z.string(),
	nonce: z.string().optional(),
})

const Decouverte = z.object({
	issuer: z.string(),
	authorization_endpoint: z.string(),
	token_endpoint: z.string(),
	userinfo_endpoint: z.string(),
	jwks_uri: z.string(),
})

const Jetons = z.object({
	access_token: z.string(),
	id_token: z.string(),
	token_type: z.literal('Bearer'),
	expires_in: z.number(),
	scope: z.string(),
})

const Cles = z.object({
	keys: z.array(z.object({ kty: z.literal('RSA'), kid: z.string(), n: z.string(), e: z.string() })),
})

/** How a sign-in played by `allerRetour` ended. `retour` is where Google sent the browser back. */
export type AllerRetour = { retour: URL; dureeMs: number } & (
	| {
			issue: 'connecte'
			/** The ID token, its signature checked against the keys of the provider. */
			revendications: z.infer<typeof JetonDIdentite>
			/** What the profile endpoint says with the access token. */
			profil: Revendications
	  }
	| { issue: 'refus'; erreur: string }
	| { issue: 'panne'; statut: number }
)

export interface OptionsDAllerRetour {
	/** The address the application would be called back at. Made up by default: nothing is ever fetched there. */
	redirectUri?: string
	portee?: string[]
}

/** What a test may replace. Nothing to give on the bench. */
export interface Dependances {
	/** Sends a request and gives the answer back as it is: a redirection is never followed. */
	requeter?: (requete: Request) => Promise<Response>
	maintenant?: () => number
}

export interface OutilFauxGoogle {
	/** Where the fake Google answers: the issuer the application is configured with. */
	emetteur: string
	/** The made-up client of the bench. */
	clientId: string
	secret: string
	/** Who signs in, and how it ends. Nothing asked: a verified, made-up person. */
	choisir: (demande?: Demande) => ChoixPret
	/**
	 * Plays the browser: sends the authorization request with this choice, and gives the address
	 * Google sends the browser back to. Refuses an address that is not the fake Google's.
	 */
	autoriser: (adresse: string | URL, choix?: ChoixPret) => Promise<URL>
	/** Plays a whole sign-in, as the application would: request, code, tokens, signature, profile. */
	allerRetour: (choix?: ChoixPret, options?: OptionsDAllerRetour) => Promise<AllerRetour>
}

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']

const base64url = (octets: ArrayBuffer | Uint8Array): string =>
	Buffer.from(octets instanceof ArrayBuffer ? new Uint8Array(octets) : octets).toString('base64url')

const aleatoire = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)))

const sha256 = (texte: string): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))

const lireJson = (morceau: string): unknown => JSON.parse(Buffer.from(morceau, 'base64url').toString('utf8'))

/**
 * The fake Google this process is set for. Throws `BancRefuse` when the environment names no
 * provider, a provider that is not on this machine, or credentials that could be real ones: a
 * test never talks to Google.
 */
export function fauxGoogle(variables: Variables = process.env, dependances: Dependances = {}): OutilFauxGoogle {
	const { requeter = requete => fetch(requete), maintenant = Date.now } = dependances
	const emetteur = variables.GOOGLE_OIDC_ISSUER
	if (!emetteur)
		throw new BancRefuse(
			'Aucun faux Google n’est réglé (GOOGLE_OIDC_ISSUER manque). Démarre le banc par « bun run banc:up », puis lance les tests par « bun run test:integration ».'
		)
	const origine = URL.canParse(emetteur) ? new URL(emetteur) : undefined
	if (origine?.origin !== emetteur || origine.protocol !== 'http:' || !HOTES_LOCAUX.includes(origine.hostname))
		throw new BancRefuse(
			'GOOGLE_OIDC_ISSUER ne désigne pas le faux Google du banc, sur ce poste : rien n’est envoyé. Un test ne parle jamais à Google.'
		)
	const clientId = variables.GOOGLE_CLIENT_ID ?? ''
	const secret = variables.GOOGLE_CLIENT_SECRET ?? ''
	if (!estFactice(clientId) || !estFactice(secret))
		throw new BancRefuse(
			'GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être ceux du banc, qui portent le mot « factice » : jamais un vrai secret Google dans un test.'
		)

	/** Asks the provider, and nobody else. */
	const demander = (adresse: string | URL, init: RequestInit = {}): Promise<Response> => {
		const url = new URL(adresse)
		if (url.origin !== emetteur)
			throw new BancRefuse('Cette adresse n’est pas celle du faux Google du banc : rien n’est envoyé.')
		return requeter(new Request(url, { ...init, redirect: 'manual' }))
	}

	const choisir = (demande: Demande = {}): ChoixPret => {
		const choix = composerChoix(demande)
		const valeur = encoderChoix(choix)
		return {
			choix,
			enTetes: { Cookie: `${COOKIE_DU_CHOIX}=${valeur}` },
			cookies: [
				{
					name: COOKIE_DU_CHOIX,
					value: valeur,
					url: emetteur,
					expires: Math.floor(maintenant() / 1000) + 3600,
					httpOnly: true,
					secure: false,
					// Sent on the navigation from the site to the provider: a top-level GET.
					sameSite: 'Lax',
				},
			],
		}
	}

	const autoriser = async (adresse: string | URL, choix: ChoixPret = choisir()): Promise<URL> => {
		const reponse = await demander(adresse, { headers: choix.enTetes })
		const retour = reponse.headers.get('location')
		if (reponse.status !== 302 || !retour)
			throw new Error(
				`Le faux Google n’a pas renvoyé le navigateur (réponse ${reponse.status}) : ${(await reponse.text()).trim()}`
			)
		return new URL(retour)
	}

	async function verifierLeJeton(jeton: string, adresseDesCles: string, nonce: string, acces: string) {
		const [entete = '', charge = '', signature = ''] = jeton.split('.')
		const { alg, kid } = z.object({ alg: z.string(), kid: z.string() }).parse(lireJson(entete))
		const cle = Cles.parse(await (await demander(adresseDesCles)).json()).keys.find(candidate => candidate.kid === kid)
		if (alg !== 'RS256' || !cle)
			throw new Error('Jeton d’identité : signé par une clé que le fournisseur ne publie pas.')
		const publique = await crypto.subtle.importKey('jwk', cle, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
			'verify',
		])
		const signe = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publique,
			Buffer.from(signature, 'base64url'),
			new TextEncoder().encode(`${entete}.${charge}`)
		)
		if (!signe) throw new Error('Jeton d’identité : signature fausse.')

		const revendications = JetonDIdentite.parse(lireJson(charge))
		const moitie = base64url(new Uint8Array(await sha256(acces)).slice(0, 16))
		const fautes = [
			revendications.iss !== emetteur && 'iss',
			revendications.aud !== clientId && 'aud',
			revendications.nonce !== nonce && 'nonce',
			revendications.at_hash !== moitie && 'at_hash',
			revendications.exp * 1000 <= maintenant() && 'exp',
		].filter(Boolean)
		if (fautes.length > 0) throw new Error(`Jeton d’identité : revendications fausses (${fautes.join(', ')}).`)
		return revendications
	}

	const allerRetour = async (
		choix: ChoixPret = choisir(),
		{
			redirectUri = `${variables.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100'}/retour-du-faux-google`,
			portee = ['openid', 'email', 'profile'],
		}: OptionsDAllerRetour = {}
	): Promise<AllerRetour> => {
		const debut = performance.now()
		const duree = () => performance.now() - debut
		const points = Decouverte.parse(await (await demander(`${emetteur}/.well-known/openid-configuration`)).json())
		if (points.issuer !== emetteur) throw new Error('Le fournisseur ne se présente pas sous l’adresse réglée.')

		const [etat, nonce, preuve] = [aleatoire(), aleatoire(), aleatoire()]
		const demande = new URL(points.authorization_endpoint)
		demande.search = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: portee.join(' '),
			state: etat,
			nonce,
			code_challenge: base64url(await sha256(preuve)),
			code_challenge_method: 'S256',
		}).toString()

		const retour = await autoriser(demande, choix)
		if (`${retour.origin}${retour.pathname}` !== redirectUri || retour.searchParams.get('state') !== etat)
			throw new Error('Le fournisseur n’a pas renvoyé le navigateur à l’adresse demandée, avec l’état demandé.')
		const erreur = retour.searchParams.get('error')
		if (erreur) return { issue: 'refus', erreur, retour, dureeMs: duree() }

		const echange = await demander(points.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: retour.searchParams.get('code') ?? '',
				redirect_uri: redirectUri,
				client_id: clientId,
				client_secret: secret,
				code_verifier: preuve,
			}).toString(),
		})
		if (echange.status >= 500) return { issue: 'panne', statut: echange.status, retour, dureeMs: duree() }
		if (echange.status !== 200)
			throw new Error(`Le fournisseur a refusé l’échange du code (réponse ${echange.status}) : ${await echange.text()}`)
		const jetons = Jetons.parse(await echange.json())

		const revendications = await verifierLeJeton(jetons.id_token, points.jwks_uri, nonce, jetons.access_token)
		const reponse = await demander(points.userinfo_endpoint, {
			headers: { Authorization: `Bearer ${jetons.access_token}` },
		})
		if (reponse.status !== 200) throw new Error(`Le fournisseur a refusé le jeton d’accès (réponse ${reponse.status}).`)
		return {
			issue: 'connecte',
			revendications,
			profil: Revendications.parse(await reponse.json()),
			retour,
			dureeMs: duree(),
		}
	}

	return { emetteur, clientId, secret, choisir, autoriser, allerRetour }
}
