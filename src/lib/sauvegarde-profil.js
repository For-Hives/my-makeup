/**
 * Honest saves of the artist's space (UI-01, UI-05, plans/01 §3.2): the save
 * itself, the sections a save belongs to (`profile_save` event), the name
 * rule of the forms and the French message shown when the API refuses or
 * cannot be reached. The page only shows a value once the API has stored it.
 */

/** `section` of the `profile_save` event, one per modal plus the onboarding */
export const SECTIONS_PROFIL = [
	'identite',
	'description',
	'localisation',
	'reseaux',
	'competences',
	'langues',
	'formations',
	'experiences',
	'offres',
	'portfolio',
	'onboarding',
]

/** First and last name: 2 characters at least (« Al », « Bo »), 70 at most */
export const NOM_MIN = 2
export const NOM_MAX = 70

export const MESSAGE_SAUVEGARDE_OK = 'Modifications enregistrées.'

const LIBELLES_CHAMPS = {
	first_name: 'Le prénom',
	last_name: 'Le nom',
	company_artist_name: "Le nom d'entreprise ou d'artiste",
	speciality: 'La spécialité',
	city: 'La ville',
	description: 'La description',
}

const MESSAGES = {
	reseau:
		"Connexion impossible : tes modifications n'ont pas été enregistrées. Vérifie ta connexion puis réessaie.",
	session:
		"Ta session a expiré : tes modifications n'ont pas été enregistrées, reconnecte-toi.",
	'trop-de-tentatives':
		"Trop d'essais : tes modifications n'ont pas été enregistrées, réessaie dans quelques minutes.",
	indisponible:
		"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes.",
	'profil-absent':
		"Ton profil n'a pas été trouvé : recharge la page puis réessaie.",
	refus:
		"Tes modifications n'ont pas été enregistrées : vérifie les champs puis réessaie.",
}

/**
 * Text of a Strapi error, wherever it is: `error.details.moreDetails` (our
 * me-makeup controller), `error.message`, or nothing.
 * @param {unknown} corps
 * @returns {string}
 */
function texteErreur(corps) {
	const erreur = corps && typeof corps === 'object' ? corps.error : null
	if (!erreur || typeof erreur !== 'object') return ''
	const details = erreur.details?.moreDetails
	return [details, erreur.message]
		.filter(texte => typeof texte === 'string')
		.join(' ')
}

/**
 * French message for a failed save (PATCH /api/me-makeup). Never repeats the
 * API text: a known rule becomes a sentence, anything else a generic one.
 * @param {number} status - HTTP status, 0 when the API could not be reached
 * @param {unknown} [corps] - parsed JSON body of the answer
 * @returns {string}
 */
export function messageEchecSauvegarde(status, corps) {
	if (!status) return MESSAGES.reseau
	if (status === 401) return MESSAGES.session
	if (status === 429) return MESSAGES['trop-de-tentatives']
	if (status >= 500) return MESSAGES.indisponible

	const texte = texteErreur(corps)
	const longueur = /\b([a-z_]+) must be at (least|most) (\d+) characters/.exec(
		texte
	)
	if (longueur && LIBELLES_CHAMPS[longueur[1]]) {
		const [, champ, sens, nombre] = longueur
		return `${LIBELLES_CHAMPS[champ]} doit contenir ${
			sens === 'least' ? 'au moins' : 'au plus'
		} ${nombre} caractères.`
	}
	if (/does not exist/i.test(texte)) return MESSAGES['profil-absent']
	return MESSAGES.refus
}

async function lireJson(response) {
	try {
		return await response.json()
	} catch {
		return null
	}
}

/**
 * A save of the artist's space (PATCH /api/me-makeup): patchMeMakeup
 * without its toasts, its HTTP and its counter passed in. Counts
 * `profile_save` once with the section and the outcome only, never what
 * was typed.
 * @param {object} data - fields to save
 * @param {string} section - one of SECTIONS_PROFIL
 * @param {object} ports
 * @param {(corps: string) => Promise<Response|null>} ports.envoyer - sends
 *   the PATCH with this JSON body: null when the session expired
 *   (authenticatedFetch), throws when the API cannot be reached
 * @param {(nom: string, props: object) => unknown} ports.compter - track()
 * @returns {Promise<{ok: true, data: object|null} | {ok: false, error: string, sessionExpiree?: true}>}
 *   `data`: the profile the API stored; `error`: the French message to show
 */
export async function sauvegarderProfil(data, section, { envoyer, compter }) {
	let response
	try {
		response = await envoyer(JSON.stringify({ ...data }))
	} catch {
		response = undefined // network error: status 0
	}

	const ok = !!response?.ok
	compter('profile_save', { section, ok })
	if (ok) return { ok: true, data: await lireJson(response) }

	// null: the session expired, the visitor is sent to the sign-in page
	if (response === null)
		return {
			ok: false,
			error: messageEchecSauvegarde(401),
			sessionExpiree: true,
		}
	return {
		ok: false,
		error: messageEchecSauvegarde(
			response?.status ?? 0,
			response ? await lireJson(response) : null
		),
	}
}

/**
 * Close handler of a modal (Escape, click outside, « Fermer ») that does
 * nothing while a save or a picture runs: the answer must land in an open
 * modal, where its message can be read. Closing then dropped the request
 * from view, and its failure showed up at the next opening, over the saved
 * values.
 * @param {boolean} occupe - a save (or a picture compression) is running
 * @param {() => void} fermer
 * @returns {() => void}
 */
export const fermerSiLibre = (occupe, fermer) => () => {
	if (!occupe) fermer()
}

/**
 * Outcome of the profile creation of the onboarding (POST /api/me-makeup).
 * A profile that already exists (page reloaded, second tab) is not an error:
 * the onboarding goes on with it.
 * @param {number} status
 * @param {unknown} [corps]
 * @returns {boolean} true when the account has its profile
 */
export function profilCree(status, corps) {
	if (status >= 200 && status < 300) return true
	return status === 400 && /already exists/i.test(texteErreur(corps))
}

/**
 * Message of a name field (first or last name) that breaks the rule, or
 * null when it is fine. Spaces around the name do not count.
 * @param {unknown} valeur
 * @param {'first_name'|'last_name'} champ
 * @returns {string|null}
 */
export function erreurNom(valeur, champ = 'first_name') {
	const libelle = LIBELLES_CHAMPS[champ] ?? 'Le nom'
	const nom = typeof valeur === 'string' ? valeur.trim() : ''
	if (nom.length < NOM_MIN)
		return `${libelle} doit contenir au moins ${NOM_MIN} caractères.`
	if (nom.length > NOM_MAX)
		return `${libelle} doit contenir au plus ${NOM_MAX} caractères.`
	return null
}

/**
 * A list of the profile (experiences, courses, offers…) as the page keeps it
 * after a save: each item the modal sent, completed with what the API
 * answered for it (the id Strapi gave it, the stored values). A field the
 * answer leaves out stays as it was sent: the PATCH answer of the API is
 * populated one level only, so its offers come without their options, and
 * taking it as it is erased them from the page, then from the database at
 * the next save. Without a list of the same length in the answer, the page
 * keeps the list sent, which the API accepted.
 * @param {unknown} reponse - JSON answer of the PATCH
 * @param {string} champ
 * @param {Array} envoyee - the list of the modal, as sent
 * @returns {Array}
 */
export function listeApresSauvegarde(reponse, champ, envoyee) {
	const liste =
		reponse && typeof reponse === 'object' && !Array.isArray(reponse)
			? reponse[champ]
			: undefined
	if (!Array.isArray(liste) || liste.length !== envoyee.length) return envoyee
	return envoyee.map((element, index) => {
		const stocke = liste[index]
		return stocke && typeof stocke === 'object'
			? { ...element, ...stocke }
			: element
	})
}

/**
 * The offers as the PATCH sends them: name, price, description and every
 * option, without any id. Strapi creates the components of the list again
 * at each save and drops the ids sent inside them; an offer sent without
 * its options is stored without any, so they are always sent ([] when
 * there is none).
 * @param {Array} offres - offers of the modal
 * @returns {Array<{name: string, price: string, description: string, options: Array}>}
 */
export function offresAEnvoyer(offres) {
	const champs = ({ name, price, description }) => ({
		name,
		price,
		description,
	})
	return (offres ?? []).map(offre => ({
		...champs(offre),
		options: (offre.options ?? []).map(champs),
	}))
}
