import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	CODES_ERREUR,
	codeErreurOAuth,
	codeErreurStrapi,
	codeResultatConnexion,
	expirationJwt,
	messageErreur,
	normaliserCodeErreur,
} from '../../src/lib/auth-erreurs.js'

const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url')

describe('codeErreurStrapi (Strapi users-permissions answers)', () => {
	test('wrong email or password', () => {
		assert.equal(
			codeErreurStrapi(400, 'Invalid identifier or password'),
			'identifiants-invalides'
		)
	})

	test('email or name already used at sign-up', () => {
		assert.equal(
			codeErreurStrapi(400, 'Email or Username are already taken'),
			'email-ou-nom-deja-pris'
		)
	})

	test('name shorter than the Strapi minLength (3)', () => {
		assert.equal(
			codeErreurStrapi(400, 'username must be at least 3 characters'),
			'nom-trop-court'
		)
	})

	test('rate limit, server errors and unreachable API', () => {
		assert.equal(
			codeErreurStrapi(429, 'Too many requests, please try again later.'),
			'trop-de-tentatives'
		)
		assert.equal(codeErreurStrapi(502), 'service-indisponible')
		assert.equal(
			codeErreurStrapi(500, 'Internal Server Error'),
			'service-indisponible'
		)
		assert.equal(codeErreurStrapi(0), 'service-indisponible')
	})

	test('unconfirmed and blocked accounts', () => {
		assert.equal(
			codeErreurStrapi(400, 'Your account email is not confirmed'),
			'email-non-confirme'
		)
		assert.equal(
			codeErreurStrapi(
				400,
				'Your account has been blocked by an administrator'
			),
			'compte-bloque'
		)
	})

	test('anything else, including a missing message', () => {
		assert.equal(codeErreurStrapi(400, 'Something new'), 'erreur-inconnue')
		assert.equal(codeErreurStrapi(400), 'erreur-inconnue')
		assert.equal(codeErreurStrapi(400, { not: 'a string' }), 'erreur-inconnue')
	})
})

describe('codeErreurOAuth (Google token exchanged with Strapi)', () => {
	test('email that already has an email and password account', () => {
		assert.equal(
			codeErreurOAuth(400, 'Email is already taken.'),
			'email-deja-avec-mot-de-passe'
		)
	})

	test('other failures follow codeErreurStrapi', () => {
		assert.equal(codeErreurOAuth(502), 'service-indisponible')
		assert.equal(
			codeErreurOAuth(400, 'This provider is disabled'),
			'erreur-inconnue'
		)
	})
})

describe('normaliserCodeErreur and messageErreur', () => {
	test('our codes are kept', () => {
		for (const code of CODES_ERREUR)
			assert.equal(normaliserCodeErreur(code), code)
	})

	test('NextAuth error names become our codes', () => {
		assert.equal(
			normaliserCodeErreur('CredentialsSignin'),
			'identifiants-invalides'
		)
		assert.equal(normaliserCodeErreur('SessionRequired'), 'session-expiree')
		assert.equal(normaliserCodeErreur('OAuthCallback'), 'service-indisponible')
		assert.equal(normaliserCodeErreur('Configuration'), 'service-indisponible')
	})

	test('raw messages and injected text are never kept', () => {
		assert.equal(
			normaliserCodeErreur(
				"Cannot read properties of undefined (reading 'id')"
			),
			'erreur-inconnue'
		)
		assert.equal(
			normaliserCodeErreur('<script>alert(1)</script>'),
			'erreur-inconnue'
		)
	})

	test('no value, empty value or repeated parameter', () => {
		assert.equal(normaliserCodeErreur(undefined), null)
		assert.equal(normaliserCodeErreur(''), null)
		assert.equal(
			normaliserCodeErreur(['session-expiree', 'x']),
			'session-expiree'
		)
	})

	test('every code has a French message, unknown input gets the generic one', () => {
		for (const code of CODES_ERREUR) {
			assert.equal(typeof messageErreur(code), 'string')
			assert.ok(messageErreur(code).length > 10)
		}
		assert.equal(
			messageErreur('identifiants-invalides'),
			'Email ou mot de passe incorrect.'
		)
		assert.equal(
			messageErreur('email-ou-nom-deja-pris'),
			'Cet email ou ce nom est déjà utilisé.'
		)
		assert.equal(
			messageErreur('trop-de-tentatives'),
			"Trop d'essais, réessaie dans quelques minutes."
		)
		assert.equal(
			messageErreur('n’importe quoi'),
			messageErreur('erreur-inconnue')
		)
		assert.equal(messageErreur(undefined), messageErreur('erreur-inconnue'))
	})
})

describe('codeResultatConnexion (signIn with redirect: false)', () => {
	test('success is read from ok, even when the page URL carried ?error=', () => {
		// next-auth parses `error` from the callback URL, here our own page
		assert.equal(codeResultatConnexion({ ok: true, error: null }), null)
		assert.equal(
			codeResultatConnexion({ ok: true, error: 'session-expiree' }),
			null
		)
	})

	test('failure: the code sent by the server, normalized', () => {
		assert.equal(
			codeResultatConnexion({
				ok: false,
				status: 401,
				error: 'identifiants-invalides',
			}),
			'identifiants-invalides'
		)
		assert.equal(
			codeResultatConnexion({ ok: false, error: 'CredentialsSignin' }),
			'identifiants-invalides'
		)
		assert.equal(codeResultatConnexion({ ok: false }), 'erreur-inconnue')
		assert.equal(codeResultatConnexion(undefined), 'erreur-inconnue')
	})
})

describe('expirationJwt', () => {
	test('exp of the payload, in ms', () => {
		const jwt = `${b64({ alg: 'HS256' })}.${b64({ id: 1, exp: 1_800_000_000 })}.sig`
		assert.equal(expirationJwt(jwt), 1_800_000_000_000)
	})

	test('base64url characters (- and _) are decoded', () => {
		// a payload whose encoding contains - and _
		const charge = { id: 1, exp: 1_700_000_000, n: '??>>~~' }
		const jwt = `x.${b64(charge)}.y`
		assert.match(jwt, /[-_]/)
		assert.equal(expirationJwt(jwt), 1_700_000_000_000)
	})

	test('null when the token cannot be read or has no exp', () => {
		assert.equal(expirationJwt(undefined), null)
		assert.equal(expirationJwt('pas-un-jwt'), null)
		assert.equal(expirationJwt(`x.${b64({ id: 1 })}.y`), null)
		assert.equal(expirationJwt(`x.${b64({ exp: 'demain' })}.y`), null)
	})
})
