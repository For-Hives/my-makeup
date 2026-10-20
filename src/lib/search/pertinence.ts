/**
 * The search by a word (ticket 099; plan 02 U23): which listed profiles hold the words typed, and in
 * which order. Ported from the searching service of the old API (`searchingMakeup`, branch main) under
 * the same rules, so that a word finds what it found there:
 *
 * - accents and case do not count: `evenement` finds « événement », `Sete` finds « Sète »;
 * - a term of several words looks for its significant words: the words under 3 letters, the small
 *   words of the language (STOP_WORDS) and the words of the request itself (QUERY_WORDS: « je cherche
 *   une maquilleuse pour mon mariage » looks for « mariage ») are dropped. A term of one word, or of
 *   words that are all dropped, is looked for as typed;
 * - a profile must match EVERY word, each in at least one of its texts: a word that nobody holds
 *   returns nothing;
 * - a word matches with one typo per 5 letters (`SEUIL`, fuse.js): « Anecy » finds « Annecy », and a
 *   shorter word must match exactly;
 * - the best profile comes first: each word adds, for each text, the Fuse score of its match (0 is
 *   exact) or the weight of that text when it does not match. The weights are normalised to sum to 1
 *   (and the scores with them), so the ranking is the one of the old site and the score of a word is
 *   between 0 and 1. A tie keeps the order the profiles came in, which makes the ranking deterministic.
 *
 * The city typed does not act here: it only places profiles in sections afterwards
 * (src/lib/recherche/lieu.ts), and never adds a profile the words did not find.
 *
 * The text typed stays in memory: nothing here logs it, measures it or builds a key from it.
 * No `next` import: read by the page and by the tests.
 */

import Fuse from 'fuse.js'

/** The texts of a profile the words are looked for in. */
export interface TextesDeRecherche {
	/** Her commune. */
	ville: string
	specialite: string
	description: string
	/** The names of her skills. */
	competences: readonly string[]
	/** The descriptions of her skills. */
	descriptionsDesCompetences: readonly string[]
	/** The descriptions of her offers. */
	descriptionsDesPrestations: readonly string[]
	nom: string
	prenom: string
}

type CleDeTexte = keyof TextesDeRecherche

/** What a text weighs when a word does not match it, before the weights are normalised. */
const POIDS_BRUTS: Readonly<Record<CleDeTexte, number>> = {
	ville: 3,
	specialite: 2,
	description: 1.5,
	descriptionsDesCompetences: 1,
	descriptionsDesPrestations: 1,
	competences: 0.9,
	nom: 0.5,
	prenom: 0.5,
}

const CLES = Object.keys(POIDS_BRUTS) as CleDeTexte[]
const TOTAL_DES_POIDS = CLES.reduce((somme, cle) => somme + POIDS_BRUTS[cle], 0)

/** The weights, normalised: they sum to 1. */
export const POIDS: Readonly<Record<CleDeTexte, number>> = Object.fromEntries(
	CLES.map(cle => [cle, POIDS_BRUTS[cle] / TOTAL_DES_POIDS])
) as Record<CleDeTexte, number>

/** The worst score of a match Fuse keeps: 0.2 is one typo per 5 letters, and none under that. */
export const SEUIL = 0.2

/** Small words of the language: they say nothing of what is looked for. */
const MOTS_VIDES = new Set([
	'aux',
	'avec',
	'chez',
	'dans',
	'des',
	'est',
	'les',
	'mes',
	'mon',
	'par',
	'pour',
	'que',
	'qui',
	'ses',
	'son',
	'sur',
	'une',
])

/** Words of the request itself, or that every profile of the site is about: required, they would drop profiles that do not repeat them. */
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

/** A text without its accents, in lower case: how profiles and words are compared. */
export function sansAccents(texte: string): string {
	return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

declare const normalises: unique symbol

/**
 * The texts of a profile once normalised (no accent, lower case). The directory is normalised when it is
 * read, once an hour, so that a search does not do it again for every profile: `classerParPertinence`
 * takes nothing else.
 */
export type TextesNormalises = TextesDeRecherche & { readonly [normalises]: true }

/** The texts of a profile, normalised. */
export function normaliserLesTextes(textes: TextesDeRecherche): TextesNormalises {
	const un = (texte: string): string => sansAccents(texte)
	return {
		ville: un(textes.ville),
		specialite: un(textes.specialite),
		description: un(textes.description),
		competences: textes.competences.map(un),
		descriptionsDesCompetences: textes.descriptionsDesCompetences.map(un),
		descriptionsDesPrestations: textes.descriptionsDesPrestations.map(un),
		nom: un(textes.nom),
		prenom: un(textes.prenom),
	} as unknown as TextesNormalises
}

/**
 * The words a profile must all match. Split on spaces only, so that an address with a dot or an
 * hyphen stays one word. A term of one word, or of words that are all dropped, is looked for as typed.
 */
export function motsDeLaRecherche(terme: string): string[] {
	const propre = sansAccents(terme).trim()
	if (propre === '') return []
	const saisis = propre.split(/\s+/).filter(Boolean)
	const mots = [...new Set(saisis)]
	const significatifs = mots.filter(mot => mot.length >= 3 && !MOTS_VIDES.has(mot) && !MOTS_DE_LA_DEMANDE.has(mot))
	return saisis.length > 1 && significatifs.length > 0 ? significatifs : [propre]
}

/** The values of one text of a profile (already normalised: `TextesNormalises`). */
const valeursDe = (textes: TextesDeRecherche, cle: CleDeTexte): string[] => {
	const valeur = textes[cle]
	return (Array.isArray(valeur) ? valeur : [valeur]).filter(v => typeof v === 'string' && v !== '')
}

interface ValeurIndexee {
	rang: number
	valeur: string
}

/** Fuse cuts a pattern longer than this in chunks; the prefilter below only reasons on a pattern in one piece. */
const LONGUEUR_MAX_D_UN_MORCEAU = 32

/**
 * The pieces of a word at least one of which must appear, whole, in a text the word matches. With `k`
 * typos allowed (`SEUIL`: one per 5 letters), cutting the word in `k + 1` pieces leaves one of them
 * untouched by the typos (pigeonhole), so a text that holds none of them cannot match. That lets a
 * plain `includes` reject most texts before the slow approximate match runs on the few that remain.
 * `null` when the word is too long to reason on (Fuse then reads all the texts).
 */
function morceauxDuMot(mot: string): string[] | null {
	if (mot.length > LONGUEUR_MAX_D_UN_MORCEAU) return null
	const fautes = Math.floor(SEUIL * mot.length + 1e-9)
	const morceaux: string[] = []
	for (let i = 0; i <= fautes; i += 1)
		morceaux.push(
			mot.slice(Math.floor((i * mot.length) / (fautes + 1)), Math.floor(((i + 1) * mot.length) / (fautes + 1)))
		)
	return morceaux.every(morceau => morceau !== '') ? morceaux : null
}

/** The values of every profile for each text. */
function valeursDesTextes(liste: readonly TextesNormalises[]): Record<CleDeTexte, string[][]> {
	const parCle = {} as Record<CleDeTexte, string[][]>
	for (const cle of CLES) parCle[cle] = liste.map(textes => valeursDe(textes, cle))
	return parCle
}

/**
 * The score of each profile a word matches in one text, by rank: the one Fuse gives, which is the
 * product of the scores of the values of that text that match (a value that holds the word whole is
 * an exact match, `Number.EPSILON`, and needs no search). Only the values that hold none of the pieces
 * of the word are left out of the approximate search, and the rest go to Fuse, one value at a time.
 */
function scoresDuMot(valeurs: readonly string[][], mot: string): Map<number, number> {
	const morceaux = morceauxDuMot(mot)
	const scores = new Map<number, number>()
	const approximatives: ValeurIndexee[] = []
	valeurs.forEach((textes, rang) => {
		let exacts = 0
		for (const valeur of textes) {
			if (valeur.includes(mot)) exacts += 1
			else if (morceaux === null || morceaux.some(morceau => valeur.includes(morceau)))
				approximatives.push({ rang, valeur })
		}
		if (exacts > 0) scores.set(rang, Number.EPSILON ** exacts)
	})
	if (approximatives.length === 0) return scores
	const fuse = new Fuse<ValeurIndexee>(approximatives, {
		keys: ['valeur'],
		threshold: SEUIL,
		// A word deep in a long description matches as well as at its start.
		ignoreLocation: true,
		includeScore: true,
		findAllMatches: true,
		ignoreFieldNorm: true,
	})
	for (const { item, score } of fuse.search(mot)) scores.set(item.rang, (scores.get(item.rang) ?? 1) * (score ?? 0))
	return scores
}

/** A profile the words found, with how well. */
export interface ProfilTrouve<T> {
	profil: T
	/** Lower is better; 0 would be an exact match of every word in every text. */
	score: number
}

/**
 * The profiles that match every word of `terme`, best first, with their score. The order of `profils`
 * breaks a tie. Nothing for a term without a word.
 */
export function classerParPertinence<T>(
	profils: readonly T[],
	textes: (profil: T) => TextesNormalises,
	terme: string
): ProfilTrouve<T>[] {
	const mots = motsDeLaRecherche(terme)
	if (mots.length === 0 || profils.length === 0) return []
	const valeurs = valeursDesTextes(profils.map(textes))
	const scores = new Array<number>(profils.length).fill(0)
	const motsTrouves = new Array<number>(profils.length).fill(0)

	for (const mot of mots) {
		const trouves = new Set<number>()
		for (const cle of CLES) {
			const touches = scoresDuMot(valeurs[cle], mot)
			for (let rang = 0; rang < profils.length; rang += 1) {
				const score = touches.get(rang)
				// A text that does not match pays its weight; one that does pays its (normalised) Fuse score.
				scores[rang] = (scores[rang] ?? 0) + (score === undefined ? POIDS[cle] : score / TOTAL_DES_POIDS)
				if (score !== undefined) trouves.add(rang)
			}
		}
		for (const rang of trouves) motsTrouves[rang] = (motsTrouves[rang] ?? 0) + 1
	}

	const trouves: { rang: number; score: number }[] = []
	for (let rang = 0; rang < profils.length; rang += 1)
		if (motsTrouves[rang] === mots.length) trouves.push({ rang, score: scores[rang] ?? 0 })
	trouves.sort((a, b) => a.score - b.score || a.rang - b.rang)
	return trouves.map(({ rang, score }) => ({ profil: profils[rang] as T, score }))
}
