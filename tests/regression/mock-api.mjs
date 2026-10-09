// Fake Strapi for the artist's space suite (tests/regression): the
// users-permissions answers NextAuth needs, /api/me-makeup, /api/upload and
// the forgotten password routes, with the rules of the real API that the
// front must live with:
// - first_name and last_name: 2 characters at least (makeup-artiste
//   schema.json of the API, UI-01), 70 at most;
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
//   refuses an unknown code or two different passwords;
// - public collections (makeup-artistes, talents, articles) like the content
//   API of Strapi 4: 25 entries by default and 100 at most per page, `fields`,
//   `populate` (components and media only when asked), `filters[x][$eq]`;
//   lists without the email and phone of the profiles, except the query of
//   one profile by its username (API PR #370);
// - /api/searching: the city alone is a term, unavailable profiles left
//   out, public fields only; the city ranks the profiles of that city
//   first but filters nothing, so a search by city also returns the other
//   cities (UI-10), as the real one does.
// `/__…` routes drive it from the tests (forced failures, delays, revoked
// sessions, JWT lifetime, state, profile of the test account); a revoked
// or expired JWT is refused with a 401, as Strapi does. Public data:
// tests/regression/donnees-publiques.mjs.
// Test data only: @test.local accounts, made-up names. Ported from
// plans/outils/interfaces/mock-api.mjs.
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { ARTICLES, PROFILS_PUBLICS, TALENTS } from './donnees-publiques.mjs'

export const COMPTE_TEST = {
	id: 1,
	username: 'testine-recette',
	email: 'testine@test.local',
	password: 'Ancien-mdp-1',
}

const NOM_MIN_API = 2
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

// --- content API (public collections) ---
// a 1 × 1 PNG for the pictures of the public profiles
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
)
const SCALAIRES_PROFIL = [
	'username',
	'first_name',
	'last_name',
	'company_artist_name',
	'speciality',
	'city',
	'action_radius',
	'available',
	'pro',
	'description',
	'createdAt',
	'updatedAt',
]
const COMPOSANTS_PROFIL = [
	'skills',
	'language',
	'courses',
	'experiences',
	'service_offers',
	'network',
]
const MEDIAS_PROFIL = ['main_picture', 'image_gallery']

// query string of the content API: fields, populate, filters, pagination
function lireRequete(url) {
	const p = url.searchParams
	const champs = []
	const populate = new Set()
	let tout = false
	const filtres = {}
	for (const [cle, valeur] of p.entries()) {
		if (/^fields(\[\d+\])?$/.test(cle))
			champs.push(...valeur.split(',').map(v => v.trim()))
		else if (cle === 'populate') {
			if (valeur === '*') tout = true
			else valeur.split(',').forEach(v => populate.add(v.trim()))
		} else if (/^populate\[\d+\]$/.test(cle)) populate.add(valeur)
		else if (/^populate\[([^\]]+)\]/.test(cle))
			populate.add(/^populate\[([^\]]+)\]/.exec(cle)[1])
		const filtre = /^filters\[(\w+)\](\[\$eq\])?$/.exec(cle)
		if (filtre) filtres[filtre[1]] = valeur
	}
	const entier = (v, defaut) => {
		const n = Number.parseInt(v ?? '', 10)
		return Number.isFinite(n) && n > 0 ? n : defaut
	}
	return {
		champs,
		veut: nom =>
			tout || [...populate].some(x => x === nom || x.startsWith(`${nom}.`)),
		veutImbrique: chemin => populate.has(chemin),
		filtres,
		page: entier(p.get('pagination[page]'), 1),
		taille: Math.min(100, entier(p.get('pagination[pageSize]'), 25)),
	}
}

// one page of a list, with the meta of Strapi
function paginerListe(entrees, { page, taille }) {
	const total = entrees.length
	return {
		data: entrees.slice((page - 1) * taille, page * taille),
		meta: {
			pagination: {
				page,
				pageSize: taille,
				pageCount: Math.ceil(total / taille),
				total,
			},
		},
	}
}

const normaliser = texte =>
	String(texte ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()

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
				meMakeup401: false, // /api/me-makeup refuses the JWT, /users/me does not
				dureeJwtS: 86400, // lifetime of the JWTs issued from now on
				recherche: null, // status forced on /api/searching
				delaiRechercheMs: 0,
			},
			revoques: new Set(), // JWT refused everywhere (/__revoquer)
			supplementaires: [], // made-up profiles added by /__multiplier
		})
	}
	reinitialiser()

	const emettre = compte => {
		const maintenant = Math.floor(Date.now() / 1000)
		const charge = {
			id: compte.id,
			iat: maintenant,
			exp: maintenant + etat.panne.dureeJwtS,
		}
		const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
			...charge,
			n: randomBytes(4).toString('hex'),
		})}.signature-factice`
		jetons.set(jwt, { id: compte.id, exp: charge.exp })
		return jwt
	}
	// like Strapi: a revoked or expired JWT is refused (401)
	const authentifie = req => {
		const jwt = (req.headers.authorization ?? '').split(' ')[1]
		const jeton = jetons.get(jwt)
		if (!jeton || etat.revoques.has(jwt)) return null
		if (Date.now() / 1000 >= jeton.exp) return null
		return etat.comptes.find(c => c.id === jeton.id) ?? null
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
	// pictures of the public profiles, files 1 to 7: a heavy original and
	// the copies Strapi makes of it (formats, size in KB)
	const copie = (i, nom, largeur, taille) => ({
		name: `${nom}_photo-${i}.png`,
		mime: 'image/png',
		width: largeur,
		height: Math.round((largeur * 3) / 4),
		size: taille,
		url: `http://127.0.0.1:${port}/media/${i}/${nom}`,
	})
	const fichiersPublics = Array.from({ length: 7 }, (_, i) => ({
		id: i + 1,
		name: `photo-${i + 1}.png`,
		mime: 'image/png',
		width: 2000,
		height: 1500,
		size: 1400.5,
		url: `http://127.0.0.1:${port}/media/${i + 1}`,
		formats: {
			thumbnail: copie(i + 1, 'thumbnail', 208, 9.1),
			large: copie(i + 1, 'large', 1000, 180.4),
			medium: copie(i + 1, 'medium', 750, 110.2),
			small: copie(i + 1, 'small', 500, 52.7),
		},
		alternativeText: null,
		octets: PNG,
	}))
	const fichierPublic = id =>
		fichiersPublics.find(f => f.id === Number(id?.id ?? id)) ??
		fichier(id) ??
		null
	// eslint-disable-next-line no-unused-vars
	const sansOctets = ({ octets, proprietaire, ...f }) => f
	const mediaStrapi = f => (f ? { id: f.id, attributes: sansOctets(f) } : null)

	// every profile of the public API: the fixtures and the accounts' ones
	const tousLesProfils = () => [
		...PROFILS_PUBLICS,
		...etat.supplementaires,
		...Object.values(etat.profils).map(profil => ({
			createdAt: '2025-01-01T10:00:00.000Z',
			updatedAt: '2025-01-01T10:00:00.000Z',
			...profil,
		})),
	]

	// a profile as /api/makeup-artistes answers it
	const entreeProfil = (profil, requete, garderContacts) => {
		const attributes = {}
		const scalaires = requete.champs.length
			? SCALAIRES_PROFIL.filter(c => requete.champs.includes(c))
			: SCALAIRES_PROFIL
		for (const c of scalaires) attributes[c] = profil[c] ?? null
		let n = 0
		const composant = ({ id, ...champs }) => ({ id: id ?? ++n, ...champs })
		for (const c of COMPOSANTS_PROFIL) {
			if (!requete.veut(c)) continue
			if (c === 'network') {
				attributes.network = profil.network ? composant(profil.network) : null
				if (attributes.network && !garderContacts) {
					delete attributes.network.email
					delete attributes.network.phone
				}
			} else
				attributes[c] = (profil[c] ?? []).map(({ options, ...element }) =>
					c === 'service_offers' &&
					requete.veutImbrique('service_offers.options')
						? { ...composant(element), options: (options ?? []).map(composant) }
						: composant(element)
				)
		}
		if (requete.veut('main_picture'))
			attributes.main_picture = {
				data: mediaStrapi(fichierPublic(profil.main_picture)),
			}
		if (requete.veut('image_gallery')) {
			const images = (profil.image_gallery ?? [])
				.map(fichierPublic)
				.filter(Boolean)
				.map(mediaStrapi)
			attributes.image_gallery = { data: images.length ? images : null }
		}
		return { id: profil.id, attributes }
	}

	// a talent or an article: scalar fields (the article gallery is empty)
	const entreeContenu = (contenu, requete) => {
		// eslint-disable-next-line no-unused-vars
		const { id, galery, ...scalaires } = contenu
		const attributes = {}
		for (const [c, v] of Object.entries({
			...scalaires,
			createdAt: scalaires.updatedAt,
			publishedAt: scalaires.updatedAt,
		}))
			if (!requete.champs.length || requete.champs.includes(c))
				attributes[c] = v
		if (requete.veut('galery')) attributes.galery = { data: null }
		return { id, attributes }
	}

	// public result of /api/searching (the fields of searching.js)
	const resultatRecherche = profil => ({
		id: profil.id,
		username: profil.username,
		first_name: profil.first_name ?? null,
		last_name: profil.last_name ?? null,
		company_artist_name: profil.company_artist_name ?? null,
		speciality: profil.speciality ?? null,
		city: profil.city ?? null,
		action_radius: profil.action_radius ?? null,
		available: profil.available ?? null,
		pro: profil.pro ?? false,
		description: profil.description ?? null,
		skills: profil.skills ?? [],
		experiences: profil.experiences ?? [],
		courses: profil.courses ?? [],
		service_offers: profil.service_offers ?? [],
		language: profil.language ?? [],
		main_picture: fichierPublic(profil.main_picture)
			? sansOctets(fichierPublic(profil.main_picture))
			: null,
		image_gallery: (profil.image_gallery ?? [])
			.map(fichierPublic)
			.filter(Boolean)
			.map(sansOctets),
		network: profil.network
			? (({ email, phone, ...reste }) => reste)(profil.network)
			: null,
	})

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
		if (url.pathname === '/__revoquer') {
			// every JWT issued so far is refused, as after a JWT_SECRET rotation
			for (const jwt of jetons.keys()) etat.revoques.add(jwt)
			return json(res, 200, { ok: true })
		}
		if (url.pathname === '/__multiplier') {
			// { n, city }: n more incomplete profiles in that city (search pages)
			const { n = 0, city = 'Annecy' } = await lireJson(req)
			for (let i = 0; i < n; i++)
				etat.supplementaires.push({
					id: 1000 + etat.supplementaires.length,
					username: `fictive-${etat.supplementaires.length + 1}`,
					createdAt: '2025-06-01T10:00:00.000Z',
					updatedAt: '2025-06-01T10:00:00.000Z',
					first_name: 'Fictive',
					last_name: `Numéro ${etat.supplementaires.length + 1}`,
					speciality: 'Maquillage soirée',
					city,
					action_radius: 10,
					available: true,
					skills: [],
					network: null,
					main_picture: null,
					image_gallery: [],
				})
			return json(res, 200, { total: etat.supplementaires.length })
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
			const f = fichierPublic(url.pathname.split('/')[2])
			if (!f) return json(res, 404, {})
			res.writeHead(200, { 'content-type': f.mime, ...entetesCors })
			return res.end(f.octets)
		}

		// --- public collections (content API) ---
		if (req.method === 'GET' && url.pathname === '/api/makeup-artistes') {
			const requete = lireRequete(url)
			const { username, ...autres } = requete.filtres
			// one profile by its username: the profile page, contacts kept
			const garderContacts =
				username !== undefined && Object.keys(autres).length === 0
			const profils = tousLesProfils()
				.filter(p => username === undefined || p.username === username)
				.sort((a, b) => a.id - b.id)
				.map(p => entreeProfil(p, requete, garderContacts))
			return json(res, 200, paginerListe(profils, requete))
		}
		if (
			req.method === 'GET' &&
			['/api/talents', '/api/articles'].includes(url.pathname)
		) {
			const requete = lireRequete(url)
			const contenus = (url.pathname === '/api/talents' ? TALENTS : ARTICLES)
				.filter(
					c =>
						requete.filtres.slug === undefined ||
						c.slug === requete.filtres.slug
				)
				.map(c => entreeContenu(c, requete))
			return json(res, 200, paginerListe(contenus, requete))
		}
		if (req.method === 'GET' && url.pathname === '/api/searching') {
			if (etat.panne.delaiRechercheMs)
				await attendre(etat.panne.delaiRechercheMs)
			if (etat.panne.recherche)
				return json(
					res,
					etat.panne.recherche,
					erreur(etat.panne.recherche, 'Error', 'forced failure')
				)
			const ville = normaliser(url.searchParams.get('city')).trim()
			const motsVille = new Set(ville.split(/\s+/).filter(Boolean))
			// the words of the city only rank, like the Fuse.js score of the
			// API: never a geographic filter (UI-10)
			const mots = normaliser(url.searchParams.get('search') || ville)
				.split(/\s+/)
				.filter(mot => mot && !motsVille.has(mot))
			const trouves = tousLesProfils()
				.filter(p => p.available !== false)
				.filter(p => {
					const texte = normaliser(
						[
							p.city,
							p.speciality,
							p.description,
							p.first_name,
							p.last_name,
							...(p.skills ?? []).map(s => s.name),
						].join(' ')
					)
					return mots.every(mot => texte.includes(mot))
				})
				.map((p, i) => ({
					p,
					i,
					rang: ville && normaliser(p.city).includes(ville) ? 0 : 1,
				}))
				.sort((a, b) => a.rang - b.rang || a.i - b.i)
				.slice(0, 50)
				.map(({ p }) => resultatRecherche(p))
			return json(res, 200, trouves)
		}

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
			const compte = etat.panne.meMakeup401 ? null : authentifie(req)
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
