import { beforeEach, describe, expect, test } from 'bun:test'
import { adresseNormalisee, nomDuCompte } from '@/lib/auth/google/account'
import {
	type ConfigGoogle,
	type DemandeEnCours,
	decouvrir,
	GoogleIndisponible,
	JetonRefuse,
	oublierLesDocuments,
	ouvrirLeCookie,
	preparerLeDepart,
	revendicationsDuCode,
	sceller,
	verifierLeJeton,
} from '@/lib/auth/google/oidc'

/**
 * The OpenID Connect client of the Google sign-in (ticket 090): what it asks, and what it believes.
 * A provider is played in the test: its keys are made here, its answers are a function of the request.
 */

const EMETTEUR = 'https://accounts.google.com'
const CLIENT = 'client-factice.example.test'
const SECRET = 'secret-factice-du-client'
const CLE_DE_SCEAU = 'une-cle-de-sceau-qui-fait-plus-de-32-caracteres'
const config: ConfigGoogle = {
	emetteur: EMETTEUR,
	clientId: CLIENT,
	clientSecret: SECRET,
	redirectUri: 'https://my-makeup.example.test/auth/google/callback',
}
const MAINTENANT = Date.UTC(2026, 9, 14, 12, 0, 0)
const maintenant = () => MAINTENANT
const dans = (secondes: number) => Math.floor(MAINTENANT / 1000) + secondes

const base64url = (donnees: string | Uint8Array) => Buffer.from(donnees).toString('base64url')

async function fabriquerUneCle() {
	const paire = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	)
	const jwk = await crypto.subtle.exportKey('jwk', paire.publicKey)
	return { privee: paire.privateKey, publique: { ...jwk, kid: 'cle-1', alg: 'RS256', use: 'sig' } }
}

const cle = await fabriquerUneCle()
const autreCle = await fabriquerUneCle()

async function signer(
	charge: Record<string, unknown>,
	{ alg = 'RS256', avec = cle.privee, kid = 'cle-1' }: { alg?: string; avec?: CryptoKey; kid?: string } = {}
): Promise<string> {
	const entete = base64url(JSON.stringify({ alg, kid, typ: 'JWT' }))
	const corps = base64url(JSON.stringify(charge))
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', avec, new TextEncoder().encode(`${entete}.${corps}`))
	return `${entete}.${corps}.${base64url(new Uint8Array(signature))}`
}

const chargeValide = (en: Record<string, unknown> = {}) => ({
	iss: EMETTEUR,
	aud: CLIENT,
	sub: 'sub-fictif',
	email: 'lea@example.test',
	email_verified: true,
	name: 'Léa Fictive',
	nonce: 'nonce-attendu',
	iat: dans(-5),
	exp: dans(3600),
	...en,
})

const decouverteValide = {
	issuer: EMETTEUR,
	authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
	token_endpoint: 'https://oauth2.googleapis.com/token',
	jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
}

const json = (corps: unknown, statut = 200) =>
	new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

/** A provider: discovery, keys and the token endpoint, which answers with the token the test chose. */
function fournisseur(idToken: () => Promise<string>, decouverte: Record<string, unknown> = decouverteValide) {
	const vues: { url: string; init?: RequestInit }[] = []
	const requeter = async (url: string, init?: RequestInit): Promise<Response> => {
		vues.push({ url, init })
		if (url.endsWith('/.well-known/openid-configuration')) return json(decouverte)
		if (url === decouverteValide.jwks_uri) return json({ keys: [cle.publique] })
		if (url === decouverteValide.token_endpoint)
			return json({ access_token: 'acces-fictif', id_token: await idToken() })
		return new Response('introuvable', { status: 404 })
	}
	return { requeter, vues }
}

const demande: DemandeEnCours = {
	state: 'state',
	nonce: 'nonce-attendu',
	verifier: 'verifier-fictif',
	retour: '/auth/profil',
	expire: dans(600),
}

beforeEach(() => oublierLesDocuments())

describe('le départ vers Google', () => {
	test('la demande porte le client, le retour, le state, le nonce et le défi PKCE S256, sans le secret', () => {
		const { adresse } = preparerLeDepart(config, decouverteValide as never, {
			retour: '/auth/profil',
			secret: CLE_DE_SCEAU,
			maintenant,
		})
		const url = new URL(adresse)
		expect(url.origin + url.pathname).toBe(decouverteValide.authorization_endpoint)
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			client_id: CLIENT,
			redirect_uri: config.redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			code_challenge_method: 'S256',
		})
		expect(url.searchParams.get('state')?.length).toBeGreaterThan(30)
		expect(url.searchParams.get('nonce')?.length).toBeGreaterThan(30)
		expect(adresse).not.toContain(SECRET)
	})

	test('le cookie rend ce que le départ a gardé, et le state du cookie est celui de l’adresse', () => {
		const depart = preparerLeDepart(config, decouverteValide as never, {
			retour: '/blog',
			secret: CLE_DE_SCEAU,
			maintenant,
		})
		const garde = ouvrirLeCookie(depart.cookie, CLE_DE_SCEAU, maintenant)
		expect(garde?.retour).toBe('/blog')
		expect(garde?.state).toBe(new URL(depart.adresse).searchParams.get('state') ?? undefined)
		expect(garde?.expire).toBe(dans(600))
	})

	test('le cookie ne vaut rien : changé, signé par une autre clé, périmé, ou sans signature', () => {
		const bon = sceller(demande, CLE_DE_SCEAU)
		const [charge = '', signature = ''] = bon.split('.')
		const autre = base64url(JSON.stringify({ ...demande, retour: '//autre.example.test' }))
		expect(ouvrirLeCookie(bon, CLE_DE_SCEAU, maintenant)).toEqual(demande)
		for (const mauvais of [
			`${autre}.${signature}`,
			sceller(demande, 'une-autre-cle-de-sceau-de-plus-de-32-caracteres'),
			sceller({ ...demande, expire: dans(-1) }, CLE_DE_SCEAU),
			charge,
			`${charge}.`,
			`${charge}.${signature}.x`,
			'',
			undefined,
		])
			expect(ouvrirLeCookie(mauvais, CLE_DE_SCEAU, maintenant)).toBeUndefined()
	})
})

describe('la découverte', () => {
	test('elle est gardée : une seule lecture', async () => {
		const { requeter, vues } = fournisseur(async () => '')
		await decouvrir(EMETTEUR, { requeter, maintenant })
		await decouvrir(EMETTEUR, { requeter, maintenant })
		expect(vues).toHaveLength(1)
	})

	test.each([
		['un autre émetteur', { ...decouverteValide, issuer: 'https://autre.example.test' }],
		['un point d’accès en http', { ...decouverteValide, token_endpoint: 'http://oauth2.googleapis.com/token' }],
		['des identifiants dans l’adresse', { ...decouverteValide, jwks_uri: 'https://a:b@www.googleapis.com/certs' }],
		['un document incomplet', { issuer: EMETTEUR }],
	])('%s : refusé', async (_nom, document) => {
		const { requeter } = fournisseur(async () => '', document)
		await expect(decouvrir(EMETTEUR, { requeter, maintenant })).rejects.toBeInstanceOf(GoogleIndisponible)
	})

	test('un émetteur local ne peut pas renvoyer vers un autre hôte', async () => {
		const local = 'http://127.0.0.1:7080'
		const requeter = async () =>
			json({
				...decouverteValide,
				issuer: local,
				authorization_endpoint: `${local}/auth`,
				token_endpoint: 'http://127.0.0.1:9999/token',
				jwks_uri: `${local}/certs`,
			})
		await expect(decouvrir(local, { requeter, maintenant })).rejects.toBeInstanceOf(GoogleIndisponible)
	})

	test('une panne de Google est une panne, pas un plantage', async () => {
		const requeter = async () => new Response('<html>503</html>', { status: 503 })
		await expect(decouvrir(EMETTEUR, { requeter, maintenant })).rejects.toBeInstanceOf(GoogleIndisponible)
	})
})

describe('le jeton d’identité', () => {
	const verifier = async (jeton: string) => {
		const { requeter } = fournisseur(async () => '')
		return verifierLeJeton(jeton, config, decouverteValide as never, 'nonce-attendu', { requeter, maintenant })
	}

	test('un jeton juste rend ce que Google dit de la personne', async () => {
		expect(await verifier(await signer(chargeValide()))).toEqual({
			sub: 'sub-fictif',
			email: 'lea@example.test',
			emailVerifie: true,
			nom: 'Léa Fictive',
		})
	})

	test('le nom vient du prénom et du nom de famille quand « name » manque', async () => {
		const r = await verifier(await signer(chargeValide({ name: undefined, given_name: 'Léa', family_name: 'Fictive' })))
		expect(r.nom).toBe('Léa Fictive')
	})

	test('« email_verified » est vrai pour true et pour "true", faux pour tout le reste', async () => {
		for (const [valeur, attendu] of [
			[true, true],
			['true', true],
			[false, false],
			['false', false],
			[undefined, false],
			[1, false],
		] as const) {
			const jeton = await signer(chargeValide({ email_verified: valeur }))
			if (valeur === 1) await expect(verifier(jeton)).rejects.toBeInstanceOf(JetonRefuse)
			else expect((await verifier(jeton)).emailVerifie).toBe(attendu)
		}
	})

	test('l’émetteur court de Google est accepté', async () => {
		expect((await verifier(await signer(chargeValide({ iss: 'accounts.google.com' })))).sub).toBe('sub-fictif')
	})

	test.each([
		['un autre émetteur', { iss: 'https://autre.example.test' }],
		['un autre client', { aud: 'un-autre-client' }],
		['plusieurs publics dont le nôtre, sans azp', { aud: [CLIENT, 'un-autre-client'] }],
		['un jeton périmé', { exp: dans(-120) }],
		['un jeton daté du futur', { iat: dans(3600) }],
		['un autre nonce', { nonce: 'rejoue' }],
		['pas de nonce', { nonce: undefined }],
		['pas de sujet', { sub: undefined }],
	])('%s : refusé', async (_nom, changement) => {
		await expect(verifier(await signer(chargeValide(changement)))).rejects.toBeInstanceOf(JetonRefuse)
	})

	test('plusieurs publics dont le nôtre, avec notre azp : accepté', async () => {
		const jeton = await signer(chargeValide({ aud: [CLIENT, 'un-autre-client'], azp: CLIENT }))
		expect((await verifier(jeton)).sub).toBe('sub-fictif')
	})

	test('une signature faite par une autre clé, une clé inconnue, ou un algorithme autre que RS256 : refusé', async () => {
		await expect(verifier(await signer(chargeValide(), { avec: autreCle.privee }))).rejects.toBeInstanceOf(JetonRefuse)
		await expect(verifier(await signer(chargeValide(), { kid: 'inconnue' }))).rejects.toBeInstanceOf(JetonRefuse)
		for (const alg of ['none', 'HS256', 'RS512'])
			await expect(verifier(await signer(chargeValide(), { alg }))).rejects.toBeInstanceOf(JetonRefuse)
	})

	test('un jeton dont la charge a été changée après la signature : refusé', async () => {
		const [entete, , signature] = (await signer(chargeValide())).split('.')
		const charge = base64url(JSON.stringify(chargeValide({ email: 'autre@example.test' })))
		await expect(verifier(`${entete}.${charge}.${signature}`)).rejects.toBeInstanceOf(JetonRefuse)
	})

	test.each([
		'',
		'abc',
		'a.b',
		'a.b.c',
		'a.b.c.d',
	])('un texte qui n’est pas un jeton (« %s ») : refusé', async texte => {
		await expect(verifier(texte)).rejects.toBeInstanceOf(JetonRefuse)
	})
})

describe('l’échange du code', () => {
	test('le code part avec le secret du client et le vérificateur PKCE, par POST, et le jeton est vérifié', async () => {
		const { requeter, vues } = fournisseur(async () => signer(chargeValide()))
		const r = await revendicationsDuCode(
			config,
			decouverteValide as never,
			{ code: 'code-fictif', demande },
			{ requeter, maintenant }
		)
		expect(r.email).toBe('lea@example.test')
		const echange = vues.find(({ url }) => url === decouverteValide.token_endpoint)
		expect(echange?.init?.method).toBe('POST')
		const corps = new URLSearchParams(String(echange?.init?.body))
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
		const refus = async () => json({ error: 'invalid_grant' }, 400)
		const panne = async () => new Response('<html>503</html>', { status: 503 })
		const coupe = async (): Promise<Response> => {
			throw new TypeError('fetch failed')
		}
		const essai = (requeter: () => Promise<Response>) =>
			revendicationsDuCode(config, decouverteValide as never, { code: 'c', demande }, { requeter, maintenant })
		await expect(essai(refus)).rejects.toBeInstanceOf(JetonRefuse)
		await expect(essai(panne)).rejects.toBeInstanceOf(GoogleIndisponible)
		await expect(essai(coupe)).rejects.toBeInstanceOf(GoogleIndisponible)
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
		expect(adresseNormalisee(brute)).toBe(attendu)
	})

	test('le nom est celui de Google, sinon le début de l’adresse, borné à 100 caractères', () => {
		expect(nomDuCompte({ sub: 'x', emailVerifie: true, nom: '  Léa   Fictive ' }, 'lea@example.test')).toBe(
			'Léa Fictive'
		)
		expect(nomDuCompte({ sub: 'x', emailVerifie: true }, 'lea.fictive@example.test')).toBe('lea.fictive')
		expect(
			Array.from(nomDuCompte({ sub: 'x', emailVerifie: true, nom: 'é'.repeat(300) }, 'a@example.test'))
		).toHaveLength(100)
	})
})
