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
//   most (413 above), like the upload guard of the API (PR #370); the file
//   records the account that sent it (uploaded_by, API #385);
// - pictures of a profile like API #385 (services/me-makeup.js): a PATCH
//   takes in main_picture and image_gallery only files already on her
//   profile, or sent by her and used by no profile; any other file, or a
//   value that is not a file id (connect/set objects), answers 400 « File
//   not allowed » and nothing is saved. A replaced or removed picture is
//   deleted after the save, and DELETE deletes her pictures and her
//   uploads, unless another profile uses them. /__balayer deletes the
//   uploads that no profile uses, like the daily sweep without its 24 h;
// - forgot-password answers { ok: true } for any address, reset-password
//   refuses an unknown code or two different passwords;
// - public collections (makeup-artistes, talents, articles) like the content
//   API of Strapi 4: 25 entries by default and 100 at most per page, `fields`,
//   `populate` (components and media only when asked), `filters[x][$eq]`;
//   lists without the email and phone of the profiles, except the query of
//   one profile by its username (API PR #370);
// - /api/searching like API #384 (src/api/searching/services/searching.js):
//   the city alone is the term; unavailable profiles left out; a profile
//   must match every word of the term, each in one of the keys of the API
//   (public city, speciality, descriptions, skill names, names; a
//   substring here, Fuse.js at 0.2 there), except in a term of several
//   words the short ones, the stop words and those of the request or the
//   trade (cherche, maquilleuse, maquillage…); a city other than the term
//   only ranks; without any term, every searchable profile, the last
//   updated first; 200 result cards at most, with the public city (UI-11).
// `/__…` routes drive it from the tests (forced failures, delays, revoked
// sessions, JWT lifetime, state, profile of the test account, stored files,
// media sweep); a revoked or expired JWT is refused with a 401, as Strapi
// does. Public data: tests/regression/donnees-publiques.mjs.
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

// the public city of the API (UI-11, src/lib/profil/lieu-public.js), loaded
// when the server starts: the specs import COMPTE_TEST from this file, and
// Playwright reads src/ as CommonJS
let villePublique = null

// /api/searching (searching.js of API #384): at most 200 cards of
// these fields, a term of 100 characters at most
const RECHERCHE_MAX = 200
const TERME_MAX = 100
const CHAMPS_PHOTO_RECHERCHE = [
	'id',
	'url',
	'width',
	'height',
	'alternativeText',
]
// STOP_WORDS and QUERY_WORDS of searching.js
const MOTS_VIDES = new Set(
	'aux avec chez dans des est les mes mon par pour que qui ses son sur une'.split(
		' '
	)
)
const MOTS_DE_LA_DEMANDE = new Set([
	'artist',
	'artiste',
	'besoin',
	'cherche',
	'recherche',
	'maquillage',
	'maquillages',
	'maquilleur',
	'maquilleurs',
	'maquilleuse',
	'maquilleuses',
	'makeup',
	'souhaite',
	'trouver',
	'veux',
	'voudrais',
])
// the words a profile must all match (searchWords of searching.js): split
// on spaces only; a term of one word, or of ignored words only, as typed
function motsCherches(terme) {
	const mots = [...new Set(terme.split(/\s+/).filter(Boolean))]
	const significatifs = mots.filter(
		mot =>
			mot.length >= 3 && !MOTS_VIDES.has(mot) && !MOTS_DE_LA_DEMANDE.has(mot)
	)
	return mots.length > 1 && significatifs.length ? significatifs : [terme]
}
// what the search reads of a profile (balancedKeys of searching.js)
const clesRecherche = p =>
	[
		villePublique(p.city),
		p.speciality,
		p.description,
		...(p.skills ?? []).map(s => s.description),
		...(p.service_offers ?? []).map(o => o.description),
		...(p.skills ?? []).map(s => s.name),
		p.last_name,
		p.first_name,
	].map(normaliser)

/**
 * @param {number} port
 * @param {{origine?: string}} [options] - origin of the app, for CORS
 * @returns {Promise<http.Server>}
 */
export async function demarrerFauxStrapi(port = 4112, { origine = '*' } = {}) {
	;({ villePublique } = await import('../../src/lib/profil/lieu-public.js'))
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
				// POST /api/upload records no uploader, like the API before #385
				// still answering during a deploy
				uploadSansProprietaire: false,
				fournisseurEmail: false, // forgot-password: 500 for a known address
				delaiPostMs: 0,
				delaiPatchMs: 0,
				meMakeup401: false, // /api/me-makeup refuses the JWT, /users/me does not
				dureeJwtS: 86400, // lifetime of the JWTs issued from now on
				recherche: null, // status forced on /api/searching
				annuaire: null, // status forced on /api/searching without any term
				delaiRechercheMs: 0,
				// the cards of /api/searching carry the city as typed, as before
				// API #380: the front's own villePublique is then the only guard
				villeBrute: false,
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

	// --- pictures of the artist's space (API #385) ---
	// a file as a profile holds it and the API answers it: without its bytes
	// nor its uploader (hideUploader)
	const vueFichier = f => (f ? sansOctets(f) : null)
	const idDe = valeur => Number(valeur?.id ?? valeur)
	// ids of the pictures of a profile, main picture and gallery
	const idsMedias = profil =>
		[profil?.main_picture, ...(profil?.image_gallery ?? [])]
			.map(idDe)
			.filter(id => Number.isInteger(id) && id > 0)
	// files used by the profile of an account
	const fichiersUtilises = () =>
		new Set(Object.values(etat.profils).flatMap(idsMedias))
	// requestedFileIds: the ids asked for in the media fields of a PATCH (an
	// id, { id } or a list of them; null or [] empties the field), or null
	// when a value is not a file id (connect/set objects…)
	const idsDemandes = donnees => {
		const ids = MEDIAS_PROFIL.filter(champ => champ in donnees)
			.flatMap(champ => [].concat(donnees[champ] ?? []))
			.map(valeur =>
				valeur &&
				typeof valeur === 'object' &&
				!Array.isArray(valeur) &&
				Object.keys(valeur).length === 1
					? valeur.id
					: valeur
			)
		const valides = ids.every(
			id =>
				(Number.isInteger(id) && id > 0) ||
				(typeof id === 'string' && /^[1-9][0-9]*$/.test(id))
		)
		return valides ? [...new Set(ids.map(Number))] : null
	}
	// refusedFileIds: a file is allowed when it is on her profile already, or
	// when she sent it and no profile uses it
	const idsRefuses = (compte, profil, ids) => {
		const actuels = new Set(idsMedias(profil))
		const utilises = fichiersUtilises()
		return ids.filter(id => {
			if (actuels.has(id)) return false
			const f = fichier(id)
			return !(f && f.proprietaire === compte.id && !utilises.has(id))
		})
	}
	// removeUnusedFiles: deletes the files of `ids` that no profile uses
	const supprimerInutilises = ids => {
		const utilises = fichiersUtilises()
		const supprimes = etat.fichiers
			.filter(f => ids.includes(f.id) && !utilises.has(f.id))
			.map(f => f.id)
		etat.fichiers = etat.fichiers.filter(f => !supprimes.includes(f.id))
		return supprimes
	}

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

	// a result card of /api/searching (toPublicResult of searching.js)
	const resultatRecherche = profil => {
		const photo = fichierPublic(profil.main_picture)
		return {
			id: profil.id,
			username: profil.username,
			first_name: profil.first_name ?? null,
			last_name: profil.last_name ?? null,
			company_artist_name: profil.company_artist_name ?? null,
			speciality: profil.speciality ?? null,
			city:
				(etat.panne.villeBrute ? profil.city : villePublique(profil.city)) ||
				null,
			action_radius: profil.action_radius ?? null,
			pro: profil.pro ?? null,
			skills: (profil.skills ?? []).map(skill => ({ name: skill.name })),
			main_picture: photo
				? Object.fromEntries(
						CHAMPS_PHOTO_RECHERCHE.map(champ => [champ, photo[champ] ?? null])
					)
				: null,
		}
	}

	const serveur = http.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://faux-strapi')
		const entree = {
			m: req.method,
			p: url.pathname,
			q: url.search,
			t: Date.now(),
		}
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
			// { n, city, action_radius }: n more incomplete profiles in that
			// city (search pages)
			const { n = 0, city = 'Annecy', action_radius = 10 } = await lireJson(req)
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
					action_radius,
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
			// fields of the test account's profile, stored like a PATCH would;
			// a number in main_picture or image_gallery is a stored file
			// (/__fichiers), an object is kept as given
			const profil = etat.profils[COMPTE_TEST.id]
			const champs = await lireJson(req)
			const stocke = v => (typeof v === 'number' ? vueFichier(fichier(v)) : v)
			if ('main_picture' in champs)
				champs.main_picture = stocke(champs.main_picture)
			if (Array.isArray(champs.image_gallery))
				champs.image_gallery = champs.image_gallery.map(stocke)
			Object.assign(profil, stockerComposants(champs))
			return json(res, 200, profil)
		}
		if (url.pathname === '/__fichiers') {
			// { n, proprietaire }: n stored pictures (1 × 1 PNG) sent by that
			// account, or by nobody known (null: sent before API #385, like
			// the pictures in production)
			const { n = 1, proprietaire = null } = await lireJson(req)
			const crees = Array.from({ length: n }, () => {
				const id = etat.prochainId++
				const f = {
					id,
					name: `photo-${id}.png`,
					mime: 'image/png',
					size: PNG.length,
					width: 1,
					height: 1,
					url: `http://127.0.0.1:${port}/media/${id}`,
					alternativeText: null,
					proprietaire,
					octets: PNG,
				}
				etat.fichiers.push(f)
				// eslint-disable-next-line no-unused-vars
				const { octets, ...cree } = f
				return cree
			})
			return json(res, 200, crees)
		}
		if (url.pathname === '/__balayer') {
			// the daily media sweep of API #385 without its 24 h: the files
			// with a known uploader that no profile uses
			const supprimes = supprimerInutilises(
				etat.fichiers.filter(f => f.proprietaire != null).map(f => f.id)
			)
			return json(res, 200, { supprimes })
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
			const champ = cle =>
				(url.searchParams.get(cle) ?? '').trim().slice(0, TERME_MAX)
			const ville = normaliser(champ('city')).trim()
			const terme = normaliser(champ('search') || champ('city')).trim()
			const cherchables = tousLesProfils().filter(p => p.available !== false)
			if (!terme && etat.panne.annuaire)
				return json(
					res,
					etat.panne.annuaire,
					erreur(etat.panne.annuaire, 'Error', 'forced failure')
				)
			if (!terme)
				return json(
					res,
					200,
					cherchables
						.sort(
							(a, b) =>
								String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
								a.id - b.id
						)
						.slice(0, RECHERCHE_MAX)
						.map(resultatRecherche)
				)
			const mots = motsCherches(terme)
			const trouves = cherchables
				.filter(p => {
					const cles = clesRecherche(p)
					return mots.every(mot => cles.some(cle => cle.includes(mot)))
				})
				.map((p, i) => ({
					p,
					i,
					// the city ranks, like its Fuse.js score: never a filter (UI-10)
					rang:
						ville && normaliser(villePublique(p.city)).includes(ville) ? 0 : 1,
				}))
				.sort((a, b) => a.rang - b.rang || a.i - b.i)
				.slice(0, RECHERCHE_MAX)
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
				const donnees = {}
				for (const champ of CHAMPS_MODIFIABLES)
					if (champ in corps) donnees[champ] = corps[champ]
				// her own pictures only, checked before anything is written
				const demandes = idsDemandes(donnees)
				const refuses =
					demandes === null ? [] : idsRefuses(compte, profil, demandes)
				if (demandes === null || refuses.length)
					return json(
						res,
						400,
						erreur(400, 'BadRequestError', 'File not allowed', {
							moreDetails: 'File not allowed',
							files: refuses,
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
				// a picture of her profile may be a file of the public data
				const avant = idsMedias(profil)
				const actuel = id =>
					[profil.main_picture, ...(profil.image_gallery ?? [])].find(
						f => f && idDe(f) === id
					)
				const stocke = valeur =>
					vueFichier(fichier(idDe(valeur))) ?? actuel(idDe(valeur)) ?? null
				if ('main_picture' in donnees)
					donnees.main_picture =
						donnees.main_picture == null ? null : stocke(donnees.main_picture)
				if ('image_gallery' in donnees)
					donnees.image_gallery = []
						.concat(donnees.image_gallery ?? [])
						.map(stocke)
				Object.assign(profil, stockerComposants(donnees))
				// a replaced or removed picture is deleted once the profile is saved
				const gardes = new Set(idsMedias(profil))
				supprimerInutilises(avant.filter(id => !gardes.has(id)))
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
				// her pictures and her uploads, deleted once the account is
				const ids = [
					...idsMedias(profil),
					...etat.fichiers
						.filter(f => f.proprietaire === compte.id)
						.map(f => f.id),
				]
				delete etat.profils[compte.id]
				etat.comptes = etat.comptes.filter(c => c.id !== compte.id)
				supprimerInutilises(ids)
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
				// uploaded_by: the account that sent it
				proprietaire: etat.panne.uploadSansProprietaire ? null : compte.id,
				octets,
			}
			etat.fichiers.push(f)
			return json(res, 200, [vueFichier(f)])
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
