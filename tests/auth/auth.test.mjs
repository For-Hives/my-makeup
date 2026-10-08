// AF-01 to AF-10 (plans/02 §7.1): NextAuth and the private pages against the
// fake Strapi. Launched by tests/auth/run.mjs (npm run test:auth), which
// builds the app and starts the servers. Ported from
// plans/outils/auth/front-fixed/auth-fixed.test.mjs.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { connexionStrapiOAuth } from '../../src/lib/auth-strapi.js'

const APP = process.env.AF_APP // revalidation on every session read
const APP_FENETRE = process.env.AF_APP_FENETRE // one check per window
const FENETRE_MS = Number(process.env.AF_FENETRE_MS)
const API = process.env.AF_API
const JOURNAL = process.env.AF_JOURNAL

// Never against the production: local hosts only
for (const url of [APP, APP_FENETRE, API]) {
	assert.ok(url, 'lancer avec npm run test:auth')
	assert.ok(
		['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname),
		`cible non locale refusée : ${url}`
	)
}

const COOKIE_SESSION = /^next-auth\.session-token(\.\d+)?$/

class Jar {
	c = new Map()
	store(res) {
		for (const sc of res.headers.getSetCookie()) {
			const [kv, ...attrs] = sc.split(';')
			const i = kv.indexOf('=')
			const name = kv.slice(0, i).trim()
			const value = kv.slice(i + 1)
			const expired = attrs.some(
				a => /max-age=0/i.test(a) || /expires=Thu, 01 Jan 1970/i.test(a)
			)
			if (expired || value === '') this.c.delete(name)
			else this.c.set(name, value)
		}
	}
	header() {
		return [...this.c].map(([k, v]) => `${k}=${v}`).join('; ')
	}
	session() {
		return [...this.c.keys()].filter(nom => COOKIE_SESSION.test(nom))
	}
}

async function req(jar, chemin, init = {}, base = APP) {
	const res = await fetch(base + chemin, {
		redirect: 'manual',
		...init,
		headers: { ...(init.headers ?? {}), cookie: jar.header() },
	})
	jar.store(res)
	return res
}

// follows the redirections by hand: [{ status, location }] until a non 3xx
async function suivre(jar, chemin, base = APP) {
	const etapes = []
	let url = chemin
	for (let i = 0; i < 5; i++) {
		const res = await req(jar, url, {}, base)
		const location = res.headers.get('location')
		etapes.push({ status: res.status, location })
		await res.arrayBuffer()
		if (res.status < 300 || res.status >= 400 || !location) return etapes
		url = new URL(location, base).pathname + new URL(location, base).search
	}
	return etapes
}

async function login(
	jar,
	{ email = 'marie@test.local', password = 'Secret123', name } = {},
	base = APP
) {
	const { csrfToken } = await (
		await req(jar, '/api/auth/csrf', {}, base)
	).json()
	const body = new URLSearchParams({ csrfToken, email, password, json: 'true' })
	if (name) body.set('name', name)
	return req(
		jar,
		'/api/auth/callback/credentials',
		{
			method: 'POST',
			body,
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		},
		base
	)
}

// `error` of a credentials sign-in, as signIn({ redirect: false }) reads it
async function codeConnexion(identifiants) {
	const res = await login(new Jar(), identifiants)
	const { url } = await res.json()
	return new URL(url).searchParams.get('error')
}

const session = async (jar, base = APP) =>
	(await req(jar, '/api/auth/session', {}, base)).json()
const reset = () => fetch(`${API}/__reset`)
const mode = parametres =>
	fetch(`${API}/__mode?${new URLSearchParams(parametres)}`)
const appels = async () => (await fetch(`${API}/__etat`)).json()
const appelsUsersMe = async () => (await appels())['GET /api/users/me'] ?? 0
const journal = () => readFileSync(JOURNAL, 'utf8')
const donneesPage = html =>
	JSON.parse(
		/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(
			html
		)[1]
	)

test('AF-01 - a transient 502, 429 or network failure on /users/me keeps the session, which works again once Strapi is back', async () => {
	await reset()
	const jar = new Jar()
	await login(jar)
	for (const panne of ['502', '429', '503']) {
		await mode({ usersMe: panne })
		const s = await session(jar)
		assert.ok(s.jwt, `session gardée après ${panne}`)
		assert.equal(jar.session().length, 1)
	}
	await mode({ usersMe: 'auto' })
	assert.ok((await session(jar)).jwt)
	const page = await req(jar, '/auth/profil')
	assert.equal(page.status, 200)
})

test('AF-02 - a 401 from Strapi deletes the session cookies, chunks included', async () => {
	for (const grosJwt of ['0', '1']) {
		await reset()
		await mode({ grosJwt })
		const jar = new Jar()
		await login(jar)
		if (grosJwt === '1')
			assert.ok(jar.session().length >= 2, 'cookie découpé en morceaux .0/.1')
		await fetch(`${API}/__revoquer`)
		assert.deepEqual(await session(jar), {})
		assert.deepEqual(jar.session(), [], 'plus aucun cookie de session')
	}
})

describe('AF-03 - private pages without a valid session: one redirection, no loop', () => {
	test('no session: one 307 from /auth/profil to /auth/signin?callbackUrl=, then the sign-in page', async () => {
		await reset()
		const etapes = await suivre(new Jar(), '/auth/profil')
		assert.deepEqual(
			etapes.map(e => e.status),
			[307, 200]
		)
		// relative, as in production (curl -I https://my-makeup.fr/auth/profil)
		assert.equal(
			etapes[0].location,
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil'
		)
	})

	test('no session: /auth/init-account is protected too', async () => {
		const etapes = await suivre(new Jar(), '/auth/init-account')
		assert.deepEqual(
			etapes.map(e => e.status),
			[307, 200]
		)
		assert.equal(
			etapes[0].location,
			'/auth/signin?callbackUrl=%2Fauth%2Finit-account'
		)
	})

	test('Strapi JWT expired: the middleware redirects once, the next session read deletes the cookie', async () => {
		await reset()
		await mode({ ttl: '30' }) // inside the 60 s margin: treated as expired
		const jar = new Jar()
		await login(jar)
		const etapes = await suivre(jar, '/auth/profil')
		assert.deepEqual(
			etapes.map(e => e.status),
			[307, 200]
		)
		assert.equal(
			etapes[0].location,
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil'
		)
		assert.deepEqual(await session(jar), {})
		assert.deepEqual(jar.session(), [])
	})

	test('Strapi refuses the JWT on /me-makeup (while /users/me still says 200): cookie deleted, « session expirée » message, no loop', async () => {
		await reset()
		const jar = new Jar()
		await login(jar)
		await fetch(`${API}/__revoquer`)
		await mode({ usersMe: '200' })
		const premiere = await req(jar, '/auth/profil')
		assert.equal(premiere.status, 307)
		assert.equal(
			premiere.headers.get('location'),
			'/auth/signin?error=session-expiree'
		)
		assert.equal(premiere.headers.get('cache-control'), 'private, no-store')
		assert.deepEqual(jar.session(), [], 'cookie effacé par la page')
		const etapes = await suivre(jar, '/auth/signin?error=session-expiree')
		assert.deepEqual(
			etapes.map(e => e.status),
			[200]
		)
		assert.match(journal(), /\[auth\] evt=session_expiree code=api_401/)
	})
})

test('AF-04 - session.expires never goes past the expiry of the Strapi JWT', async () => {
	for (const ttl of [7200, 30 * 86400]) {
		await reset()
		await mode({ ttl: String(ttl) })
		const jar = new Jar()
		const avant = Date.now()
		await login(jar)
		const s = await session(jar)
		assert.ok(s.jwt)
		assert.ok(
			Date.parse(s.expires) <= avant + ttl * 1000 + 2000,
			`expires ${s.expires} au-delà du JWT Strapi (${ttl} s)`
		)
	}
})

describe('AF-05 - Strapi is asked at most once per window, with a 3 s timeout', () => {
	test(`window of ${FENETRE_MS} ms: no /users/me call inside it, exactly one after`, async () => {
		await reset()
		const jar = new Jar()
		await login(jar, {}, APP_FENETRE)
		for (let i = 0; i < 5; i++) assert.ok((await session(jar, APP_FENETRE)).jwt)
		assert.equal((await req(jar, '/auth/profil', {}, APP_FENETRE)).status, 200)
		assert.equal(await appelsUsersMe(), 0, 'aucun appel dans la fenêtre')

		const limite = Date.now() + FENETRE_MS + 5000
		while ((await appelsUsersMe()) === 0 && Date.now() < limite) {
			await session(jar, APP_FENETRE)
			await new Promise(resolve => setTimeout(resolve, 200))
		}
		assert.equal(
			await appelsUsersMe(),
			1,
			'un appel une fois la fenêtre passée'
		)
		for (let i = 0; i < 3; i++) await session(jar, APP_FENETRE)
		assert.equal(
			await appelsUsersMe(),
			1,
			'puis plus rien jusqu’à la fenêtre suivante'
		)
	})

	test('Strapi not answering: the session read gives up after about 3 s and keeps the session', async () => {
		await reset()
		const jar = new Jar()
		await login(jar)
		await mode({ usersMe: 'lent' })
		const debut = Date.now()
		const s = await session(jar)
		const duree = Date.now() - debut
		assert.ok(s.jwt, 'session gardée')
		assert.ok(duree >= 2500 && duree < 6000, `lecture en ${duree} ms`)
		assert.match(journal(), /\[auth\] evt=revalidation code=statut-0 ms=\d+/)
	})
})

test('AF-06 - wrong password: code identifiants-invalides, no exception, logged without personal data', async () => {
	await reset()
	assert.equal(
		await codeConnexion({ password: 'Mauvais123' }),
		'identifiants-invalides'
	)
	assert.equal(
		await codeConnexion({ email: 'inconnue@test.local' }),
		'identifiants-invalides'
	)
	const lignes = journal()
	assert.match(
		lignes,
		/\[auth\] evt=connexion code=identifiants-invalides ms=\d+/
	)
	assert.match(lignes, /\[auth\] evt=connexion code=ok ms=\d+/)
	assert.doesNotMatch(lignes, /TypeError|Cannot read properties/)
})

test('AF-07 - sign-up: name or email taken → email-ou-nom-deja-pris, short name → nom-trop-court, new account signed in', async () => {
	await reset()
	assert.equal(
		await codeConnexion({ email: 'autre@test.local', name: 'marie' }),
		'email-ou-nom-deja-pris'
	)
	assert.equal(
		await codeConnexion({ email: 'marie@test.local', name: 'Marie2' }),
		'email-ou-nom-deja-pris'
	)
	assert.equal(
		await codeConnexion({ email: 'autre@test.local', name: 'ab' }),
		'nom-trop-court'
	)
	const jar = new Jar()
	const res = await login(jar, {
		email: 'nouvelle@test.local',
		name: 'nouvelle',
	})
	assert.equal(new URL((await res.json()).url).searchParams.get('error'), null)
	assert.ok((await session(jar)).jwt)
})

describe('AF-08 - rate limit, Strapi down and Google refused give readable codes', () => {
	test('429 → trop-de-tentatives, Strapi in 502 (HTML) → service-indisponible', async () => {
		await reset()
		await mode({ connexion: '429-une-fois' })
		assert.equal(await codeConnexion(), 'trop-de-tentatives')
		await mode({ connexion: '502' })
		assert.equal(await codeConnexion(), 'service-indisponible')
	})

	test('Google token refused by Strapi (email with a password account) → email-deja-avec-mot-de-passe, no TypeError', async () => {
		await reset()
		const appel = () =>
			connexionStrapiOAuth({
				api: API,
				provider: 'google',
				accessToken: 'jeton-google-factice',
			})
		await assert.rejects(appel, {
			name: 'ErreurAuth',
			message: 'email-deja-avec-mot-de-passe',
		})
		await mode({ google: '502' })
		await assert.rejects(appel, {
			name: 'ErreurAuth',
			message: 'service-indisponible',
		})
		await mode({ google: 'ok' })
		const { id, jwt } = await appel()
		assert.equal(id, 1)
		assert.ok(jwt)
	})

	test('the error page shows the French message of the code, never the raw query', async () => {
		const page = await req(
			new Jar(),
			'/auth/error?error=email-deja-avec-mot-de-passe'
		)
		assert.equal(page.status, 200)
		assert.match(
			await page.text(),
			/Cet email a déjà un compte avec un mot de passe/
		)
		// anything else is first reduced to a code of the list, in the URL too
		const etapes = await suivre(
			new Jar(),
			`/auth/error?error=${encodeURIComponent("Cannot read properties of undefined (reading 'id')<b>")}`
		)
		assert.deepEqual(etapes, [
			{ status: 307, location: '/auth/error?error=erreur-inconnue' },
			{ status: 200, location: null },
		])
		const html = await (
			await req(new Jar(), '/auth/error?error=erreur-inconnue')
		).text()
		assert.match(html, /Une erreur est survenue/)
		assert.deepEqual(
			(await suivre(new Jar(), '/auth/error?error=OAuthCallback'))[0].location,
			'/auth/error?error=service-indisponible'
		)
	})

	test('providers: Google and email/password only, Facebook removed', async () => {
		const fournisseurs = await (
			await req(new Jar(), '/api/auth/providers')
		).json()
		assert.deepEqual(Object.keys(fournisseurs).sort(), [
			'credentials',
			'google',
		])
	})
})

test('AF-09 - GET /api/auth/signout is a 200 page (no more 404); a bad CSRF does not end on a dead page and the sign-out goes through', async () => {
	await reset()
	const jar = new Jar()
	await login(jar)
	const page = await req(jar, '/api/auth/signout')
	assert.equal(page.status, 200)

	const csrfFaux = await req(jar, '/api/auth/signout', {
		method: 'POST',
		body: new URLSearchParams({ csrfToken: 'faux', json: 'true' }),
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
	})
	const vers = csrfFaux.headers.get('location') ?? (await csrfFaux.json()).url
	const { pathname, search } = new URL(vers, APP)
	assert.equal(pathname, '/api/auth/signout')
	assert.equal((await req(jar, pathname + search)).status, 200)

	const { csrfToken } = await (await req(jar, '/api/auth/csrf')).json()
	await req(jar, '/api/auth/signout', {
		method: 'POST',
		body: new URLSearchParams({ csrfToken, json: 'true' }),
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
	})
	assert.deepEqual(jar.session(), [])
	assert.deepEqual(await session(jar), {})
})

describe('AF-10 - private pages: no JWT, no hash, no token in the HTML, never cached', () => {
	test('/auth/profil signed in', async () => {
		await reset()
		const jar = new Jar()
		await login(jar)
		const page = await req(jar, '/auth/profil')
		assert.equal(page.status, 200)
		assert.equal(page.headers.get('cache-control'), 'private, no-store')
		const html = await page.text()
		assert.doesNotMatch(
			html,
			/"jwt"|\$2[aby]\$|resetPasswordToken|confirmationToken|faux-jeton|admin@test\.local/
		)
		const { props } = donneesPage(html)
		assert.deepEqual(Object.keys(props.pageProps), ['data'])
		assert.equal(props.pageProps.data.city, 'Annecy')
		assert.deepEqual(Object.keys(props.pageProps.data.user).sort(), [
			'email',
			'id',
			'username',
		])
		assert.equal(props.pageProps.data.main_picture.createdBy, undefined)
	})

	test('/auth/init-account signed in', async () => {
		const jar = new Jar()
		await login(jar)
		const page = await req(jar, '/auth/init-account')
		assert.equal(page.status, 200)
		assert.equal(page.headers.get('cache-control'), 'private, no-store')
		const html = await page.text()
		assert.doesNotMatch(html, /"jwt"|\$2[aby]\$/)
		assert.deepEqual(donneesPage(html).props.pageProps, {
			compte: { confirmed: true },
		})
	})

	test('no profile yet (400) → onboarding; Strapi in 502 → message, not the onboarding', async () => {
		await reset()
		const jar = new Jar()
		await login(jar)
		await mode({ meMakeup: '400' })
		const sansProfil = await req(jar, '/auth/profil')
		assert.equal(sansProfil.status, 307)
		assert.equal(sansProfil.headers.get('location'), '/auth/init-account')
		await mode({ meMakeup: '502' })
		const panne = await req(jar, '/auth/profil')
		assert.equal(panne.status, 200)
		assert.match(await panne.text(), /momentanément indisponible/)
		assert.equal(jar.session().length, 1, 'session gardée')
	})
})

test('logs: [auth] lines only, without any email, password, name or token of the tests', () => {
	const lignes = journal()
	assert.match(lignes, /\[auth\] evt=/)
	for (const interdit of [
		'marie@test.local',
		'nouvelle@test.local',
		'Secret123',
		'Mauvais123',
		'eyJ',
		'$2a$',
		'jeton-google-factice',
	]) {
		assert.ok(!lignes.includes(interdit), `le journal contient ${interdit}`)
	}
})

test('production server without NEXTAUTH_SECRET: refuses to start', async () => {
	const env = {
		...process.env,
		NEXTAUTH_SECRET: '',
		NEXTAUTH_URL: 'http://127.0.0.1:3996',
	}
	const serveur = spawn(
		process.execPath,
		[process.env.AF_NEXT, 'start', '-p', '3996', '-H', '127.0.0.1'],
		{ env, stdio: ['ignore', 'pipe', 'pipe'] }
	)
	let sortie = ''
	serveur.stdout.on('data', morceau => (sortie += morceau))
	serveur.stderr.on('data', morceau => (sortie += morceau))
	const code = await new Promise(resolve => {
		const minuterie = setTimeout(() => {
			serveur.kill('SIGTERM')
			resolve('toujours en marche')
		}, 20_000)
		serveur.on('exit', c => {
			clearTimeout(minuterie)
			resolve(c)
		})
	})
	assert.notEqual(code, 0, sortie)
	assert.notEqual(code, 'toujours en marche', sortie)
	assert.match(sortie, /NEXTAUTH_SECRET manquant/)
})
