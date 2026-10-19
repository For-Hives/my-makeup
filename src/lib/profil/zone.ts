/**
 * The zone of a profile as it is stored (plan 01 §3.3 P7.4 and §6.2; docs/migration/SCHEMA.md,
 * §5.2): a commune of the official list (its name, its INSEE code, its département, its
 * coordinates), a radius of 0 to 200 km, and « à domicile ». Never a postal address: the zone has
 * no field for one, a name of commune that looks like one is refused, and the coordinates are
 * rounded to about 1 km. All of France, without a pilot area (decision of 13/10/2026, evening):
 * the overseas collectivities of the official list too.
 *
 * The rules of the server, in one place: the département an INSEE code names, and what is wrong
 * with a value, in French. The collection (src/collections/Profiles.ts) calls them; the zone of
 * the makeup artist's space (ticket 123) shows the same messages.
 *
 * Checking that a commune is really on the official list (geo.api.gouv.fr), and that its name is
 * the one of its code, is not done here: the space (ticket 123) and the import (ticket 063) choose
 * it there. Here, only its form: a name made of the characters of a name of commune, which does
 * not look like an address.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { DEPARTEMENTS } from '../departements'

/**
 * The radius a profile accepts, in whole kilometres (plan 01 §3.3 P7.4). The display keeps its
 * own bound (`RAYON_MAX_KM`, src/lib/format-zone.ts, 1 000 km as on the old site), which is not
 * this one.
 */
export const BORNES_DU_RAYON_KM = { min: 0, max: 200 } as const

/** The longest name of a commune kept; the longest of the official list has 45 characters. */
export const NOM_DE_COMMUNE_MAX = 70

/**
 * The decimals kept of a coordinate: the centre of a commune to about 1 km (0.01° is 1.1 km of
 * latitude), never a point that locates a home.
 */
export const DECIMALES_DES_COORDONNEES = 2

/** The fields of the commune of a profile, in the order of SCHEMA.md §5.2. */
export const CHAMPS_DE_LA_COMMUNE = ['nom', 'codeInsee', 'departement', 'latitude', 'longitude'] as const

/**
 * The overseas collectivities whose communes the official list holds (geo.api.gouv.fr, 14/10/2026),
 * besides the 101 départements of src/lib/departements.ts: code → name. Their INSEE codes start
 * with these three characters, and `commune.departement` holds them.
 */
export const COLLECTIVITES_D_OUTRE_MER: Readonly<Record<string, string>> = {
	975: 'Saint-Pierre-et-Miquelon',
	977: 'Saint-Barthélemy',
	978: 'Saint-Martin',
	984: 'Terres australes et antarctiques françaises',
	986: 'Wallis-et-Futuna',
	987: 'Polynésie française',
	988: 'Nouvelle-Calédonie',
	989: 'Île de Clipperton',
}

/** What the server answers, in French, to a zone it refuses. */
export const MESSAGES_DE_LA_ZONE = {
	rayon: `Le rayon d’action se donne en kilomètres entiers, de ${BORNES_DU_RAYON_KM.min} à ${BORNES_DU_RAYON_KM.max} km.`,
	codeInseeMalForme: 'Le code INSEE de la commune est mal formé : 5 caractères, comme 74010 ou 2A004.',
	communeSansCodeInsee: 'Choisis ta commune dans la liste : sans son code INSEE, elle ne peut pas être enregistrée.',
	codeInseeSansNom: 'Il manque le nom de la commune de ce code INSEE.',
	nomInvalide: `Le nom de la commune est un texte de ${NOM_DE_COMMUNE_MAX} caractères au plus.`,
	nomAdresse: 'Ce nom ressemble à une adresse : choisis ta commune dans la liste, jamais ton adresse.',
	nomCaracteres:
		'Le nom d’une commune n’a que des lettres, des espaces, des traits d’union, des apostrophes et des parenthèses : choisis ta commune dans la liste.',
	latitude: 'La latitude de la commune va de -90 à 90.',
	longitude: 'La longitude de la commune va de -180 à 180.',
	coordonneesIncompletes: 'La latitude et la longitude de la commune vont ensemble.',
	coordonneesSansCommune: 'Des coordonnées sans commune ne peuvent pas être enregistrées.',
} as const

/**
 * An INSEE code of a commune: the département first (3 characters overseas, 2 in mainland France
 * and Corsica), then the number of the commune in it. Overseas comes first: « 97411 » is the
 * commune 11 of the département 974, never the commune 411 of a département 97; « 98735 » the
 * commune 35 of the collectivity 987.
 */
const CODE_INSEE = /^(?:(9[78]\d)(\d{2})|(\d{2}|2[AB])(\d{3}))$/

/**
 * The département an INSEE code names, or null when the code is not well formed: « 74010 » →
 * « 74 », « 2A004 » → « 2A », « 97411 » → « 974 », « 97701 » → « 977 ». The 101 départements of
 * src/lib/departements.ts and the overseas collectivities of the official list
 * (`COLLECTIVITES_D_OUTRE_MER`) exist here, nothing else: « 20004 » (Corsica is 2A and 2B),
 * « 97001 » and a commune numbered 0 are refused. The code is read as written: no space, A and B
 * in capitals (the collection writes it so before it checks it).
 */
export function departementDuCodeInsee(code: unknown): string | null {
	if (typeof code !== 'string') return null
	const [, outreMer, numeroOutreMer, metropole, numeroMetropole] = CODE_INSEE.exec(code) ?? []
	const departement = outreMer ?? metropole
	const numero = numeroOutreMer ?? numeroMetropole
	if (departement === undefined || numero === undefined || /^0+$/.test(numero)) return null
	return Object.hasOwn(DEPARTEMENTS, departement) || Object.hasOwn(COLLECTIVITES_D_OUTRE_MER, departement)
		? departement
		: null
}

/** An INSEE code as the collection stores it: without spaces around, A and B in capitals, null when empty. */
export function codeInseeNormalise(code: unknown): unknown {
	if (typeof code !== 'string') return code
	return code.trim().toUpperCase() || null
}

/** A plain object, as a JSON body gives one: not an array, nor a date, a map or another instance. */
function objetSimple(valeur: unknown): valeur is Record<string, unknown> {
	if (typeof valeur !== 'object' || valeur === null) return false
	const prototype = Object.getPrototypeOf(valeur)
	return prototype === Object.prototype || prototype === null
}

/**
 * A commune as the collection reads it, whatever a request sent: its fields.
 *
 * - An object is the whole commune: what it does not give is empty, never taken from the commune
 *   already stored. A name is so never saved next to the code of another commune, nor a commune
 *   next to the coordinates of the former one. Its `departement` is the server's: not kept.
 * - `null` is the empty commune: it empties a stored one.
 * - A text, a number… is a name without an INSEE code, which the check refuses: free text is
 *   never a commune.
 * - An array, or another object than a plain one, is left as sent: `verdictDeLaCommune` refuses it.
 * - Nothing sent stays nothing (Payload hands the stored commune instead on an update).
 */
export function communeEnChamps(commune: unknown): unknown {
	if (commune === undefined) return commune
	if (objetSimple(commune)) {
		const { nom = null, codeInsee = null, latitude = null, longitude = null } = commune
		return { nom, codeInsee, latitude, longitude }
	}
	if (typeof commune === 'object' && commune !== null) return commune
	return { nom: commune ?? null, codeInsee: null, latitude: null, longitude: null }
}

/**
 * The commune as a whole, once read by `communeEnChamps`: nothing, or a plain object. An array (or
 * a date…) is refused in French: without it, its fields would be read as empty while the stored
 * ones stay, and its département would be lost.
 */
export function verdictDeLaCommune(commune: unknown): true | string {
	return commune === undefined || commune === null || objetSimple(commune)
		? true
		: MESSAGES_DE_LA_ZONE.communeSansCodeInsee
}

/**
 * Types of street, as src/lib/profil/lieu-public.ts reads them in an address (lower case, without
 * accents). Here they only count before another word: « Rue », « Le Chemin », « Le Passage » are
 * communes.
 */
const VOIES = new Set([
	'rue',
	'ruelle',
	'avenue',
	'av',
	'bd',
	'boulevard',
	'chemin',
	'allee',
	'impasse',
	'route',
	'place',
	'quai',
	'cours',
	'square',
	'esplanade',
	'promenade',
	'passage',
	'sentier',
	'traverse',
	'venelle',
	'voie',
	'montee',
	'chaussee',
	'faubourg',
	'rond-point',
	'lieu-dit',
	'lieudit',
	'hameau',
	'lotissement',
	'residence',
	'clos',
	'domaine',
	'parc',
	'za',
	'zac',
	'zi',
	'bp',
])

/** The ordinal of a municipal arrondissement, the only digits of the official list (« Paris 20e Arrondissement »). */
const ARRONDISSEMENT = / \d{1,2}(?:er|e) arrondissement$/i

/**
 * Whether a name of commune looks like a postal address: a digit (a street number, a postal code)
 * other than the ordinal of an arrondissement, a comma or another separator of the parts of an
 * address, or a type of street followed by another word (« rue des Lilas »). No name of the
 * official list does: the rule was run on the whole list of 14/10/2026 (34 969 communes and 45
 * municipal arrondissements of geo.api.gouv.fr), and none was refused.
 */
export function ressembleAUneAdresse(nom: string): boolean {
	const sansArrondissement = nom.trim().replace(ARRONDISSEMENT, '')
	if (/\d/.test(sansArrondissement) || /[,;:/|]/.test(sansArrondissement)) return true
	const mots = sansArrondissement.split(/\s+/).map(mot =>
		mot
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/^l['’]/, '')
	)
	return mots.some((mot, i) => i < mots.length - 1 && VOIES.has(mot))
}

/**
 * The characters of a name of the official list: letters of any script with their accents, spaces,
 * hyphens, apostrophes and parentheses (« Château-Chinon (Ville) », « L’Haÿ-les-Roses »), and the
 * ordinal of an arrondissement, the only digits (removed before this check). An email, a website,
 * an abbreviation (« St. ») or a symbol is not a name of commune.
 */
const CARACTERES_D_UN_NOM = /^[\p{L}\p{M} '’()-]*$/u

/** Whether a name holds only the characters of a name of commune (`CARACTERES_D_UN_NOM`). */
export function aLesCaracteresDUnNom(nom: string): boolean {
	return CARACTERES_D_UN_NOM.test(nom.trim().replace(ARRONDISSEMENT, ''))
}

/** A coordinate as the collection stores it: rounded to `DECIMALES_DES_COORDONNEES`; anything else as it came. */
export function coordonneeArrondie(valeur: unknown): unknown {
	if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return valeur
	const facteur = 10 ** DECIMALES_DES_COORDONNEES
	// `|| 0`: never a negative zero.
	return Math.round(valeur * facteur) / facteur || 0
}

/** A name as the collection stores it: without spaces around, null when empty. */
export function nomNormalise(nom: unknown): unknown {
	if (typeof nom !== 'string') return nom
	return nom.trim() || null
}

/** Nothing given: absent, null, or a text of spaces only. */
const vide = (valeur: unknown): boolean =>
	valeur === null || valeur === undefined || (typeof valeur === 'string' && valeur.trim() === '')

/**
 * The radius: empty (the makeup artist has not said it), or a whole number of kilometres from 0
 * to 200. Gives `true`, or the message of the refusal.
 */
export function verdictDuRayon(rayon: unknown): true | string {
	if (vide(rayon)) return true
	const { min, max } = BORNES_DU_RAYON_KM
	return typeof rayon === 'number' && Number.isInteger(rayon) && rayon >= min && rayon <= max
		? true
		: MESSAGES_DE_LA_ZONE.rayon
}

/** What a commune holds before it is checked: anything a request may send. */
export type CommuneSaisie = Partial<Record<(typeof CHAMPS_DE_LA_COMMUNE)[number], unknown>>

/** The fields of a commune that can be wrong, each with the message of its refusal. */
export type ErreursDeLaCommune = Partial<Record<'nom' | 'codeInsee' | 'latitude' | 'longitude', string>>

/** A coordinate: absent, in its bounds, or out of them (not a number, or too far). */
function coordonnee(valeur: unknown, borne: number): 'absente' | 'valide' | 'invalide' {
	if (vide(valeur)) return 'absente'
	return typeof valeur === 'number' && Number.isFinite(valeur) && Math.abs(valeur) <= borne ? 'valide' : 'invalide'
}

/**
 * What is wrong with a commune, field by field, in French; an empty object when nothing is.
 *
 * - Empty (nothing given): no error, a profile may have no zone yet.
 * - A commune has its name and its INSEE code, the one never without the other, and the code is
 *   well formed (`departementDuCodeInsee`). Its name never looks like an address
 *   (`ressembleAUneAdresse`), and holds only the characters of a name (`aLesCaracteresDUnNom`).
 * - Its coordinates are optional; given, they come together, in their bounds, with a commune.
 *
 * The département is not checked: the server computes it from the code, whatever was sent.
 */
export function erreursDeLaCommune(commune: CommuneSaisie | null | undefined): ErreursDeLaCommune {
	const { nom, codeInsee, latitude, longitude } = commune ?? {}
	const erreurs: ErreursDeLaCommune = {}

	if (!vide(codeInsee) && departementDuCodeInsee(codeInsee) === null)
		erreurs.codeInsee = MESSAGES_DE_LA_ZONE.codeInseeMalForme
	else if (vide(codeInsee) && !vide(nom)) erreurs.codeInsee = MESSAGES_DE_LA_ZONE.communeSansCodeInsee

	if (!vide(nom) && (typeof nom !== 'string' || nom.trim().length > NOM_DE_COMMUNE_MAX))
		erreurs.nom = MESSAGES_DE_LA_ZONE.nomInvalide
	else if (typeof nom === 'string' && ressembleAUneAdresse(nom)) erreurs.nom = MESSAGES_DE_LA_ZONE.nomAdresse
	else if (typeof nom === 'string' && !aLesCaracteresDUnNom(nom)) erreurs.nom = MESSAGES_DE_LA_ZONE.nomCaracteres
	else if (vide(nom) && !vide(codeInsee)) erreurs.nom = MESSAGES_DE_LA_ZONE.codeInseeSansNom

	const lat = coordonnee(latitude, 90)
	const lng = coordonnee(longitude, 180)
	if (lat === 'invalide') erreurs.latitude = MESSAGES_DE_LA_ZONE.latitude
	if (lng === 'invalide') erreurs.longitude = MESSAGES_DE_LA_ZONE.longitude
	if (lat === 'absente' && lng !== 'absente') erreurs.latitude = MESSAGES_DE_LA_ZONE.coordonneesIncompletes
	if (lng === 'absente' && lat !== 'absente') erreurs.longitude = MESSAGES_DE_LA_ZONE.coordonneesIncompletes
	if (lat === 'valide' && lng === 'valide' && vide(codeInsee) && vide(nom))
		erreurs.latitude = MESSAGES_DE_LA_ZONE.coordonneesSansCommune

	return erreurs
}
