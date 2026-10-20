/**
 * The French départements: their names, the département of a postal code, and a place name as it
 * is compared (lower case, no accents, « St » written « saint »).
 *
 * Ported as is from src/lib/lieu.js of the old site (branch main): only what the public city of a
 * profile needs (src/lib/profile/public-place.ts). The ranking of a search by city, the rest of that
 * file, is not ported here.
 */

/** Départements: code → name (96 of mainland France and Corsica, 5 overseas) */
export const DEPARTMENTS: Readonly<Record<string, string>> = {
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

const ABBREVIATIONS: Readonly<Record<string, string>> = {
	st: 'saint',
	ste: 'sainte',
	sts: 'saints',
	stes: 'saintes',
}

const NOT_LETTERS_OR_DIGITS = /[^a-z0-9]+/
const CODE_POSTAL = /^\d{5}$/

/**
 * A place as compared: lower case, without accents, hyphens nor apostrophes, « St » written
 * « saint ». « Saint-Julien-en-Genevois » → 'saint julien en genevois'.
 */
export function normalizePlace(v: unknown): string {
	if (typeof v !== 'string') return ''
	return v
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/œ/g, 'oe')
		.replace(/æ/g, 'ae')
		.split(NOT_LETTERS_OR_DIGITS)
		.filter(Boolean)
		.map(mot => ABBREVIATIONS[mot] ?? mot)
		.join(' ')
}

/** Département of a French postal code: '74000' → '74', '20090' → '2A', '97411' → '974'. */
export function departmentOfPostalCode(code: unknown): string | null {
	if (typeof code !== 'string' || !CODE_POSTAL.test(code)) return null
	if (code.startsWith('20')) return Number(code) < 20200 ? '2A' : '2B'
	const overseas = code.slice(0, 3)
	if (code.startsWith('97')) return DEPARTMENTS[overseas] ? overseas : null
	const department = code.slice(0, 2)
	return DEPARTMENTS[department] ? department : null
}
