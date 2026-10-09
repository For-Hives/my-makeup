/**
 * Profile of the signed-in artist as sent to /auth/profil (A4, AUTH-03): an
 * allow list of the profile fields the page and its modals use. The account
 * (`user`) keeps its id, username and email only, and no password hash,
 * reset or confirmation token, nor admin relation (`createdBy`, `updatedBy`)
 * can reach the HTML, whatever the API returns.
 */

export const CHAMPS_PROFIL = [
	'id',
	'username',
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
	'createdAt',
	'updatedAt',
	'publishedAt',
]

const CHAMPS_COMPTE = ['id', 'username', 'email']

const CLES_INTERDITES = new Set([
	'password',
	'resetPasswordToken',
	'confirmationToken',
	'createdBy',
	'updatedBy',
	'publishedBy',
])

function nettoyer(valeur) {
	if (Array.isArray(valeur)) return valeur.map(nettoyer)
	if (valeur === null || typeof valeur !== 'object') return valeur
	const propre = {}
	for (const [cle, contenu] of Object.entries(valeur)) {
		if (!CLES_INTERDITES.has(cle)) propre[cle] = nettoyer(contenu)
	}
	return propre
}

/**
 * @param {object|null} profil - answer of GET /api/me-makeup
 * @returns {object|null}
 */
export function filtrerProfilPrive(profil) {
	if (profil === null || typeof profil !== 'object' || Array.isArray(profil)) return null
	const filtre = {}
	for (const champ of CHAMPS_PROFIL) {
		if (profil[champ] !== undefined) filtre[champ] = nettoyer(profil[champ])
	}
	if (profil.user && typeof profil.user === 'object') {
		filtre.user = {}
		for (const champ of CHAMPS_COMPTE) {
			if (profil.user[champ] !== undefined) filtre.user[champ] = profil.user[champ]
		}
	}
	return filtre
}
