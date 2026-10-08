// Fake Strapi for the artist's space suite (tests/regression): the
// users-permissions answers NextAuth needs, /api/me-makeup, /api/upload and
// the forgotten password routes, with the rules of the real API that the
// front must live with:
// - first_name and last_name: 3 characters at least (makeup-artiste
//   schema.json of the API, today), 70 at most;
// - PATCH keeps the editable fields only, main_picture and image_gallery
//   are file ids; the components sent are created again, each with a new
//   id, nested options included (the front sends no id, and Strapi drops
//   the ids sent inside a new component);
// - the PATCH answer is populated one level only, like updateMakeupArtist
//   (populate service_offers: true): the offers come without their
//   options, which GET still returns;
// - POST /api/upload: JPEG, PNG or WebP read from the first bytes, 10 MB at
//   most (413 above), like the upload guard of the API (PR #370);
// - forgot-password answers { ok: true } for any address, reset-password
//   refuses an unknown code or two different passwords.
// `/__…` routes drive it from the tests (forced failures, delays, state,
// profile of the test account).
// Test data only: @test.local accounts, made-up names. Ported from
// plans/outils/interfaces/mock-api.mjs.
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const COMPTE_TEST = {
	id: 1,
	username: 'testine-recette',
	email: 'testine@test.local',
	password: 'Ancien-mdp-1',
}

const NOM_MIN_API = 3
const TAILLE_MAX_UPLOAD = 10 * 1024 * 1024
const CHAMPS_MODIFIABLES = [
	'first_name',
	'last_name',
	'company_artist_name',
	'speciality',
	'city',
	'action_radius',
	'available',
	'description',
	'skills',
	'experiences',
	'courses',
	'language',
	'network',
	'service_offers',
	'main_picture',
	'image_gallery',
]

// repeatable components of the profile (service_offers also holds options)
const COMPOSANTS_REPETABLES = [
	'skills',
	'experiences',
	'courses',
	'language',
	'service_offers',
]

const profilInitial = (id, username) => ({
	id: 10 + id,
	username,
	first_name: 'Testine',
	last_name: 'Recette',
	speciality: 'Mariage',
	company_artist_name: 'Studio Test',
	city: 'Annecy',
	action_radius: 30,
	available: true,
	description: 'Description initiale',
	skills: [{ id: 1, name: 'Mariée' }],
	language: [{ id: 1, name: 'Français' }],
	courses: [],
	experiences: [
		{
			id: 1,
			company: 'Studio A',
			job_name: 'Maquilleuse',
			city: 'Annecy',
			date_start: '2020-01-01',
			date_end: null,
			description: 'Expérience de test',
		},
	],
	service_offers: [],
	network: { id: 1, instagram: '', email: '', phone: '' },
	image_gallery: [],
	main_picture: null,
})

const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url')
const erreur = (status, name, message, details = {}) => ({
	data: null,
	error: { status, name, message, details },
})

const ascii = texte => [...texte].map(c => c.charCodeAt(0))
const commencePar = (tete, octets, decalage = 0) =>
	octets.every((octet, i) => tete[decalage + i] === octet)
function typeLu(tete) {
	if (commencePar(tete, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (commencePar(tete, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		return 'image/png'
	if (commencePar(tete, ascii('RIFF')) && commencePar(tete, ascii('WEBP'), 8))
		return 'image/webp'
	return null
}

let sharp
async function dimensions(octets) {
	try {
		sharp ??= (await import('sharp')).default
		const { width, height } = await sharp(octets).metadata()
		return { width, height }
	} catch {
		return { width: null, height: null }
	}
}

/**
 * @param {number} port
 * @param {{origine?: string}} [options] - origin of the app, for CORS
 * @returns {Promise<http.Server>}
 */
export function demarrerFauxStrapi(port = 4112, { origine = '*' } = {}) {
	const etat = {}
	const jetons = new Map()
	const reinitialiser = () => {
		Object.assign(etat, {
			journal: [],
			comptes: [{ ...COMPTE_TEST }],
			profils: { [COMPTE_TEST.id]: profilInitial(1, COMPTE_TEST.username) },
			fichiers: [],
			emails: [],
			prochainId: 100,
			prochainComposant: 1000,
			panne: {
				patch: null, // status forced on PATCH /api/me-makeup
				post: null, // status forced on POST /api/me-makeup
				suppression: null, // status forced on DELETE /api/me-makeup
				upload: null, // status forced on POST /api/upload
				fournisseurEmail: false, // forgot-password: 500 for a known address
				delaiPostMs: 0,
				delaiPatchMs: 0,
			},
		})
	}
	reinitialiser()

	const emettre = compte => {
		const maintenant = Math.floor(Date.now() / 1000)
		const charge = { id: compte.id, iat: maintenant, exp: maintenant + 86400 }
		const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
			...charge,
			n: randomBytes(4).toString('hex'),
		})}.signature-factice`
		jetons.set(jwt, compte.id)
		return jwt
	}
	const authentifie = req => {
		const jwt = (req.headers.authorization ?? '').split(' ')[1]
		const id = jetons.get(jwt)
		return etat.comptes.find(c => c.id === id) ?? null
	}
	const entetesCors = {
		'access-control-allow-origin': origine,
		'access-control-allow-headers': 'authorization, content-type, accept',
		'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	}
	const json = (res, status, corps) => {
		res.writeHead(status, {
			'content-type': 'application/json',
			...entetesCors,
		})
		res.end(JSON.stringify(corps))
	}
	const lireCorps = req =>
		new Promise(resolve => {
			const morceaux = []
			req.on('data', m => morceaux.push(m))
			req.on('end', () => resolve(Buffer.concat(morceaux)))
		})
	const lireJson = async req => {
		try {
			return JSON.parse((await lireCorps(req)).toString() || '{}')
		} catch {
			return {}
		}
	}
	const attendre = ms => new Promise(resolve => setTimeout(resolve, ms))
	// Components as Strapi stores them: created again at each save with a new
	// id (the id sent with one is dropped), the options of an offer too; an
	// offer sent without its options is stored without any.
	// eslint-disable-next-line no-unused-vars
	const nouveau = ({ id, ...champs }) => ({
		id: etat.prochainComposant++,
		...champs,
	})
	const stockerComposants = donnees => {
		for (const champ of COMPOSANTS_REPETABLES)
			if (Array.isArray(donnees[champ]))
				donnees[champ] = donnees[champ].map(element =>
					champ === 'service_offers'
						? {
								...nouveau(element),
								options: (element.options ?? []).map(nouveau),
							}
						: nouveau(element)
				)
		if (donnees.network && typeof donnees.network === 'object')
			donnees.network = nouveau(donnees.network)
		return donnees
	}
	// PATCH answer of updateMakeupArtist: populate one level, so an offer
	// comes without its options; the account with id, username, email only
	const reponsePatch = (profil, compte) => ({
		...profil,
		service_offers: (profil.service_offers ?? []).map(
			// eslint-disable-next-line no-unused-vars
			({ options, ...offre }) => offre
		),
		user: { id: compte.id, username: compte.username, email: compte.email },
	})
	const fichier = id =>
		etat.fichiers.find(f => f.id === Number(id?.id ?? id)) ?? null

	const serveur = http.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://faux-strapi')
		const entree = { m: req.method, p: url.pathname, t: Date.now() }
		if (!url.pathname.startsWith('/__')) etat.journal.push(entree)
		if (req.method === 'OPTIONS') {
			res.writeHead(204, entetesCors)
			return res.end()
		}

		// --- test controls ---
		if (url.pathname === '/__reset') {
			reinitialiser()
			return json(res, 200, { ok: true })
		}
		if (url.pathname === '/__panne') {
			Object.assign(etat.panne, await lireJson(req))
			return json(res, 200, etat.panne)
		}
		if (url.pathname === '/__profil') {
			// fields of the test account's profile, stored like a PATCH would
			const profil = etat.profils[COMPTE_TEST.id]
			Object.assign(profil, stockerComposants(await lireJson(req)))
			return json(res, 200, profil)
		}
		if (url.pathname === '/__etat')
			return json(res, 200, {
				journal: etat.journal,
				profils: etat.profils,
				comptes: etat.comptes.map(({ id, username, email }) => ({
					id,
					username,
					email,
				})),
				fichiers: etat.fichiers.map(({ octets, ...f }) => f),
				emails: etat.emails,
			})
		if (url.pathname.startsWith('/media/')) {
			const f = fichier(url.pathname.split('/')[2])
			if (!f) return json(res, 404, {})
			res.writeHead(200, { 'content-type': f.mime, ...entetesCors })
			return res.end(f.octets)
		}

		// --- public collections read by `next build` ---
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
			const corps = await lireJson(req)
			const compte = etat.comptes.find(
				c =>
					c.email === String(corps.identifier).toLowerCase() &&
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
			const corps = await lireJson(req)
			const email = String(corps.email ?? '').toLowerCase()
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
				id: etat.prochainId++,
				username: corps.username,
				email,
				password: corps.password,
			}
			etat.comptes.push(compte)
			return json(res, 200, {
				jwt: emettre(compte),
				user: { id: compte.id, username: compte.username, email },
			})
		}
		if (url.pathname === '/api/users/me') {
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
		if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
			const { email } = await lireJson(req)
			if (
				typeof email !== 'string' ||
				!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
			)
				return json(
					res,
					400,
					erreur(400, 'ValidationError', 'email must be a valid email')
				)
			const compte = etat.comptes.find(c => c.email === email.toLowerCase())
			if (!compte) return json(res, 200, { ok: true })
			compte.code = randomBytes(64).toString('hex')
			if (etat.panne.fournisseurEmail)
				return json(
					res,
					500,
					erreur(500, 'InternalServerError', 'Internal Server Error')
				)
			etat.emails.push({ a: compte.email, code: compte.code })
			return json(res, 200, { ok: true })
		}
		if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
			const { code, password, passwordConfirmation } = await lireJson(req)
			if (!code || !password || !passwordConfirmation)
				return json(
					res,
					400,
					erreur(400, 'ValidationError', 'code is a required field')
				)
			if (password !== passwordConfirmation)
				return json(
					res,
					400,
					erreur(400, 'ValidationError', 'Passwords do not match')
				)
			const compte = etat.comptes.find(c => c.code && c.code === code)
			if (!compte)
				return json(
					res,
					400,
					erreur(400, 'ValidationError', 'Incorrect code provided')
				)
			compte.password = password
			compte.code = null
			return json(res, 200, {
				jwt: emettre(compte),
				user: { id: compte.id, username: compte.username, email: compte.email },
			})
		}

		// --- artist space ---
		if (url.pathname === '/api/me-makeup') {
			const compte = authentifie(req)
			if (!compte)
				return json(
					res,
					401,
					erreur(401, 'UnauthorizedError', 'Missing or invalid credentials')
				)
			const profil = etat.profils[compte.id]
			if (req.method === 'GET')
				return profil
					? json(res, 200, {
							...profil,
							user: {
								id: compte.id,
								username: compte.username,
								email: compte.email,
							},
						})
					: json(
							res,
							400,
							erreur(400, 'BadRequestError', 'updating Makeup Artist error', {
								moreDetails: 'Makeup artist does not exist for this user',
							})
						)
			if (req.method === 'POST') {
				if (etat.panne.delaiPostMs) await attendre(etat.panne.delaiPostMs)
				entree.fin = Date.now()
				if (etat.panne.post)
					return json(
						res,
						etat.panne.post,
						erreur(etat.panne.post, 'Error', 'forced failure')
					)
				if (profil)
					return json(
						res,
						400,
						erreur(
							400,
							'BadRequestError',
							'Makeup artist initialisation error',
							{ moreDetails: 'Makeup artist already exists for this user' }
						)
					)
				etat.profils[compte.id] = {
					...profilInitial(compte.id, compte.username),
					first_name: null,
					last_name: null,
					speciality: '',
					company_artist_name: '',
					city: '',
					description: '',
					skills: [],
					language: [],
					experiences: [],
					network: {},
				}
				return json(res, 200, etat.profils[compte.id])
			}
			if (req.method === 'PATCH') {
				const corps = await lireJson(req)
				if (etat.panne.delaiPatchMs) await attendre(etat.panne.delaiPatchMs)
				entree.cles = Object.keys(corps)
				if (etat.panne.patch)
					return json(
						res,
						etat.panne.patch,
						erreur(etat.panne.patch, 'InternalServerError', 'forced failure')
					)
				if (!profil)
					return json(
						res,
						400,
						erreur(400, 'BadRequestError', 'updating Makeup Artist error', {
							moreDetails: 'Makeup artist does not exist for this user',
						})
					)
				for (const champ of ['first_name', 'last_name']) {
					const valeur = corps[champ]
					if (valeur != null && String(valeur).length < NOM_MIN_API)
						return json(
							res,
							400,
							erreur(400, 'BadRequestError', 'updating Makeup Artist error', {
								moreDetails: `${champ} must be at least ${NOM_MIN_API} characters`,
							})
						)
				}
				const donnees = {}
				for (const champ of CHAMPS_MODIFIABLES)
					if (champ in corps) donnees[champ] = corps[champ]
				if ('main_picture' in donnees)
					donnees.main_picture = fichier(donnees.main_picture)
				if ('image_gallery' in donnees)
					donnees.image_gallery = (donnees.image_gallery ?? [])
						.map(fichier)
						.filter(Boolean)
				Object.assign(profil, stockerComposants(donnees))
				return json(res, 200, reponsePatch(profil, compte))
			}
			if (req.method === 'DELETE') {
				if (etat.panne.suppression)
					return json(
						res,
						etat.panne.suppression,
						erreur(
							etat.panne.suppression,
							'BadRequestError',
							'updating Makeup Artist error'
						)
					)
				delete etat.profils[compte.id]
				etat.comptes = etat.comptes.filter(c => c.id !== compte.id)
				return json(res, 200, { message: 'User deleted' })
			}
		}
		if (req.method === 'POST' && url.pathname === '/api/upload') {
			const compte = authentifie(req)
			if (!compte)
				return json(
					res,
					401,
					erreur(401, 'UnauthorizedError', 'Missing or invalid credentials')
				)
			const brut = await lireCorps(req)
			if (etat.panne.upload)
				return json(
					res,
					etat.panne.upload,
					erreur(etat.panne.upload, 'Error', 'forced failure')
				)
			if (brut.length > TAILLE_MAX_UPLOAD)
				return json(
					res,
					413,
					erreur(413, 'PayloadTooLargeError', 'The file is larger than 10 MB')
				)
			let formulaire
			try {
				formulaire = await new Request('http://faux-strapi/api/upload', {
					method: 'POST',
					headers: { 'content-type': req.headers['content-type'] },
					body: brut,
				}).formData()
			} catch {
				return json(res, 400, erreur(400, 'ValidationError', 'Files are empty'))
			}
			const envoye = formulaire.get('files')
			if (!envoye || typeof envoye === 'string')
				return json(res, 400, erreur(400, 'ValidationError', 'Files are empty'))
			const octets = Buffer.from(await envoye.arrayBuffer())
			const lu = typeLu(octets.subarray(0, 12))
			if (
				!['image/jpeg', 'image/png', 'image/webp'].includes(envoye.type) ||
				!lu
			)
				return json(
					res,
					400,
					erreur(
						400,
						'BadRequestError',
						'Only JPEG, PNG and WebP pictures can be uploaded'
					)
				)
			const id = etat.prochainId++
			const f = {
				id,
				name: envoye.name,
				mime: lu,
				size: octets.length,
				...(await dimensions(octets)),
				url: `http://127.0.0.1:${port}/media/${id}`,
				alternativeText: null,
				proprietaire: compte.id,
				octets,
			}
			etat.fichiers.push(f)
			const { octets: _, proprietaire, ...publie } = f
			return json(res, 200, [publie])
		}

		json(res, 404, erreur(404, 'NotFoundError', 'Not Found'))
	})

	return new Promise(resolve =>
		serveur.listen(port, '127.0.0.1', () => resolve(serveur))
	)
}

// `node tests/regression/mock-api.mjs [port]`: the fake Strapi alone
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const port = Number(process.argv[2] ?? 4112)
	await demarrerFauxStrapi(port)
	console.log(`faux Strapi sur http://127.0.0.1:${port}`)
}
