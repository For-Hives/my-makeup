// Fake Strapi for the auth suite (AF-01 to AF-10): the users-permissions
// answers NextAuth relies on, plus `/__…` routes the tests use to break it on
// purpose (502, 401, hanging, 429, expired or oversized JWT). Test data only:
// `@test.local` accounts, fake hashes and tokens. Ported from
// plans/outils/auth/front-harness/mock-strapi.mjs.
import http from 'node:http'
import { pathToFileURL } from 'node:url'

const COMPTE_TEST = {
	id: 1,
	username: 'marie',
	email: 'marie@test.local',
	password: 'Secret123',
}

// What GET /api/me-makeup returned before URG-06 (populate user: '*'): the
// account with its bcrypt hash and tokens, an admin in createdBy. The front
// must filter it whatever the API version (AF-10).
const profilAvecFuites = user => ({
	id: 10,
	username: user.username,
	first_name: 'Marie',
	last_name: 'Test',
	city: 'Annecy',
	action_radius: 30,
	available: true,
	speciality: 'Mariage',
	company_artist_name: 'Studio Test',
	description: 'Profil de test.',
	pro: false,
	score: 0,
	skills: [],
	experiences: [],
	courses: [],
	language: [],
	service_offers: [],
	image_gallery: [],
	network: { id: 1, email: null, phone: null, instagram: null },
	main_picture: {
		id: 3,
		url: 'https://r2-my-makeup.andy-cinquin.fr/test.webp',
		createdBy: {
			id: 1,
			email: 'admin@test.local',
			password: '$2a$10$fakeAdminHashForTestsOnly00000000000000000000000000',
			resetPasswordToken: 'faux-jeton-admin',
		},
	},
	user: {
		id: user.id,
		username: user.username,
		email: user.email,
		provider: 'local',
		password: '$2a$10$fakeUserHashForTestsOnly000000000000000000000000000',
		resetPasswordToken: 'faux-jeton-reinit',
		confirmationToken: 'faux-jeton-confirmation',
		confirmed: true,
		blocked: false,
	},
})

const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url')
const erreur = (status, name, message) => ({
	data: null,
	error: { status, name, message, details: {} },
})

/**
 * @param {number} port
 * @returns {Promise<http.Server>}
 */
export function demarrerFauxStrapi(port = 4111) {
	const etat = {}
	const jetons = new Map()
	const reinitialiser = () => {
		Object.assign(etat, {
			appels: {},
			usersMe: 'auto', // auto | <status> | lent
			meMakeup: 'auto', // auto | <status>
			connexion: 'auto', // auto | <status> | 429-une-fois
			google: 'deja-pris', // deja-pris | ok | 502
			ttl: 30 * 86400,
			grosJwt: false,
			revoques: new Set(),
			comptes: [{ ...COMPTE_TEST }],
		})
	}
	reinitialiser()

	const emettre = compte => {
		const maintenant = Math.floor(Date.now() / 1000)
		const charge = {
			id: compte.id,
			iat: maintenant,
			exp: maintenant + etat.ttl,
			n: Math.random(),
		}
		// > 4 KB once encrypted by NextAuth: the session cookie is chunked
		if (etat.grosJwt) charge.bourrage = 'x'.repeat(5000)
		const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(charge)}.signature-factice`
		jetons.set(jwt, compte)
		return jwt
	}
	const authentifie = req => {
		const jwt = (req.headers.authorization ?? '').split(' ')[1]
		if (!jetons.has(jwt) || etat.revoques.has(jwt)) return null
		const { exp } = JSON.parse(
			Buffer.from(jwt.split('.')[1], 'base64url').toString()
		)
		return exp * 1000 > Date.now() ? jetons.get(jwt) : null
	}
	const json = (res, status, corps) => {
		res.writeHead(status, { 'content-type': 'application/json' })
		res.end(JSON.stringify(corps))
	}
	const html502 = res => {
		res.writeHead(502, { 'content-type': 'text/html' })
		res.end('<html><body>Bad Gateway</body></html>')
	}
	const corpsDe = req =>
		new Promise(resolve => {
			let brut = ''
			req.on('data', morceau => (brut += morceau))
			req.on('end', () => {
				try {
					resolve(brut ? JSON.parse(brut) : {})
				} catch {
					resolve({})
				}
			})
		})

	const serveur = http.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://faux-strapi')
		const cle = `${req.method} ${url.pathname}`
		etat.appels[cle] = (etat.appels[cle] ?? 0) + 1
		const p = url.searchParams

		// --- test controls ---
		if (url.pathname === '/__etat') return json(res, 200, etat.appels)
		if (url.pathname === '/__reset') {
			reinitialiser()
			return json(res, 200, { ok: true })
		}
		if (url.pathname === '/__mode') {
			for (const nom of ['usersMe', 'meMakeup', 'connexion', 'google'])
				if (p.has(nom)) etat[nom] = p.get(nom)
			if (p.has('ttl')) etat.ttl = Number(p.get('ttl'))
			if (p.has('grosJwt')) etat.grosJwt = p.get('grosJwt') === '1'
			return json(res, 200, { ok: true })
		}
		if (url.pathname === '/__revoquer') {
			for (const jwt of jetons.keys()) etat.revoques.add(jwt)
			return json(res, 200, { ok: true })
		}

		// --- public collections read by `next build` (getStaticPaths/Props) ---
		if (
			req.method === 'GET' &&
			['/api/articles', '/api/talents', '/api/makeup-artistes'].includes(
				url.pathname
			)
		)
			return json(res, 200, {
				data: [],
				meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } },
			})

		// --- users-permissions ---
		if (req.method === 'POST' && url.pathname === '/api/auth/local') {
			if (etat.connexion === '429-une-fois') {
				etat.connexion = 'auto'
				return json(
					res,
					429,
					erreur(
						429,
						'RateLimitError',
						'Too many requests, please try again later.'
					)
				)
			}
			if (etat.connexion === '502') return html502(res)
			const corps = await corpsDe(req)
			const compte = etat.comptes.find(
				c =>
					(c.email === String(corps.identifier).toLowerCase() ||
						c.username === corps.identifier) &&
					c.password === corps.password
			)
			if (!compte)
				return json(
					res,
					400,
					erreur(400, 'ValidationError', 'Invalid identifier or password')
				)
			return json(res, 200, {
				jwt: emettre(compte),
				user: { id: compte.id, username: compte.username, email: compte.email },
			})
		}
		if (req.method === 'POST' && url.pathname === '/api/auth/local/register') {
			const corps = await corpsDe(req)
			if (String(corps.username ?? '').length < 3)
				return json(
					res,
					400,
					erreur(
						400,
						'ValidationError',
						'username must be at least 3 characters'
					)
				)
			const email = String(corps.email ?? '').toLowerCase()
			if (
				etat.comptes.some(
					c => c.email === email || c.username === corps.username
				)
			)
				return json(
					res,
					400,
					erreur(400, 'ApplicationError', 'Email or Username are already taken')
				)
			const compte = {
				id: etat.comptes.length + 1,
				username: corps.username,
				email,
				password: corps.password,
			}
			etat.comptes.push(compte)
			return json(res, 200, {
				jwt: emettre(compte),
				user: { id: compte.id, username: compte.username, email: compte.email },
			})
		}
		if (url.pathname === '/api/auth/google/callback') {
			if (etat.google === '502') return html502(res)
			if (etat.google === 'ok') {
				const compte = etat.comptes[0]
				return json(res, 200, {
					jwt: emettre(compte),
					user: {
						id: compte.id,
						username: compte.username,
						email: compte.email,
					},
				})
			}
			// what Strapi answers when the email has a local account
			return json(
				res,
				400,
				erreur(400, 'ApplicationError', 'Email is already taken.')
			)
		}
		if (url.pathname === '/api/users/me') {
			if (etat.usersMe === 'lent') return // never answers (timeout test)
			if (etat.usersMe !== 'auto') {
				const status = Number(etat.usersMe)
				return json(res, status, erreur(status, 'Error', 'mock'))
			}
			const compte = authentifie(req)
			return compte
				? json(res, 200, {
						id: compte.id,
						username: compte.username,
						email: compte.email,
						confirmed: true,
					})
				: json(
						res,
						401,
						erreur(401, 'UnauthorizedError', 'Missing or invalid credentials')
					)
		}
		if (url.pathname === '/api/me-makeup') {
			const compte = authentifie(req)
			if (!compte)
				return json(
					res,
					401,
					erreur(401, 'UnauthorizedError', 'Missing or invalid credentials')
				)
			if (etat.meMakeup !== 'auto') {
				const status = Number(etat.meMakeup)
				return json(
					res,
					status,
					erreur(status, 'BadRequestError', 'updating Makeup Artist error')
				)
			}
			return json(res, 200, profilAvecFuites(compte))
		}

		json(res, 404, erreur(404, 'NotFoundError', 'Not Found'))
	})

	return new Promise(resolve =>
		serveur.listen(port, '127.0.0.1', () => resolve(serveur))
	)
}

// `node tests/auth/mock-strapi.mjs [port]`: the fake Strapi alone
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const port = Number(process.argv[2] ?? 4111)
	await demarrerFauxStrapi(port)
	console.log(`faux Strapi sur http://127.0.0.1:${port}`)
}
