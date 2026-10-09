/**
 * Where the profiles of a search by city are (UI-10, plans/05 §4). The API
 * ranks by closeness of text, without any geographic filter: /search?city=
 * Annecy also returns profiles from all over France. Until the communes of
 * the v3 (INSEE codes and radius, P4), the search page puts first the
 * profiles whose city or département matches what was typed, and counts
 * only those in its title.
 *
 * No geocoding: a département is known from a postal code (74000), a code
 * (« 74 », « (74) », 2A, 974) or a name (Haute-Savoie), never from the name
 * of a city. The city field of a profile is free text (44 empty of 100 in
 * production on 08/10, some in capitals, with « St », hyphens, postal codes
 * or several places). « France » says nothing of where; a country or a
 * region only counts when nothing more precise was typed.
 */

import { rayonKm, villeAffichee } from './format-zone.js'

const normaliserLieuPattern1 = /[^a-z0-9]+/
const departementDuCodePostalPattern2 = /^\d{5}$/
const codesDuSegmentPattern3 = /^(\d{2}|2A|2B|97\d)$/

/** Départements: code → name */
export const DEPARTEMENTS = {
	'01': 'Ain',
	'02': 'Aisne',
	'03': 'Allier',
	'04': 'Alpes-de-Haute-Provence',
	'05': 'Hautes-Alpes',
	'06': 'Alpes-Maritimes',
	'07': 'Ardèche',
	'08': 'Ardennes',
	'09': 'Ariège',
	10: 'Aube',
	11: 'Aude',
	12: 'Aveyron',
	13: 'Bouches-du-Rhône',
	14: 'Calvados',
	15: 'Cantal',
	16: 'Charente',
	17: 'Charente-Maritime',
	18: 'Cher',
	19: 'Corrèze',
	'2A': 'Corse-du-Sud',
	'2B': 'Haute-Corse',
	21: 'Côte-d’Or',
	22: 'Côtes-d’Armor',
	23: 'Creuse',
	24: 'Dordogne',
	25: 'Doubs',
	26: 'Drôme',
	27: 'Eure',
	28: 'Eure-et-Loir',
	29: 'Finistère',
	30: 'Gard',
	31: 'Haute-Garonne',
	32: 'Gers',
	33: 'Gironde',
	34: 'Hérault',
	35: 'Ille-et-Vilaine',
	36: 'Indre',
	37: 'Indre-et-Loire',
	38: 'Isère',
	39: 'Jura',
	40: 'Landes',
	41: 'Loir-et-Cher',
	42: 'Loire',
	43: 'Haute-Loire',
	44: 'Loire-Atlantique',
	45: 'Loiret',
	46: 'Lot',
	47: 'Lot-et-Garonne',
	48: 'Lozère',
	49: 'Maine-et-Loire',
	50: 'Manche',
	51: 'Marne',
	52: 'Haute-Marne',
	53: 'Mayenne',
	54: 'Meurthe-et-Moselle',
	55: 'Meuse',
	56: 'Morbihan',
	57: 'Moselle',
	58: 'Nièvre',
	59: 'Nord',
	60: 'Oise',
	61: 'Orne',
	62: 'Pas-de-Calais',
	63: 'Puy-de-Dôme',
	64: 'Pyrénées-Atlantiques',
	65: 'Hautes-Pyrénées',
	66: 'Pyrénées-Orientales',
	67: 'Bas-Rhin',
	68: 'Haut-Rhin',
	69: 'Rhône',
	70: 'Haute-Saône',
	71: 'Saône-et-Loire',
	72: 'Sarthe',
	73: 'Savoie',
	74: 'Haute-Savoie',
	75: 'Paris',
	76: 'Seine-Maritime',
	77: 'Seine-et-Marne',
	78: 'Yvelines',
	79: 'Deux-Sèvres',
	80: 'Somme',
	81: 'Tarn',
	82: 'Tarn-et-Garonne',
	83: 'Var',
	84: 'Vaucluse',
	85: 'Vendée',
	86: 'Vienne',
	87: 'Haute-Vienne',
	88: 'Vosges',
	89: 'Yonne',
	90: 'Territoire de Belfort',
	91: 'Essonne',
	92: 'Hauts-de-Seine',
	93: 'Seine-Saint-Denis',
	94: 'Val-de-Marne',
	95: 'Val-d’Oise',
	971: 'Guadeloupe',
	972: 'Martinique',
	973: 'Guyane',
	974: 'La Réunion',
	976: 'Mayotte',
}

const ABREVIATIONS = {
	st: 'saint',
	ste: 'sainte',
	sts: 'saints',
	stes: 'saintes',
}

/**
 * A place as compared: lower case, without accents, hyphens nor
 * apostrophes, « St » written « saint ».
 * @param {unknown} v
 * @returns {string} « Saint-Julien-en-Genevois » → 'saint julien en genevois'
 */
export function normaliserLieu(v) {
	if (typeof v !== 'string') return ''
	return v
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/œ/g, 'oe')
		.replace(/æ/g, 'ae')
		.split(normaliserLieuPattern1)
		.filter(Boolean)
		.map(mot => ABREVIATIONS[mot] ?? mot)
		.join(' ')
}

// normalized name → codes; « Corse » and « Réunion » as people write them
const PAR_NOM = new Map([
	...Object.entries(DEPARTEMENTS).map(([code, nom]) => [normaliserLieu(nom), [code]]),
	['corse', ['2A', '2B']],
	['reunion', ['974']],
])

const commencePar = (texte, mots) => `${texte} `.startsWith(`${mots} `)

// a name of département → the longer names that begin with it: « loire » →
// « loire atlantique », « lot » → « lot et garonne », « corse » → …
const NOMS_PLUS_LONGS = new Map(
	[...PAR_NOM.keys()].map(nom => [nom, [...PAR_NOM.keys()].filter(autre => autre !== nom && commencePar(autre, nom))])
)

// the whole country: not a place to rank by
const PARTOUT = new Set(['france', 'toute la france', 'france entiere', 'partout en france', 'france metropolitaine'])

// countries and regions (those of 2016, the former ones still written):
// wider than a city or a département
const LARGES = new Set([
	'suisse',
	'belgique',
	'luxembourg',
	'monaco',
	'allemagne',
	'italie',
	'espagne',
	'andorre',
	'europe',
	'auvergne rhone alpes',
	'bourgogne franche comte',
	'bretagne',
	'centre val de loire',
	'grand est',
	'hauts de france',
	'ile de france',
	'idf',
	'normandie',
	'nouvelle aquitaine',
	'occitanie',
	'pays de la loire',
	'provence alpes cote d azur',
	'paca',
	'cote d azur',
	'provence',
	'rhone alpes',
	'auvergne',
	'alsace',
	'lorraine',
	'champagne ardenne',
	'picardie',
	'nord pas de calais',
	'aquitaine',
	'limousin',
	'poitou charentes',
	'midi pyrenees',
	'languedoc roussillon',
	'bourgogne',
	'franche comte',
	'haute normandie',
	'basse normandie',
	'centre',
])

/**
 * Département of a French postal code.
 * @param {unknown} code
 * @returns {string|null} '74000' → '74', '20090' → '2A', '97411' → '974'
 */
export function departementDuCodePostal(code) {
	if (typeof code !== 'string' || !departementDuCodePostalPattern2.test(code)) return null
	if (code.startsWith('20')) return Number(code) < 20200 ? '2A' : '2B'
	const outreMer = code.slice(0, 3)
	if (code.startsWith('97')) return DEPARTEMENTS[outreMer] ? outreMer : null
	const departement = code.slice(0, 2)
	return DEPARTEMENTS[departement] ? departement : null
}

/** A segment that is a code of département: « 74 », « 2a », « 974 », « 20 » */
function codesDuSegment(segment) {
	if (segment === '20') return ['2A', '2B']
	const code = segment.toUpperCase()
	return codesDuSegmentPattern3.test(code) && DEPARTEMENTS[code] ? [code] : []
}

// numbers in a place (postal code, arrondissement) are not part of its
// name: « Paris 15e » is in Paris, « Lyon 3e » in Lyon
const NUMERO = /^\d+(e|er|eme|ieme|re)?$/

// places in one field: « Annecy / Genève », « Annecy (74) », « Lyon - Rhône »
const SEPARATEURS = /[,;/|+()[\]]|\s[-–—]\s/

/**
 * @typedef {object} Lieu
 * @property {{mots: string, departement: boolean, large: boolean}[]} segments
 *   - the places written, normalized, without their numbers nor « France »;
 *   `departement` when the place is the name of a département, `large` when
 *   it is a country or a region
 * @property {string[]} departements - codes found in the text
 */

/**
 * @param {unknown} v - a city as typed in a profile or in the search
 * @returns {Lieu}
 */
export function lireLieu(v) {
	const brut = typeof v === 'string' ? v : ''
	const departements = new Set()
	for (const [code] of brut.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
		const departement = departementDuCodePostal(code)
		if (departement) departements.add(departement)
	}
	const segments = []
	for (const morceau of brut.split(SEPARATEURS)) {
		const segment = normaliserLieu(morceau)
		const codes = codesDuSegment(segment)
		for (const code of codes) {
			departements.add(code)
		}
		const mots = codes.length
			? ''
			: segment
					.split(' ')
					.filter(mot => mot && !NUMERO.test(mot))
					.join(' ')
		if (!mots || PARTOUT.has(mots)) continue
		const parNom = PAR_NOM.get(mots)
		for (const code of parNom ?? []) {
			departements.add(code)
		}
		segments.push({ mots, departement: !!parNom, large: LARGES.has(mots) })
	}
	return { segments, departements: [...departements] }
}

/** @param {Lieu} lieu */
const lieuVide = lieu => !(lieu.segments.length || lieu.departements.length)

const contient = (texte, mots) => ` ${texte} `.includes(` ${mots} `)

// a place that starts with this name of département, and not with a longer
// one that begins the same (« Loire » is not « Loire-Atlantique »)
const commenceParDepartement = (texte, nom) =>
	commencePar(texte, nom) && !NOMS_PLUS_LONGS.get(nom).some(long => commencePar(texte, long))

/**
 * How the place of a profile matches the place searched:
 * - 'ville': the words typed, whole and in order, are in the place of the
 *   profile (« annecy » in « Annecy-le-Vieux » or « Grand Annecy », not in
 *   « Annemasse »); a name of département only at the start of a place and
 *   never inside a longer name of département, so that « Savoie » is not
 *   found in « Haute-Savoie » nor « Loire » in « Loire-Atlantique »; a
 *   country or a region of the search only when it holds nothing else
 *   (« Annecy, Suisse » is Annecy);
 * - 'departement': a département in common (postal code, code or name);
 * - null otherwise, and always for a profile without a usable city.
 * @param {Lieu} profil
 * @param {Lieu} cherche
 * @returns {'ville'|'departement'|null}
 */
export function correspondanceLieu(profil, cherche) {
	const precis = cherche.segments.filter(s => !s.large)
	const segments = precis.length || cherche.departements.length ? precis : cherche.segments
	for (const { mots, departement } of segments) {
		if (profil.segments.some(p => (departement ? commenceParDepartement(p.mots, mots) : contient(p.mots, mots))))
			return 'ville'
	}
	if (cherche.departements.some(code => profil.departements.includes(code))) return 'departement'
	return null
}

/**
 * Results of the API split by place: first the profiles of the city, then
 * those of the département (each in the order of the API), then the others.
 * Without a usable place (no city, « - »), every result is in `locaux`.
 * @template {{city?: unknown}} T
 * @param {T[]} resultats
 * @param {string} city - as typed in the search
 * @returns {{locaux: T[], autres: T[], parLieu: boolean}}
 */
export function separerParLieu(resultats, city) {
	const liste = Array.isArray(resultats) ? resultats : []
	const cherche = lireLieu(city)
	if (lieuVide(cherche)) return { locaux: liste, autres: [], parLieu: false }
	const ville = []
	const departement = []
	const autres = []
	for (const resultat of liste) {
		const correspondance = correspondanceLieu(lireLieu(villeAffichee(resultat?.city)), cherche)
		if (correspondance === 'ville') ville.push(resultat)
		else if (correspondance === 'departement') departement.push(resultat)
		else autres.push(resultat)
	}
	return { locaux: [...ville, ...departement], autres, parLieu: true }
}

// one profile once: by id, else by username
const cleProfil = profil => profil?.id ?? profil?.username ?? null

/**
 * A place the search page can rank by: neither empty nor « France » nor
 * « - » (separerParLieu then gives one list).
 * @param {unknown} city - as typed in the search
 * @returns {boolean}
 */
export const lieuUtilisable = city => !lieuVide(lireLieu(city))

/**
 * The département a city field writes as a code: a postal code (« 74000
 * Annecy ») or a code alone (« Annecy (74) », as the public API writes a
 * city typed with its postal code), in a field of one place only; never a
 * name, which may be another place of the field (« Paris, Lyon et
 * Annecy »).
 * @param {unknown} v
 * @returns {string|null} null without a code, with two, or when the field
 *   names two places (« Paris (75), Lyon »: which one is in the 75?)
 */
export function codeDepartementEcrit(v) {
	const brut = typeof v === 'string' ? v : ''
	if (lireLieu(brut).segments.filter(s => !s.large).length > 1) return null
	const codes = new Set()
	for (const [code] of brut.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
		const departement = departementDuCodePostal(code)
		if (departement) codes.add(departement)
	}
	for (const morceau of brut.split(SEPARATEURS)) {
		for (const code of codesDuSegment(normaliserLieu(morceau))) {
			codes.add(code)
		}
	}
	return codes.size === 1 ? [...codes][0] : null
}

/**
 * The département of a search by city: the one typed (postal code, code or
 * name), else the one the profiles of that city write as a code
 * (codeDepartementEcrit), the most frequent, the first in their order on a
 * tie; none without either (no geocoding: « Annecy » alone says nothing).
 * @param {{city?: unknown}[]} locaux - the profiles of the city searched
 * @param {string} city - as typed in the search
 * @returns {string[]} codes: ['74'], ['2A', '2B'] for « Corse », []
 */
export function departementsDeLaRecherche(locaux, city) {
	const tapes = lireLieu(city).departements
	if (tapes.length) return tapes
	const compte = new Map()
	for (const profil of Array.isArray(locaux) ? locaux : []) {
		const code = codeDepartementEcrit(villeAffichee(profil?.city))
		if (code) compte.set(code, (compte.get(code) ?? 0) + 1)
	}
	let meilleur = null
	for (const [code, n] of compte) {
		if (meilleur === null || n > compte.get(meilleur)) meilleur = code
	}
	return meilleur === null ? [] : [meilleur]
}

/**
 * @param {string[]} codes - from departementsDeLaRecherche
 * @returns {string} « du 74 (Haute-Savoie) », « du 2A (Corse-du-Sud) et du
 *   2B (Haute-Corse) »
 */
export const duDepartement = codes => codes.map(code => `du ${code} (${DEPARTEMENTS[code]})`).join(' et ')

// the card says where she works and how far she goes (« Annecy et 30 km
// autour »): a radius without a city says nothing
const seDeplace = profil => villeAffichee(profil?.city) !== '' && rayonKm(profil?.action_radius) !== null

/**
 * @template T
 * @typedef {object} SectionAutres
 * @property {'departement'|'deplacent'|'autres'} cle
 * @property {string} titre - its h2
 * @property {T[]} profils
 */

/**
 * A search by city in sections (UI-10; decisions.md, 09/10: the same
 * département first, then the rest), every profile once: first those of
 * the place typed, city then département (separerParLieu), the only ones
 * counted in the title; then all the others, in three sections:
 * - the other profiles of the département of the search
 *   (departementsDeLaRecherche), when one is known;
 * - those of elsewhere that go to the client (a city and an action radius);
 * - the rest, « Zone non renseignée » included.
 * Each list keeps the order given, `resultats` first. Since API #384 a
 * search only returns the profiles that name what was typed: the search
 * page places the whole directory (GET /api/searching without term) for a
 * search by city alone, and the API answer only next to a term, which the
 * other profiles do not match.
 * Without a usable place (no city, « France »), one list (separerParLieu).
 * @template {{id?: unknown, username?: unknown, city?: unknown, action_radius?: unknown}} T
 * @param {T[]} resultats - the profiles to place, in their order
 * @param {string} city - as typed in the search
 * @param {T[]} [annuaire] - more profiles, after them (each once)
 * @returns {{locaux: T[], parLieu: boolean, departements: string[], sections: SectionAutres<T>[]}}
 */
export function sectionsParLieu(resultats, city, annuaire = []) {
	const reponse = Array.isArray(resultats) ? resultats : []
	const { locaux: tous, parLieu } = separerParLieu(reponse, city)
	if (!parLieu) return { locaux: tous, parLieu, departements: [], sections: [] }

	const vus = new Set()
	const uniques = [...reponse, ...(Array.isArray(annuaire) ? annuaire : [])].filter(profil => {
		const cle = cleProfil(profil)
		if (cle === null) return true
		if (vus.has(cle)) return false
		vus.add(cle)
		return true
	})
	const { locaux, autres } = separerParLieu(uniques, city)
	const departements = departementsDeLaRecherche(locaux, city)
	const duDepartementCherche = autres.filter(profil =>
		lireLieu(villeAffichee(profil?.city)).departements.some(code => departements.includes(code))
	)
	const ailleurs = autres.filter(profil => !duDepartementCherche.includes(profil))
	const section = (cle, titre, profils) => (profils.length ? [{ cle, titre, profils }] : [])
	return {
		locaux,
		parLieu,
		departements,
		sections: [
			...section('departement', `Autres maquilleuses ${duDepartement(departements)}`, duDepartementCherche),
			...section('deplacent', 'Autres maquilleuses qui se déplacent', ailleurs.filter(seDeplace)),
			...section(
				'autres',
				'Autres maquilleuses',
				ailleurs.filter(profil => !seDeplace(profil))
			),
		],
	}
}
