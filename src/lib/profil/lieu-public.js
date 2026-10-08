/**
 * The place of a profile as it may be published (UI-11, plans/01 §6.2):
 * the commune, with its département when a postal code was typed
 * (« Annecy (74) »), never a street number nor a street.
 *
 * The city field is free text: a few artists typed their postal address
 * there. Since #946 such a field was refused by completude.js, so a complete
 * profile left the sitemap and was noindex; and the street was published on
 * the profile, in the search, in the JSON-LD and in the props of the page.
 * Every public place now goes through lieuPublic(); the artist's space keeps
 * what she typed.
 *
 * Read as an address:
 * - a field with a type of street or a part of an address (rue, avenue,
 *   place, lieu-dit, BP, ZA…);
 * - a number at the start and a postal code further (« 12 Les Marais 74000
 *   Annecy »);
 * - two words or more, a postal code and a place (« Le Bourg 74300 Cluses »).
 * Then:
 * - with a postal code: the commune after it, else the place before it when
 *   it holds no street (« …, Annecy 74000 »), else the postal code alone;
 * - without a postal code: the last part after a comma when it holds no
 *   street (« 12 rue X, Annecy »); without a comma the commune cannot be
 *   told from the end of the street (« rue Victor Hugo »), so only a
 *   compound name is taken (« 3 place Z Thonon-les-Bains »), else nothing.
 *
 * A number at the start followed by a place alone (« 74 Annecy », « 12 Le
 * Bourg ») may be a département or a street number: the place is published
 * without the number, and with it only when the place is the name of that
 * département (« 74 Haute-Savoie » → « Haute-Savoie (74) »). A number
 * followed by free text is no street number (« 74 et alentours », « 3
 * villes : … »): shown as typed.
 *
 * Any other field is shown as typed (« Paris, Lyon et Annecy », « Toute la
 * France »), except one place with its postal code (« Annecy 74000 »),
 * written « Annecy (74) ». CEDEX and a final « France » are dropped, and
 * from an address a final foreign country too. A commune typed in capitals
 * or in lower case is written as a name. lieuPublic(lieuPublic(x).texte)
 * gives the same place: the public page reads it again from its props.
 */

import { villeAffichee } from '../format-zone.js'
import {
	DEPARTEMENTS,
	departementDuCodePostal,
	normaliserLieu,
} from '../lieu.js'

/** Help of the city field in the artist's space */
export const AIDE_VILLE =
	'Indique ta ville (et ton code postal), pas ton adresse : elle est publique.'

/** Types of street and parts of an address (lower case, no accents) */
const VOIES = new Set([
	'rue',
	'ruelle',
	'avenue',
	'av',
	'ave',
	'bd',
	'bld',
	'blvd',
	'boulevard',
	'chemin',
	'allee',
	'impasse',
	'imp',
	'route',
	'rte',
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
	'fbg',
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
	'zae',
	'zi',
	'bp',
	'cs',
	'tsa',
	'batiment',
	'bat',
	'appartement',
	'appt',
	'apt',
	'etage',
	'escalier',
])

/** Small words written in lower case inside a name (Thonon-les-Bains) */
const PARTICULES = new Set([
	'le',
	'la',
	'les',
	'l',
	'de',
	'du',
	'des',
	'd',
	'en',
	'sur',
	'sous',
	'lez',
	'aux',
	'au',
	'et',
	'a',
])
const ARTICLES = new Set(['le', 'la', 'les'])

/** Titles inside a name of street (« avenue du Général Charles-de-Gaulle ») */
const TITRES = new Set([
	'general',
	'gal',
	'marechal',
	'president',
	'docteur',
	'dr',
	'abbe',
	'colonel',
	'commandant',
	'capitaine',
	'lieutenant',
	'professeur',
	'pasteur',
	'amiral',
	'cardinal',
])

/** Words that say how far, not where (« 74 et alentours », « 74 partout ») */
const PAS_UN_LIEU = new Set([
	'partout',
	'alentours',
	'alentour',
	'environs',
	'autour',
	'toute',
	'tout',
	'tous',
	'toutes',
	'france',
	'region',
	'departement',
	'departements',
	'secteur',
	'secteurs',
	'ville',
	'villes',
	'km',
	'kms',
	'deplacement',
	'deplacements',
	'domicile',
	'rayon',
])

// a street number at the start: « 12 », « 12, », « 12bis », « 3 B »; also
// a code of département (« 74 », « 2A »)
const NUMERO_EN_TETE = /^\d{1,4}(?:\s?(?:bis|ter|quater|[a-d]))?(?=[\s,]|$)/i
const CODES_POSTAUX = /(?<!\d)\d{5}(?!\d)/g
// « 74 000 » written with a space
const CODE_POSTAL_ESPACE = /(?<!\d)(\d{2}) (\d{3})(?!\d)/g
// a foreign postal code before the town (« 1000 Bruxelles », « L-1234 »)
const CODE_ETRANGER = /^(?:[a-z]{1,2}-)?\d{4}\s+/i
const CEDEX = /\bcedex(?:\s*\d{1,2})?\b/gi
const PAYS_FIN = /(?:[\s,;/–-]*\bfrance\b\.?)+\s*$/i
const PAYS_APRES_SEPARATEUR = /(?:\s*[,;/–-]\s*france\.?)+\s*$/i
// at the end of an address only: the town comes before (Luxembourg and
// Monaco are towns too, they stay)
const PAYS_ETRANGER_FIN =
	/(?:[\s,;/–-]*\b(?:suisse|belgique|allemagne|italie|espagne)\b\.?)+\s*$/i
// several places or a sentence, not one place
const SEPARATEURS = /[,;:/|+()[\]]|\s[-–—]\s/
// what a « Commune (74) » already written holds
const COMMUNE_DEPARTEMENT = /^(.+?) \((\d{2}|2A|2B|97\d)\)$/

/**
 * A word as compared: lower case, no accents, no final punctuation.
 * @param {string} mot
 * @returns {string}
 */
const normaliserMot = mot =>
	mot
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/^[(]+|[.,;:)]+$/g, '')

const mots = texte => texte.split(/\s+/).filter(Boolean)
const estVoie = mot => VOIES.has(normaliserMot(mot))
const aUneVoie = texte => mots(texte).some(estVoie)
const sansBords = texte =>
	texte.replace(/^[\s,;:./–-]+|[\s,;:/–-]+$/g, '').replace(/\s+/g, ' ')
const sansNumero = texte => sansBords(texte.trim().replace(NUMERO_EN_TETE, ''))
const sansPays = texte =>
	texte.replace(PAYS_ETRANGER_FIN, '').replace(PAYS_FIN, '')

/** The last postal code of a text, the one before the commune */
function dernierCodePostal(texte) {
	const codes = [...texte.matchAll(CODES_POSTAUX)]
	const cp = codes.at(-1)
	return cp ? { code: cp[0], index: cp.index } : null
}

/** Name of the département of a code, as compared */
const nomDuDepartement = code =>
	DEPARTEMENTS[code] ? normaliserLieu(DEPARTEMENTS[code]) : null

// « ANNECY-LE-VIEUX » → « Annecy-le-Vieux », « l'isle-d'abeau » →
// « L'Isle-d'Abeau »: only for a name typed all in capitals or in lower case
function nomPropre(nom) {
	if (nom !== nom.toUpperCase() && nom !== nom.toLowerCase()) return nom
	let premier = true
	return nom
		.toLowerCase()
		.split(/([\s-]+)/)
		.map(partie => {
			if (/^[\s-]+$/.test(partie)) return partie
			const resultat = partie
				.split(/(['’])/)
				.map((morceau, i, morceaux) => {
					if (morceau === '' || /^['’]$/.test(morceau)) return morceau
					const elision = morceaux[i + 1] !== undefined
					const debut = premier
					premier = false
					if (!debut && (elision || PARTICULES.has(normaliserMot(morceau))))
						return morceau
					return morceau.charAt(0).toUpperCase() + morceau.slice(1)
				})
				.join('')
			return resultat
		})
		.join('')
}

/**
 * A place without street nor number: letters, no digit, no type of street.
 * @param {string} texte
 * @returns {string} the name, or ''
 */
function nomDeLieu(texte) {
	const t = sansBords(texte.replace(CEDEX, ' '))
	if (!/\p{L}/u.test(t) || /\d/.test(t) || aUneVoie(t)) return ''
	if (normaliserMot(t) === 'france') return ''
	return nomPropre(t)
}

/**
 * One place written alone (« Annecy », « La Roche sur Foron »,
 * « Haute-Savoie »), not a list, a sentence nor a distance (« et
 * alentours », « partout », « villes : … »).
 * @param {string} texte
 * @returns {boolean}
 */
function estUnLieu(texte) {
	if (!/\p{L}/u.test(texte) || /\d/.test(texte) || SEPARATEURS.test(texte))
		return false
	const liste = mots(texte)
	if (liste.length > 4) return false
	const premier = normaliserMot(liste[0])
	if (PARTICULES.has(premier) && !ARTICLES.has(premier)) return false
	return !liste.some(mot => estVoie(mot) || PAS_UN_LIEU.has(normaliserMot(mot)))
}

/**
 * Whether the field is a postal address (see the top of this file).
 * @param {string} brut
 * @returns {boolean}
 */
function estAdresse(brut) {
	if (aUneVoie(brut)) return true
	const t = sansPays(brut.replace(CEDEX, ' '))
	const cp = dernierCodePostal(t)
	if (!cp) return false
	const avant = t.slice(0, cp.index)
	// « 12 Les Marais 74000 Annecy », not « 3 villes : Annecy 74000, … »
	if (NUMERO_EN_TETE.test(t)) return !/[:;/|+()[\]]/.test(avant)
	// « Le Bourg 74300 Cluses », not « Annecy 74000 » nor « Thonon les Bains
	// 74200 »
	const apres = t.slice(cp.index + 5).split(/[,;/]/)[0]
	return (
		mots(avant.split(/[,;]/).at(-1) ?? '').length >= 2 &&
		estUnLieu(sansBords(apres))
	)
}

/**
 * The commune at the end of a street without a comma nor a postal code
 * (« 3 place Z Thonon-les-Bains »): only a compound name with a small word
 * inside (Thonon-les-Bains, Annecy-le-Vieux), or after Le, La or Les (Le
 * Grand-Bornand), so that the end of a street (rue Victor Hugo, rue
 * Joliot-Curie, avenue du Général Charles-de-Gaulle) is never taken for a
 * commune.
 * @param {string} texte
 * @returns {string}
 */
function communeApresVoie(texte) {
	const liste = mots(texte)
	let derniereVoie = -1
	liste.forEach((mot, i) => {
		if (estVoie(mot)) derniereVoie = i
	})
	if (derniereVoie < 0) return ''
	const reste = liste.slice(derniereVoie + 1)
	if (reste.length < 2) return ''
	const dernier = reste.at(-1)
	if (/\d/.test(dernier) || !dernier.includes('-')) return ''
	const avant = normaliserMot(reste.at(-2))
	if (TITRES.has(avant)) return ''
	if (
		ARTICLES.has(avant) &&
		reste.length >= 3 &&
		!PARTICULES.has(normaliserMot(reste.at(-3)))
	)
		return nomDeLieu(`${reste.at(-2)} ${dernier}`)
	if (PARTICULES.has(avant)) return ''
	const parties = dernier.split('-').map(normaliserMot)
	const compose = parties.slice(1, -1).some(p => PARTICULES.has(p))
	return compose ? nomDeLieu(dernier) : ''
}

/**
 * The commune of a postal address (see the top of this file).
 * @param {string} adresse
 * @returns {{commune: string, codePostal: string}}
 */
function communeDAdresse(adresse) {
	const t = sansPays(adresse.replace(CEDEX, ' '))
	const cp = dernierCodePostal(t)
	if (cp) {
		// after the postal code, up to a separator, a digit or a street
		const apres = []
		for (const mot of mots(t.slice(cp.index + 5).split(/[,;/]/)[0])) {
			if (/\d/.test(mot) || estVoie(mot)) break
			apres.push(mot)
		}
		let commune = nomDeLieu(apres.join(' '))
		// « …, 74160 Haute-Savoie »: a département is no commune (Paris is
		// both)
		const departement = departementDuCodePostal(cp.code)
		if (
			commune &&
			departement &&
			departement !== '75' &&
			normaliserLieu(commune) === nomDuDepartement(departement)
		)
			commune = ''
		if (!commune) {
			const avant = t.slice(0, cp.index).split(/[,;]/).at(-1) ?? ''
			commune = nomDeLieu(sansNumero(avant)) || communeApresVoie(avant)
		}
		return { commune, codePostal: cp.code }
	}
	const parties = t
		.split(/[,;]/)
		.map(p => p.trim())
		.filter(Boolean)
	// « 1000 Bruxelles »: the town without its foreign postal code
	const derniere = (parties.at(-1) ?? '').replace(CODE_ETRANGER, '')
	if (parties.length >= 2)
		return {
			commune: nomDeLieu(derniere) || communeApresVoie(derniere),
			codePostal: '',
		}
	return { commune: communeApresVoie(derniere), codePostal: '' }
}

/**
 * @typedef {object} LieuPublic
 * @property {string} texte - what is shown: « Annecy (74) », « Annecy »,
 *   « 74000 », « Paris, Lyon et Annecy », or '' when nothing can be shown
 * @property {string} commune - the commune alone when it is known (for the
 *   JSON-LD), else the text
 * @property {string|null} departement - '74', '2A', '974' or null
 * @property {boolean} adresse - the field was read as a postal address, or
 *   a number was dropped before a place
 */

const AUCUN = { texte: '', commune: '', departement: null, adresse: false }

/**
 * @param {unknown} city - as typed in the profile, or already public
 * @returns {LieuPublic}
 */
export function lieuPublic(city) {
	const brut = villeAffichee(city).replace(CODE_POSTAL_ESPACE, '$1$2')
	if (!brut) return AUCUN

	if (estAdresse(brut)) {
		const { commune, codePostal } = communeDAdresse(brut)
		const departement = codePostal ? departementDuCodePostal(codePostal) : null
		let texte = ''
		if (commune) texte = departement ? `${commune} (${departement})` : commune
		else if (departement) texte = codePostal
		return { texte, commune: commune || texte, departement, adresse: true }
	}

	const t = sansBords(
		brut.replace(CEDEX, ' ').replace(PAYS_APRES_SEPARATEUR, '')
	)
	if (!t) return AUCUN

	// a number then one place: « 74 Annecy », « 12 Le Bourg », « 74
	// Haute-Savoie »; never the number, unless it is the département named
	const numero = NUMERO_EN_TETE.exec(t)
	if (numero) {
		const lieu = sansBords(t.slice(numero[0].length))
		if (estUnLieu(lieu)) {
			const nom = nomDeLieu(lieu)
			const code = numero[0].replace(/\s/g, '').toUpperCase()
			if (nomDuDepartement(code) === normaliserLieu(lieu))
				return {
					texte: `${nom} (${code})`,
					commune: nom,
					departement: code,
					adresse: false,
				}
			return { texte: nom, commune: nom, departement: null, adresse: true }
		}
	}

	const deja = COMMUNE_DEPARTEMENT.exec(t)
	if (deja)
		return { texte: t, commune: deja[1], departement: deja[2], adresse: false }
	// one place and its postal code: « 74000 Annecy », « Annecy 74000 »,
	// « Annecy (74000) »
	const avecCode =
		/^(\d{5})[\s,–-]+([^\d,;/()]+)$/.exec(t) ??
		/^([^\d,;/()]+?)[\s,–-]+\(?(\d{5})\)?$/.exec(t)
	if (avecCode) {
		const [codePostal, nom] = /^\d/.test(avecCode[1])
			? [avecCode[1], avecCode[2]]
			: [avecCode[2], avecCode[1]]
		const commune = nomDeLieu(nom)
		const departement = departementDuCodePostal(codePostal)
		if (commune)
			return {
				texte: departement ? `${commune} (${departement})` : commune,
				commune,
				departement,
				adresse: false,
			}
	}
	const cp = dernierCodePostal(t)
	return {
		texte: t,
		commune: t,
		departement: cp ? departementDuCodePostal(cp.code) : null,
		adresse: false,
	}
}

/**
 * The city as it may be published: « Annecy (74) » for « 12 rue X 74000
 * Annecy », never the number nor the street; '' when nothing can be shown.
 * @param {unknown} city
 * @returns {string}
 */
export const villePublique = city => lieuPublic(city).texte

/**
 * A profile of the content API (`{ id, attributes }`) or flat, with its
 * public city in place of what was typed: for the props of the public
 * pages, so the street never reaches the HTML nor __NEXT_DATA__.
 * @template T
 * @param {T} profil
 * @returns {T}
 */
export function avecVillePublique(profil) {
	if (!profil || typeof profil !== 'object') return profil
	const remplacer = attributs =>
		'city' in attributs
			? { ...attributs, city: villePublique(attributs.city) || null }
			: attributs
	if (profil.attributes && typeof profil.attributes === 'object')
		return { ...profil, attributes: remplacer(profil.attributes) }
	return remplacer(profil)
}
