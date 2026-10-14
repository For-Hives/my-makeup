/**
 * Where the profiles of a search by city are (ticket 098; plan 02 U17; decisions of 09/10/2026 and
 * 13/10/2026): first the artists of the city or of the département typed, the only ones the title
 * counts, then the others in sections.
 *
 * Ported from src/lib/lieu.js of the old site (branch main), with one change: a profile's place was
 * free text there, and is now its commune, with the département the server computed from its INSEE
 * code. What the visitor typed is still read as text: a city, a postal code (74000), a code of
 * département (« 74 », « (74) », 2A, 974) or a name (Haute-Savoie), never geocoded. « France » says
 * nothing of where; a country or a region only counts when nothing more precise was typed.
 */

import { DEPARTEMENTS, departementDuCodePostal, normaliserLieu } from '../departements'

const NOMS_DE_DEPARTEMENT = new Map<string, string[]>([
	...Object.entries(DEPARTEMENTS).map(([code, nom]): [string, string[]] => [normaliserLieu(nom), [code]]),
	['corse', ['2A', '2B']],
	['reunion', ['974']],
])

const commencePar = (texte: string, mots: string): boolean => `${texte} `.startsWith(`${mots} `)
const contient = (texte: string, mots: string): boolean => ` ${texte} `.includes(` ${mots} `)

/** A name of département → the longer names that begin with it: « loire » → « loire atlantique ». */
const NOMS_PLUS_LONGS = new Map(
	[...NOMS_DE_DEPARTEMENT.keys()].map(nom => [
		nom,
		[...NOMS_DE_DEPARTEMENT.keys()].filter(autre => autre !== nom && commencePar(autre, nom)),
	])
)

/** The whole country: not a place to rank by. */
const PARTOUT = new Set(['france', 'toute la france', 'france entiere', 'partout en france', 'france metropolitaine'])

/** Countries and regions (those of 2016, the former ones still written): wider than a city or a département. */
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

/** Numbers in a place (postal code, arrondissement) are not part of its name: « Paris 15e » is in Paris. */
const NUMERO = /^\d+(e|er|eme|ieme|re)?$/
/** Places in one field: « Annecy / Genève », « Annecy (74) », « Lyon - Rhône ». */
const SEPARATEURS = /[,;/|+()[\]]|\s[-–—]\s/
const CODE_DE_DEPARTEMENT = /^(\d{2}|2A|2B|97\d)$/

export interface SegmentDeLieu {
	/** The place written, normalised, without its numbers. */
	mots: string
	/** True when the place is the name of a département. */
	departement: boolean
	/** True when it is a country or a region. */
	large: boolean
}

export interface Lieu {
	segments: SegmentDeLieu[]
	/** Codes of département found in the text. */
	departements: string[]
}

/** A segment that is a code of département: « 74 », « 2a », « 974 », « 20 ». */
function codesDuSegment(segment: string): string[] {
	if (segment === '20') return ['2A', '2B']
	const code = segment.toUpperCase()
	return CODE_DE_DEPARTEMENT.test(code) && DEPARTEMENTS[code] ? [code] : []
}

/** What a city field says of where: the places written and the départements named. */
export function lireLieu(valeur: unknown): Lieu {
	const brut = typeof valeur === 'string' ? valeur : ''
	const departements = new Set<string>()
	for (const [code] of brut.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
		const departement = departementDuCodePostal(code)
		if (departement) departements.add(departement)
	}
	const segments: SegmentDeLieu[] = []
	for (const morceau of brut.split(SEPARATEURS)) {
		const segment = normaliserLieu(morceau)
		const codes = codesDuSegment(segment)
		for (const code of codes) departements.add(code)
		const mots = codes.length
			? ''
			: segment
					.split(' ')
					.filter(mot => mot && !NUMERO.test(mot))
					.join(' ')
		if (!mots || PARTOUT.has(mots)) continue
		const parNom = NOMS_DE_DEPARTEMENT.get(mots)
		for (const code of parNom ?? []) departements.add(code)
		segments.push({ mots, departement: parNom !== undefined, large: LARGES.has(mots) })
	}
	return { segments, departements: [...departements] }
}

const lieuVide = (lieu: Lieu): boolean => lieu.segments.length === 0 && lieu.departements.length === 0

/** A place that starts with this name of département, and not with a longer one that begins the same. */
const commenceParDepartement = (texte: string, nom: string): boolean =>
	commencePar(texte, nom) && !(NOMS_PLUS_LONGS.get(nom) ?? []).some(long => commencePar(texte, long))

/** Where a profile works, as the search reads it: its commune, and the département of its INSEE code. */
export interface PlaceDuProfil {
	ville: string | null
	departement: string | null
	/** True when she gives a city and a radius: she travels. */
	seDeplace: boolean
}

/** The place of a profile, in the shape of what was typed. */
export function lieuDuProfil({ ville, departement }: Pick<PlaceDuProfil, 'ville' | 'departement'>): Lieu {
	const lu = lireLieu(ville)
	return { segments: lu.segments, departements: departement ? [departement] : [] }
}

/**
 * How the place of a profile matches what was typed:
 * - 'ville': the words typed, whole and in order, are in her commune (« annecy » in « Annecy-le-Vieux »,
 *   not in « Annemasse »); a name of département only at the start of a place and never inside a longer
 *   one (« Savoie » is not « Haute-Savoie »); a country or a region only when it holds nothing else
 *   (« Annecy, Suisse » is Annecy);
 * - 'departement': a département in common (postal code, code or name);
 * - null otherwise, and always for a profile without a commune.
 */
export function correspondanceLieu(profil: Lieu, cherche: Lieu): 'ville' | 'departement' | null {
	const precis = cherche.segments.filter(segment => !segment.large)
	const segments = precis.length || cherche.departements.length ? precis : cherche.segments
	for (const { mots, departement } of segments) {
		if (profil.segments.some(p => (departement ? commenceParDepartement(p.mots, mots) : contient(p.mots, mots))))
			return 'ville'
	}
	if (cherche.departements.some(code => profil.departements.includes(code))) return 'departement'
	return null
}

/**
 * The département of a search by city: the one typed (postal code, code or name), else the one the
 * profiles of that city are in, the most frequent, the first in their order on a tie; none without
 * either (no geocoding: « Annecy » alone says nothing).
 */
export function departementsDeLaRecherche(locaux: readonly PlaceDuProfil[], city: string): string[] {
	const tapes = lireLieu(city).departements
	if (tapes.length) return tapes
	const compte = new Map<string, number>()
	for (const profil of locaux)
		if (profil.departement) compte.set(profil.departement, (compte.get(profil.departement) ?? 0) + 1)
	let meilleur: string | null = null
	for (const [code, n] of compte) if (meilleur === null || n > (compte.get(meilleur) ?? 0)) meilleur = code
	return meilleur === null ? [] : [meilleur]
}

/** « du 74 (Haute-Savoie) », « du 2A (Corse-du-Sud) et du 2B (Haute-Corse) ». */
export const duDepartement = (codes: readonly string[]): string =>
	codes.map(code => `du ${code}${DEPARTEMENTS[code] ? ` (${DEPARTEMENTS[code]})` : ''}`).join(' et ')

export interface SectionAutres<T> {
	cle: 'departement' | 'deplacent' | 'autres'
	/** Its h2. */
	titre: string
	profils: T[]
}

export interface ProfilsParLieu<T> {
	/** The profiles of the place typed: the city, then the département. The only ones the title counts. */
	locaux: T[]
	/** False without a usable place (no city, « France »): one list. */
	parLieu: boolean
	departements: string[]
	sections: SectionAutres<T>[]
}

/**
 * A search by city in sections, every profile once: first those of the place typed, city then
 * département (the only ones counted in the title); then all the others, in three sections:
 * - the other profiles of the département of the search, when one is known;
 * - those of elsewhere that go to the client (a city and a radius);
 * - the rest, « Zone non renseignée » included.
 * Each list keeps the order given.
 */
export function sectionsParLieu<T extends PlaceDuProfil>(profils: readonly T[], city: string): ProfilsParLieu<T> {
	const cherche = lireLieu(city)
	if (lieuVide(cherche)) return { locaux: [...profils], parLieu: false, departements: [], sections: [] }

	const ville: T[] = []
	const departement: T[] = []
	const autres: T[] = []
	for (const profil of profils) {
		const correspondance = correspondanceLieu(lieuDuProfil(profil), cherche)
		if (correspondance === 'ville') ville.push(profil)
		else if (correspondance === 'departement') departement.push(profil)
		else autres.push(profil)
	}
	const locaux = [...ville, ...departement]
	const departements = departementsDeLaRecherche(locaux, city)
	const duDepartementCherche = autres.filter(profil => profil.departement && departements.includes(profil.departement))
	const ailleurs = autres.filter(profil => !duDepartementCherche.includes(profil))
	const section = (cle: SectionAutres<T>['cle'], titre: string, liste: T[]): SectionAutres<T>[] =>
		liste.length ? [{ cle, titre, profils: liste }] : []
	return {
		locaux,
		parLieu: true,
		departements,
		sections: [
			...section('departement', `Autres maquilleuses ${duDepartement(departements)}`, duDepartementCherche),
			...section(
				'deplacent',
				'Autres maquilleuses qui se déplacent',
				ailleurs.filter(profil => profil.seDeplace)
			),
			...section(
				'autres',
				'Autres maquilleuses',
				ailleurs.filter(profil => !profil.seDeplace)
			),
		],
	}
}
