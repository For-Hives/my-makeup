import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	MARGE_EXPIRATION_MS,
	OU_SESSION_EXPIREE,
	REVALIDATION_PAR_DEFAUT_MS,
	aCookieDeSession,
	callbackUrlSure,
	causeErreur,
	cookiesSessionAEffacer,
	delaiRevalidation,
	etatJeton,
	expirationSession,
	ligneLogAuth,
	ouSessionExpiree,
	secretNextAuth,
	sessionValide,
	suiteVerification,
	urlApiServeur,
	urlSessionExpiree,
} from '../../src/lib/auth-session.js'
import { EVENTS } from '../../src/lib/analytics.js'

const MAINTENANT = 1_800_000_000_000
const HEURE = 3600 * 1000

describe('delaiRevalidation (AUTH_REVALIDATION_MS)', () => {
	test('15 min by default, when empty or invalid', () => {
		assert.equal(REVALIDATION_PAR_DEFAUT_MS, 15 * 60 * 1000)
		for (const brut of [undefined, '', '  ', 'abc', '-5'])
			assert.equal(delaiRevalidation(brut), REVALIDATION_PAR_DEFAUT_MS)
	})

	test('a number of ms, 0 included', () => {
		assert.equal(delaiRevalidation('0'), 0)
		assert.equal(delaiRevalidation('2000'), 2000)
	})
})

describe('etatJeton (what a session read does)', () => {
	const fenetre = 15 * 60 * 1000

	test('no Strapi JWT: the session is useless', () => {
		assert.equal(etatJeton(null, MAINTENANT, fenetre), 'sans-jwt')
		assert.equal(etatJeton({ jwt: null }, MAINTENANT, fenetre), 'sans-jwt')
	})

	test('Strapi JWT expired, or expiring within the margin', () => {
		const base = { jwt: 'j', verifieA: MAINTENANT }
		assert.equal(
			etatJeton({ ...base, strapiExp: MAINTENANT - 1 }, MAINTENANT, fenetre),
			'expire'
		)
		assert.equal(
			etatJeton(
				{ ...base, strapiExp: MAINTENANT + MARGE_EXPIRATION_MS - 1 },
				MAINTENANT,
				fenetre
			),
			'expire'
		)
	})

	test('checked less than a window ago: no call to Strapi', () => {
		const jeton = {
			jwt: 'j',
			strapiExp: MAINTENANT + HEURE,
			verifieA: MAINTENANT - fenetre + 1,
		}
		assert.equal(etatJeton(jeton, MAINTENANT, fenetre), 'frais')
	})

	test('window over, or never checked: ask Strapi', () => {
		assert.equal(
			etatJeton(
				{
					jwt: 'j',
					strapiExp: MAINTENANT + HEURE,
					verifieA: MAINTENANT - fenetre,
				},
				MAINTENANT,
				fenetre
			),
			'a-verifier'
		)
		assert.equal(etatJeton({ jwt: 'j' }, MAINTENANT, fenetre), 'a-verifier')
		assert.equal(
			etatJeton({ jwt: 'j', verifieA: MAINTENANT }, MAINTENANT, 0),
			'a-verifier'
		)
	})
})

describe('suiteVerification (/api/users/me status)', () => {
	test('only a 401 ends the session', () => {
		assert.equal(suiteVerification(401), 'refusee')
	})

	test('2xx confirms it', () => {
		assert.equal(suiteVerification(200), 'valide')
	})

	test('5xx, 429, 403 and network errors keep it unchanged', () => {
		for (const status of [0, 403, 429, 500, 502, 503, 504])
			assert.equal(suiteVerification(status), 'inchangee')
	})
})

describe('expirationSession', () => {
	const expires = new Date(MAINTENANT + 30 * 24 * HEURE).toISOString()

	test('bounded by the Strapi JWT', () => {
		assert.equal(
			expirationSession(expires, MAINTENANT + 2 * HEURE),
			new Date(MAINTENANT + 2 * HEURE).toISOString()
		)
	})

	test('NextAuth date kept when it comes first or without Strapi expiry', () => {
		assert.equal(
			expirationSession(expires, MAINTENANT + 40 * 24 * HEURE),
			expires
		)
		assert.equal(expirationSession(expires, null), expires)
		assert.equal(expirationSession(expires, undefined), expires)
	})
})

describe('sessionValide (middleware)', () => {
	test('valid Strapi JWT', () => {
		assert.equal(
			sessionValide({ jwt: 'j', strapiExp: MAINTENANT + HEURE }, MAINTENANT),
			true
		)
		assert.equal(sessionValide({ jwt: 'j' }, MAINTENANT), true)
	})

	test('no token, no JWT or expired JWT (margin included)', () => {
		assert.equal(sessionValide(null, MAINTENANT), false)
		assert.equal(sessionValide({ name: 'x' }, MAINTENANT), false)
		assert.equal(
			sessionValide({ jwt: 'j', strapiExp: MAINTENANT - 1 }, MAINTENANT),
			false
		)
		assert.equal(
			sessionValide({ jwt: 'j', strapiExp: MAINTENANT + 30_000 }, MAINTENANT),
			false
		)
	})

	test('the revalidation window does not matter to the middleware', () => {
		assert.equal(
			sessionValide(
				{ jwt: 'j', strapiExp: MAINTENANT + HEURE, verifieA: 0 },
				MAINTENANT
			),
			true
		)
	})
})

describe('secretNextAuth (AUTH-14)', () => {
	test('returns the secret', () => {
		assert.equal(
			secretNextAuth({ secret: ' abc ', nodeEnv: 'production' }),
			'abc'
		)
	})

	test('missing, empty or « undefined » at runtime in production: error', () => {
		for (const secret of [undefined, '', '   ', 'undefined', 'null'])
			assert.throws(
				() => secretNextAuth({ secret, nodeEnv: 'production' }),
				/NEXTAUTH_SECRET manquant/
			)
	})

	test('tolerated during next build and outside production', () => {
		assert.equal(
			secretNextAuth({
				secret: '',
				nodeEnv: 'production',
				phase: 'phase-production-build',
			}),
			undefined
		)
		assert.equal(secretNextAuth({ nodeEnv: 'development' }), undefined)
		assert.equal(secretNextAuth({ nodeEnv: 'test' }), undefined)
	})
})

describe('urlApiServeur (API_INTERNAL_URL)', () => {
	test('internal URL first, trailing slashes removed', () => {
		assert.equal(
			urlApiServeur({
				interne: 'http://api:1337/',
				publique: 'https://api.example.test',
			}),
			'http://api:1337'
		)
	})

	test('public URL when the internal one is empty', () => {
		assert.equal(
			urlApiServeur({ interne: '', publique: 'https://api.example.test' }),
			'https://api.example.test'
		)
		assert.equal(
			urlApiServeur({ publique: 'https://api.example.test//' }),
			'https://api.example.test'
		)
		assert.equal(urlApiServeur({}), '')
	})
})

describe('cookiesSessionAEffacer', () => {
	test('the session cookie and its chunks, nothing else', () => {
		const effaces = cookiesSessionAEffacer([
			'next-auth.session-token.0',
			'next-auth.session-token.1',
			'next-auth.csrf-token',
			'next-auth.callback-url',
			'umami.disabled',
		])
		assert.deepEqual(
			effaces.map(c => c.split('=')[0]),
			['next-auth.session-token.0', 'next-auth.session-token.1']
		)
		for (const cookie of effaces) {
			assert.match(cookie, /; Path=\/;/)
			assert.match(cookie, /Max-Age=0/)
			assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/)
			assert.doesNotMatch(cookie, /Secure/)
		}
	})

	test('__Secure- cookies (https) are deleted with Secure', () => {
		const [cookie] = cookiesSessionAEffacer([
			'__Secure-next-auth.session-token',
		])
		assert.match(cookie, /^__Secure-next-auth\.session-token=;/)
		assert.match(cookie, /; Secure$/)
	})

	test('no cookie: nothing to delete', () => {
		assert.deepEqual(cookiesSessionAEffacer([]), [])
		assert.deepEqual(cookiesSessionAEffacer(), [])
	})
})

describe('aCookieDeSession (a session was sent)', () => {
	test('plain, __Secure- and chunked session cookies', () => {
		for (const noms of [
			['next-auth.session-token'],
			['__Secure-next-auth.session-token'],
			['next-auth.session-token.0', 'next-auth.session-token.1'],
			['__Secure-next-auth.session-token.1'],
			['next-auth.csrf-token', 'next-auth.session-token'],
		])
			assert.equal(aCookieDeSession(noms), true, noms.join(', '))
	})

	test('none: never signed in', () => {
		assert.equal(aCookieDeSession([]), false)
		assert.equal(aCookieDeSession(), false)
		assert.equal(
			aCookieDeSession([
				'next-auth.csrf-token',
				'__Host-next-auth.csrf-token',
				'next-auth.callback-url',
				'umami.disabled',
				'next-auth.session-token-x',
			]),
			false
		)
	})
})

describe('urlSessionExpiree (RG-08)', () => {
	test('sign-in page with the message, where and the encoded page', () => {
		assert.equal(
			urlSessionExpiree('/auth/profil', 'middleware'),
			'/auth/signin?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil'
		)
		assert.equal(
			urlSessionExpiree('/auth/profil?publicView=true&x=a b', 'jwt_expire'),
			'/auth/signin?error=session-expiree&ou=jwt_expire&callbackUrl=%2Fauth%2Fprofil%3FpublicView%3Dtrue%26x%3Da%20b'
		)
	})

	test('the 3 places of the catalogue, read back by the sign-in page', () => {
		for (const ou of ['api_401', 'jwt_expire', 'middleware']) {
			const url = new URL(
				urlSessionExpiree('/auth/init-account', ou),
				'https://my-makeup.example.test'
			)
			assert.equal(url.pathname, '/auth/signin')
			assert.equal(url.searchParams.get('error'), 'session-expiree')
			assert.equal(url.searchParams.get('ou'), ou)
			assert.equal(url.searchParams.get('callbackUrl'), '/auth/init-account')
			assert.equal(
				callbackUrlSure(url.searchParams.get('callbackUrl'), url.origin),
				'/auth/init-account'
			)
		}
	})

	test('any other place is refused', () => {
		for (const ou of [undefined, '', 'ailleurs', 'API_401', 'middleware&x=1'])
			assert.throws(() => urlSessionExpiree('/auth/profil', ou), /ou inconnu/)
	})
})

describe('ouSessionExpiree (where of session_expired)', () => {
	test('the same 3 places as the analytics catalogue', () => {
		assert.deepEqual(OU_SESSION_EXPIREE, EVENTS.session_expired.where.values)
	})

	test('a place of the catalogue is kept, anything else counts as api_401', () => {
		for (const ou of OU_SESSION_EXPIREE) assert.equal(ouSessionExpiree(ou), ou)
		assert.equal(ouSessionExpiree(['middleware', 'api_401']), 'middleware')
		for (const brut of [undefined, '', 'ailleurs', ['x'], 'marie@test.local'])
			assert.equal(ouSessionExpiree(brut), 'api_401')
	})
})

describe('callbackUrlSure (page after sign-in)', () => {
	const ORIGINE = 'https://my-makeup.example.test'

	test('a page of the site is kept, with its query', () => {
		assert.equal(callbackUrlSure('/auth/profil', ORIGINE), '/auth/profil')
		assert.equal(
			callbackUrlSure('/auth/profil?publicView=true', ORIGINE),
			'/auth/profil?publicView=true'
		)
		assert.equal(
			callbackUrlSure(`${ORIGINE}/auth/init-account`, ORIGINE),
			'/auth/init-account'
		)
	})

	test('another site is refused (no open redirect)', () => {
		for (const brut of [
			'https://evil.example.test/auth/profil',
			'//evil.example.test',
			'/\\evil.example.test',
			'/\t/evil.example.test',
			'javascript:alert(1)',
			'http://my-makeup.example.test/auth/profil',
		])
			assert.equal(callbackUrlSure(brut, ORIGINE), '/auth/profil', brut)
	})

	test('auth pages and API routes would loop: default page', () => {
		assert.equal(
			callbackUrlSure('/auth/signin?callbackUrl=%2F', ORIGINE),
			'/auth/profil'
		)
		assert.equal(callbackUrlSure('/auth/error', ORIGINE), '/auth/profil')
		assert.equal(callbackUrlSure('/api/auth/signout', ORIGINE), '/auth/profil')
	})

	test('missing, empty or repeated value', () => {
		assert.equal(callbackUrlSure(undefined, ORIGINE), '/auth/profil')
		assert.equal(callbackUrlSure('', ORIGINE), '/auth/profil')
		assert.equal(callbackUrlSure(['/contact', '/x'], ORIGINE), '/contact')
		assert.equal(callbackUrlSure(undefined, ORIGINE, '/'), '/')
	})
})

describe('ligneLogAuth', () => {
	test('event, code and rounded duration', () => {
		assert.equal(
			ligneLogAuth('connexion', { code: 'identifiants-invalides', ms: 123.6 }),
			'[auth] evt=connexion code=identifiants-invalides ms=124'
		)
		assert.equal(
			ligneLogAuth('revalidation', { code: 'statut-0' }),
			'[auth] evt=revalidation code=statut-0'
		)
		assert.equal(ligneLogAuth('connexion'), '[auth] evt=connexion code=ok')
	})

	test('never anything personal: other values become « autre »', () => {
		const ligne = ligneLogAuth('connexion marie@test.local', {
			code: 'Secret123 eyJhbGciOi',
			cause: 'marie@test.local',
		})
		assert.equal(ligne, '[auth] evt=autre code=autre cause=autre')
	})

	test('cause of a NextAuth error', () => {
		assert.equal(causeErreur(new Error('api_401')), 'api_401')
		assert.equal(causeErreur(new TypeError('x')), 'typeerror')
		assert.equal(causeErreur({ error: new TypeError('x') }), 'typeerror')
		assert.equal(causeErreur({ message: 'pas une erreur' }), undefined)
		assert.equal(
			ligneLogAuth('nextauth', {
				code: 'jwt_session_error',
				cause: causeErreur(new Error('jwt_expire')),
			}),
			'[auth] evt=nextauth code=jwt_session_error cause=jwt_expire'
		)
	})
})
