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
 * or several places).
 */

import { villeAffichee } from './format-zone.js'

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
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.map(mot => ABREVIATIONS[mot] ?? mot)
		.join(' ')
}

// normalized name → codes; « Corse » and « Réunion » as people write them
const PAR_NOM = new Map([
	...Object.entries(DEPARTEMENTS).map(([code, nom]) => [
		normaliserLieu(nom),
		[code],
	]),
	['corse', ['2A', '2B']],
	['reunion', ['974']],
])

/**
 * Département of a French postal code.
 * @param {unknown} code
 * @returns {string|null} '74000' → '74', '20090' → '2A', '97411' → '974'
 */
export function departementDuCodePostal(code) {
	if (typeof code !== 'string' || !/^\d{5}$/.test(code)) return null
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
	return /^(\d{2}|2A|2B|97\d)$/.test(code) && DEPARTEMENTS[code] ? [code] : []
}

// numbers in a place (postal code, arrondissement) are not part of its
// name: « Paris 15e » is in Paris, « Lyon 3e » in Lyon
const NUMERO = /^\d+(e|er|eme|ieme|re)?$/

// places in one field: « Annecy / Genève », « Annecy (74) », « Lyon - Rhône »
const SEPARATEURS = /[,;/|+()[\]]|\s[-–—]\s/

/**
 * @typedef {object} Lieu
 * @property {{mots: string, departement: boolean}[]} segments - the places
 *   written, normalized, without their numbers; `departement` when the
 *   place is the name of a département
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
		codes.forEach(code => departements.add(code))
		const mots = codes.length
			? ''
			: segment
					.split(' ')
					.filter(mot => mot && !NUMERO.test(mot))
					.join(' ')
		if (!mots) continue
		const parNom = PAR_NOM.get(mots)
		parNom?.forEach(code => departements.add(code))
		segments.push({ mots, departement: !!parNom })
	}
	return { segments, departements: [...departements] }
}

/** @param {Lieu} lieu */
const lieuVide = lieu => !lieu.segments.length && !lieu.departements.length

const contient = (texte, mots) => ` ${texte} `.includes(` ${mots} `)
const commencePar = (texte, mots) => `${texte} `.startsWith(`${mots} `)

/**
 * How the place of a profile matches the place searched:
 * - 'ville': the words typed, whole and in order, are in the place of the
 *   profile (« annecy » in « Annecy-le-Vieux » or « Grand Annecy », not in
 *   « Annemasse »); a name of département only at the start of a place, so
 *   that « Savoie » is not found in « Haute-Savoie »;
 * - 'departement': a département in common (postal code, code or name);
 * - null otherwise, and always for a profile without a usable city.
 * @param {Lieu} profil
 * @param {Lieu} cherche
 * @returns {'ville'|'departement'|null}
 */
export function correspondanceLieu(profil, cherche) {
	for (const { mots, departement } of cherche.segments)
		if (
			profil.segments.some(p =>
				departement ? commencePar(p.mots, mots) : contient(p.mots, mots)
			)
		)
			return 'ville'
	if (cherche.departements.some(code => profil.departements.includes(code)))
		return 'departement'
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
		const correspondance = correspondanceLieu(
			lireLieu(villeAffichee(resultat?.city)),
			cherche
		)
		if (correspondance === 'ville') ville.push(resultat)
		else if (correspondance === 'departement') departement.push(resultat)
		else autres.push(resultat)
	}
	return { locaux: [...ville, ...departement], autres, parLieu: true }
}
