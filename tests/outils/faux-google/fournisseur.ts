/**
 * The fake Google of the test bench: an OpenID Connect provider that answers the way Google
 * does, with made-up identities only. The application is pointed at it by configuration
 * (GOOGLE_OIDC_ISSUER) and goes through the same steps as with Google: discovery, authorization
 * request, exchange of the code, signed ID token, keys, profile.
 *
 * What it gives back is chosen by the test, in a cookie sent with the authorization request
 * (./identite.ts): one of four scenarios, and the identity. Without that cookie, a verified
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
 * it over HTTP (./serveur.ts), a unit test calls it directly. Web APIs only.
 */

import { type Choix, ChoixRefuse, COOKIE_DU_CHOIX, composerChoix, decoderChoix, estFactice } from './identite'

export interface Reglages {
	/** The address the provider is known under: the `iss` of every token. A local one, without a final slash. */
	emetteur: string
	/** The only client it knows. */
	clientId: string
	secret: string
	/** The clock, in milliseconds. A test gives its own to see a code expire. */
	maintenant?: () => number
}

export interface FauxGoogle {
	emetteur: string
	repondre: (requete: Request) => Promise<Response>
}

/** Google's own paths, so that an address built for Google lands on the same place here. */
export const CHEMINS = {
	decouverte: '/.well-known/openid-configuration',
	autorisation: '/o/oauth2/v2/auth',
	jeton: '/token',
	profil: '/v1/userinfo',
	cles: '/oauth2/v3/certs',
} as const

/** A code is exchanged within the minute, once. */
const DUREE_DU_CODE_MS = 60_000
/** What Google says of its access tokens: just under an hour. */
const DUREE_DE_L_ACCES_S = 3599
const DUREE_DU_JETON_D_IDENTITE_S = 3600

const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Nothing the provider says may be kept by a cache or leak through a referrer. */
const ENTETES = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } as const

interface Autorisation {
	choix: Choix
	redirectUri: string
	portee: string[]
	nonce: string | undefined
	defi: { valeur: string; methode: 'S256' | 'plain' } | undefined
	expire: number
}

interface Acces {
	choix: Choix
	portee: string[]
	expire: number
}

const base64url = (octets: ArrayBuffer | Uint8Array | string): string => {
	if (typeof octets === 'string') return Buffer.from(octets, 'utf8').toString('base64url')
	return Buffer.from(octets instanceof ArrayBuffer ? new Uint8Array(octets) : octets).toString('base64url')
}

const sha256 = (texte: string): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))

const aleatoire = (octets: number): string => base64url(crypto.getRandomValues(new Uint8Array(octets)))

const json = (corps: unknown, status = 200, entetes: Record<string, string> = {}): Response =>
	new Response(JSON.stringify(corps), {
		status,
		headers: { ...ENTETES, 'Content-Type': 'application/json; charset=utf-8', ...entetes },
	})

/** A page of the provider itself, as Google shows one when it cannot send the browser back. In plain text: nothing is echoed. */
const page = (status: number, code: string, explication: string): Response =>
	new Response(`Faux Google du banc de test. Erreur ${status} : ${code}\n${explication}\n`, {
		status,
		headers: { ...ENTETES, 'Content-Type': 'text/plain; charset=utf-8' },
	})

/** An error of the token endpoint, in the shape of RFC 6749. */
const refusDeJeton = (status: number, code: string, description: string): Response =>
	json({ error: code, error_description: description }, status)

const methodeRefusee = (admises: string): Response =>
	new Response(null, { status: 405, headers: { ...ENTETES, Allow: admises } })

/** An address of this machine, over http or https, without a fragment: the only place a browser is sent back to. */
function retourLocal(adresse: string): URL | undefined {
	const url = URL.canParse(adresse) ? new URL(adresse) : undefined
	if (!url || url.hash !== '' || !['http:', 'https:'].includes(url.protocol)) return undefined
	return HOTES_LOCAUX.has(url.hostname) ? url : undefined
}

function lireCookie(entete: string | null, nom: string): string | undefined {
	for (const morceau of (entete ?? '').split(';')) {
		const egal = morceau.indexOf('=')
		if (egal !== -1 && morceau.slice(0, egal).trim() === nom) return morceau.slice(egal + 1).trim()
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
function clientPresente(requete: Request, formulaire: URLSearchParams): { id: string | null; secret: string | null } {
	const [type, valeur] = (requete.headers.get('authorization') ?? '').split(' ')
	if (type?.toLowerCase() === 'basic' && valeur) {
		const [id = '', ...reste] = Buffer.from(valeur, 'base64').toString('utf8').split(':')
		return { id: decoder(id), secret: decoder(reste.join(':')) }
	}
	return { id: formulaire.get('client_id'), secret: formulaire.get('client_secret') }
}

/** What Google says about the person, by scope: an application that forgets to ask for `email` gets no address. */
function revendications({ identite, scenario }: Choix, portee: string[]): Record<string, unknown> {
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
export async function creerFauxGoogle(reglages: Reglages): Promise<FauxGoogle> {
	const { emetteur, clientId, secret, maintenant = Date.now } = reglages
	const origine = URL.canParse(emetteur) ? new URL(emetteur) : undefined
	if (!origine || origine.origin !== emetteur || origine.protocol !== 'http:' || !HOTES_LOCAUX.has(origine.hostname))
		throw new Error('Faux Google : son adresse doit être une adresse http de ce poste, sans « / » final.')
	if (!estFactice(clientId) || !estFactice(secret))
		throw new Error(
			'Faux Google : l’identifiant client et son secret doivent porter le mot « factice ». Jamais un vrai secret Google ici.'
		)

	const cles = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	)
	const kid = aleatoire(12)
	const { n, e } = await crypto.subtle.exportKey('jwk', cles.publicKey)
	const clePublique = { kty: 'RSA', alg: 'RS256', use: 'sig', kid, n, e }

	const autorisations = new Map<string, Autorisation>()
	const acces = new Map<string, Acces>()

	const oublierLesPerimes = (): void => {
		const instant = maintenant()
		for (const [code, { expire }] of autorisations) if (expire <= instant) autorisations.delete(code)
		for (const [jeton, { expire }] of acces) if (expire <= instant) acces.delete(jeton)
	}

	async function signer(charge: Record<string, unknown>): Promise<string> {
		const aSigner = `${base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))}.${base64url(JSON.stringify(charge))}`
		const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cles.privateKey, new TextEncoder().encode(aSigner))
		return `${aSigner}.${base64url(signature)}`
	}

	const decouverte = (): Response =>
		json({
			issuer: emetteur,
			authorization_endpoint: `${emetteur}${CHEMINS.autorisation}`,
			token_endpoint: `${emetteur}${CHEMINS.jeton}`,
			userinfo_endpoint: `${emetteur}${CHEMINS.profil}`,
			jwks_uri: `${emetteur}${CHEMINS.cles}`,
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
	function autoriser(requete: Request, url: URL): Response {
		const parametres = url.searchParams
		// Like Google, the two faults below are shown on the provider's own page: nowhere safe to send the browser.
		if (parametres.get('client_id') !== clientId)
			return page(401, 'invalid_client', 'Ce client n’est pas celui du banc de test : vérifie GOOGLE_CLIENT_ID.')
		const redirectUri = parametres.get('redirect_uri')
		const cible = redirectUri ? retourLocal(redirectUri) : undefined
		if (!redirectUri || !cible)
			return page(
				400,
				'redirect_uri_mismatch',
				'Le faux Google ne renvoie le navigateur que vers une adresse de ce poste (localhost ou 127.0.0.1).'
			)

		const renvoyer = (reponse: Record<string, string>): Response => {
			for (const [nom, valeur] of Object.entries(reponse)) cible.searchParams.set(nom, valeur)
			const etat = parametres.get('state')
			if (etat !== null) cible.searchParams.set('state', etat)
			return new Response(null, { status: 302, headers: { ...ENTETES, Location: cible.href } })
		}

		if (parametres.get('response_type') !== 'code') return renvoyer({ error: 'unsupported_response_type' })
		const portee = (parametres.get('scope') ?? '').split(/\s+/).filter(Boolean)
		if (!portee.includes('openid')) return renvoyer({ error: 'invalid_scope' })
		const valeurDuDefi = parametres.get('code_challenge')
		const methode = parametres.get('code_challenge_method') ?? 'plain'
		if (valeurDuDefi !== null && methode !== 'S256' && methode !== 'plain')
			return renvoyer({ error: 'invalid_request' })

		let choix: Choix
		try {
			const cookie = lireCookie(requete.headers.get('cookie'), COOKIE_DU_CHOIX)
			choix = cookie === undefined ? composerChoix() : decoderChoix(cookie)
		} catch (erreur) {
			if (!(erreur instanceof ChoixRefuse)) throw erreur
			return page(400, 'choix_refuse', erreur.message)
		}

		if (choix.scenario === 'refus') return renvoyer({ error: 'access_denied' })

		oublierLesPerimes()
		const code = aleatoire(32)
		autorisations.set(code, {
			choix,
			redirectUri,
			portee,
			nonce: parametres.get('nonce') ?? undefined,
			defi:
				valeurDuDefi === null ? undefined : { valeur: valeurDuDefi, methode: methode === 'S256' ? 'S256' : 'plain' },
			expire: maintenant() + DUREE_DU_CODE_MS,
		})
		// The extra parameters Google adds to its own answer: an application must not choke on them.
		return renvoyer({ code, scope: portee.join(' '), authuser: '0', prompt: 'none' })
	}

	async function echanger(requete: Request): Promise<Response> {
		if (!(requete.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded'))
			return refusDeJeton(400, 'invalid_request', 'Un formulaire application/x-www-form-urlencoded est attendu.')
		const formulaire = new URLSearchParams(await requete.text())
		const code = formulaire.get('code') ?? ''
		const autorisation = autorisations.get(code)

		// An outage does not look at who is asking: it comes before every other check, and the
		// code stays good, so that a second try fails the same way.
		if (autorisation?.choix.scenario === 'panne' && autorisation.expire > maintenant())
			return new Response('<!doctype html><title>503</title><h1>503 Service Unavailable</h1>\n', {
				status: 503,
				headers: { ...ENTETES, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30' },
			})

		const client = clientPresente(requete, formulaire)
		if (client.id !== clientId || client.secret !== secret)
			return refusDeJeton(401, 'invalid_client', 'Client ou secret inconnu du banc de test.')
		if (formulaire.get('grant_type') !== 'authorization_code')
			return refusDeJeton(400, 'unsupported_grant_type', 'Seul « authorization_code » est accepté.')

		// A code is good once: it is forgotten as soon as it is presented, whatever comes next.
		autorisations.delete(code)
		if (!autorisation || autorisation.expire <= maintenant())
			return refusDeJeton(400, 'invalid_grant', 'Code inconnu, déjà échangé ou expiré.')
		if (formulaire.get('redirect_uri') !== autorisation.redirectUri)
			return refusDeJeton(400, 'redirect_uri_mismatch', 'redirect_uri diffère de celle de la demande d’autorisation.')
		if (autorisation.defi) {
			const preuve = formulaire.get('code_verifier') ?? ''
			const attendue = autorisation.defi.methode === 'S256' ? base64url(await sha256(preuve)) : preuve
			if (preuve === '' || attendue !== autorisation.defi.valeur)
				return refusDeJeton(400, 'invalid_grant', 'code_verifier absent ou faux.')
		}

		const { choix, portee, nonce } = autorisation
		const jetonDAcces = aleatoire(32)
		const secondes = Math.floor(maintenant() / 1000)
		oublierLesPerimes()
		acces.set(jetonDAcces, { choix, portee, expire: maintenant() + DUREE_DE_L_ACCES_S * 1000 })
		const jetonDIdentite = await signer({
			iss: emetteur,
			azp: clientId,
			aud: clientId,
			...revendications(choix, portee),
			at_hash: base64url(new Uint8Array(await sha256(jetonDAcces)).slice(0, 16)),
			...(nonce === undefined ? {} : { nonce }),
			iat: secondes,
			exp: secondes + DUREE_DU_JETON_D_IDENTITE_S,
		})
		return json({
			access_token: jetonDAcces,
			expires_in: DUREE_DE_L_ACCES_S,
			scope: portee.join(' '),
			token_type: 'Bearer',
			id_token: jetonDIdentite,
		})
	}

	function profil(requete: Request): Response {
		const [type, jeton] = (requete.headers.get('authorization') ?? '').split(' ')
		const connu = type?.toLowerCase() === 'bearer' && jeton ? acces.get(jeton) : undefined
		if (!connu || connu.expire <= maintenant())
			return json({ error: 'invalid_token', error_description: 'Jeton d’accès inconnu ou expiré.' }, 401, {
				'WWW-Authenticate': 'Bearer error="invalid_token"',
			})
		return json(revendications(connu.choix, connu.portee))
	}

	async function router(requete: Request): Promise<Response> {
		const url = new URL(requete.url)
		const lecture = requete.method === 'GET' || requete.method === 'HEAD'
		switch (url.pathname) {
			case '/':
				return new Response(
					'Faux Google du banc de test de My Makeup. Rien ici n’est réel : ni compte, ni secret. Voir docs/tests/banc.md.\n',
					{ headers: { ...ENTETES, 'Content-Type': 'text/plain; charset=utf-8' } }
				)
			case CHEMINS.decouverte:
				return lecture ? decouverte() : methodeRefusee('GET, HEAD')
			case CHEMINS.cles:
				return lecture ? json({ keys: [clePublique] }) : methodeRefusee('GET, HEAD')
			case CHEMINS.autorisation:
				return requete.method === 'GET' ? autoriser(requete, url) : methodeRefusee('GET')
			case CHEMINS.jeton:
				return requete.method === 'POST' ? echanger(requete) : methodeRefusee('POST')
			case CHEMINS.profil:
				return requete.method === 'GET' || requete.method === 'POST' ? profil(requete) : methodeRefusee('GET, POST')
			default:
				return page(404, 'not_found', 'Le faux Google ne connaît pas cette adresse.')
		}
	}

	return {
		emetteur,
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
