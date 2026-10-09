import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { authentifierStrapi, connexionStrapiOAuth, ErreurAuth, statutCompteStrapi } from '../../src/lib/auth-strapi.js'

const API = 'http://strapi.test'

// fake fetch: records the calls, answers with the given status and body
function faux(status, corps, { brut = false } = {}) {
	const appels = []
	const fetchImpl = async (url, init) => {
		appels.push({ url, init })
		const texte = brut ? corps : JSON.stringify(corps)
		return new Response(texte, {
			status,
			headers: { 'content-type': brut ? 'text/html' : 'application/json' },
		})
	}
	return { appels, fetchImpl }
}
const enPanne = async () => {
	throw new TypeError('fetch failed')
}
const strapiErreur = (status, message) => ({
	data: null,
	error: { status, name: 'Error', message },
})
const reponseConnexion = {
	jwt: 'jwt-factice',
	user: { id: 7, username: 'marie', email: 'marie@test.local' },
}

describe('authentifierStrapi', () => {
	test('sign-in: POST /api/auth/local with identifier and password, user for NextAuth', async () => {
		const { appels, fetchImpl } = faux(200, reponseConnexion)
		const user = await authentifierStrapi({
			api: API,
			email: ' marie@test.local ',
			password: 'Secret123',
			fetchImpl,
		})
		assert.deepEqual(user, {
			id: 7,
			name: 'marie',
			email: 'marie@test.local',
			jwt: 'jwt-factice',
		})
		assert.equal(appels[0].url, `${API}/api/auth/local`)
		assert.equal(appels[0].init.method, 'POST')
		assert.deepEqual(JSON.parse(appels[0].init.body), {
			identifier: 'marie@test.local',
			password: 'Secret123',
		})
		assert.ok(appels[0].init.signal instanceof AbortSignal, 'avec un délai')
	})

	test('sign-up when a name is given: POST /api/auth/local/register', async () => {
		const { appels, fetchImpl } = faux(200, reponseConnexion)
		await authentifierStrapi({
			api: API,
			email: 'm@test.local',
			password: 'Secret123',
			name: ' Marie ',
			fetchImpl,
		})
		assert.equal(appels[0].url, `${API}/api/auth/local/register`)
		assert.deepEqual(JSON.parse(appels[0].init.body), {
			username: 'Marie',
			email: 'm@test.local',
			password: 'Secret123',
		})
	})

	const echecs = [
		['wrong password (400)', faux(400, strapiErreur(400, 'Invalid identifier or password')), 'identifiants-invalides'],
		['name taken (400)', faux(400, strapiErreur(400, 'Email or Username are already taken')), 'email-ou-nom-deja-pris'],
		['rate limit (429)', faux(429, strapiErreur(429, 'Too many requests')), 'trop-de-tentatives'],
		['Traefik 502 in HTML', faux(502, '<html>Bad Gateway</html>', { brut: true }), 'service-indisponible'],
		['200 without JWT (email confirmation on)', faux(200, { user: { id: 7 } }), 'email-non-confirme'],
		['200 with an unexpected body', faux(200, { ok: true }), 'erreur-inconnue'],
		['network failure or timeout', { fetchImpl: enPanne }, 'service-indisponible'],
	]
	for (const [nom, { fetchImpl }, code] of echecs) {
		test(`${nom} → ErreurAuth ${code}, never a TypeError`, async () => {
			await assert.rejects(
				authentifierStrapi({
					api: API,
					email: 'm@test.local',
					password: 'x',
					fetchImpl,
				}),
				erreur => erreur instanceof ErreurAuth && erreur.message === code && erreur.code === code
			)
		})
	}

	test('empty email or password: refused without calling Strapi', async () => {
		const { appels, fetchImpl } = faux(200, reponseConnexion)
		for (const identifiants of [{ email: '', password: 'x' }, { email: 'm@test.local', password: '' }, {}]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await assert.rejects(authentifierStrapi({ api: API, ...identifiants, fetchImpl }), {
				message: 'identifiants-invalides',
			})
		}
		assert.equal(appels.length, 0)
	})
})

describe('connexionStrapiOAuth (Google)', () => {
	test('exchanges the access token, encoded in the query', async () => {
		const { appels, fetchImpl } = faux(200, reponseConnexion)
		const resultat = await connexionStrapiOAuth({
			api: API,
			provider: 'google',
			accessToken: 'a&b=c',
			fetchImpl,
		})
		assert.deepEqual(resultat, { id: 7, jwt: 'jwt-factice' })
		assert.equal(appels[0].url, `${API}/api/auth/google/callback?access_token=a%26b%3Dc`)
	})

	test('email with a password account → email-deja-avec-mot-de-passe', async () => {
		const { fetchImpl } = faux(400, strapiErreur(400, 'Email is already taken.'))
		await assert.rejects(
			connexionStrapiOAuth({
				api: API,
				provider: 'google',
				accessToken: 't',
				fetchImpl,
			}),
			{ name: 'ErreurAuth', message: 'email-deja-avec-mot-de-passe' }
		)
	})

	test('Strapi down, no access token → service-indisponible', async () => {
		await assert.rejects(
			connexionStrapiOAuth({
				api: API,
				provider: 'google',
				accessToken: 't',
				fetchImpl: enPanne,
			}),
			{ message: 'service-indisponible' }
		)
		const { appels, fetchImpl } = faux(200, reponseConnexion)
		await assert.rejects(connexionStrapiOAuth({ api: API, provider: 'google', fetchImpl }), {
			message: 'service-indisponible',
		})
		assert.equal(appels.length, 0)
	})
})

describe('statutCompteStrapi (/api/users/me)', () => {
	test('status of the answer, with the JWT in the header', async () => {
		const { appels, fetchImpl } = faux(401, strapiErreur(401, 'Missing or invalid credentials'))
		assert.equal(await statutCompteStrapi({ api: API, jwt: 'jwt-factice', fetchImpl }), 401)
		assert.equal(appels[0].url, `${API}/api/users/me`)
		assert.equal(appels[0].init.headers.Authorization, 'Bearer jwt-factice')
	})

	test('0 when Strapi cannot be reached in time', async () => {
		assert.equal(await statutCompteStrapi({ api: API, jwt: 'j', fetchImpl: enPanne }), 0)
	})
})
