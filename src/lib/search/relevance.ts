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
 * (src/lib/search/place.ts), and never adds a profile the words did not find.
 *
 * The text typed stays in memory: nothing here logs it, measures it or builds a key from it.
 * No `next` import: read by the page and by the tests.
 */

import Fuse from 'fuse.js'

/** The texts of a profile the words are looked for in. */
export interface SearchTexts {
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

type TextKey = keyof SearchTexts

/** What a text weighs when a word does not match it, before the weights are normalised. */
const RAW_WEIGHTS: Readonly<Record<TextKey, number>> = {
	ville: 3,
	specialite: 2,
	description: 1.5,
	descriptionsDesCompetences: 1,
	descriptionsDesPrestations: 1,
	competences: 0.9,
	nom: 0.5,
	prenom: 0.5,
}

const KEYS = Object.keys(RAW_WEIGHTS) as TextKey[]
const TOTAL_WEIGHT = KEYS.reduce((somme, cle) => somme + RAW_WEIGHTS[cle], 0)

/** The weights, normalised: they sum to 1. */
export const WEIGHTS: Readonly<Record<TextKey, number>> = Object.fromEntries(
	KEYS.map(cle => [cle, RAW_WEIGHTS[cle] / TOTAL_WEIGHT])
) as Record<TextKey, number>

/** The worst score of a match Fuse keeps: 0.2 is one typo per 5 letters, and none under that. */
export const THRESHOLD = 0.2

/** Small words of the language: they say nothing of what is looked for. */
const STOP_WORDS = new Set([
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
const QUERY_WORDS = new Set([
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
export function withoutAccents(texte: string): string {
	return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

declare const normalized: unique symbol

/**
 * The texts of a profile once normalised (no accent, lower case). The directory is normalised when it is
 * read, once an hour, so that a search does not do it again for every profile: `rankByRelevance`
 * takes nothing else.
 */
export type NormalizedTexts = SearchTexts & { readonly [normalized]: true }

/** The texts of a profile, normalised. */
export function normalizeTexts(textes: SearchTexts): NormalizedTexts {
	const one = (texte: string): string => withoutAccents(texte)
	return {
		ville: one(textes.ville),
		specialite: one(textes.specialite),
		description: one(textes.description),
		competences: textes.competences.map(one),
		descriptionsDesCompetences: textes.descriptionsDesCompetences.map(one),
		descriptionsDesPrestations: textes.descriptionsDesPrestations.map(one),
		nom: one(textes.nom),
		prenom: one(textes.prenom),
	} as unknown as NormalizedTexts
}

/**
 * The words a profile must all match. Split on spaces only, so that an address with a dot or an
 * hyphen stays one word. A term of one word, or of words that are all dropped, is looked for as typed.
 */
export function searchWords(terme: string): string[] {
	const clean = withoutAccents(terme).trim()
	if (clean === '') return []
	const typed = clean.split(/\s+/).filter(Boolean)
	const words = [...new Set(typed)]
	const significant = words.filter(mot => mot.length >= 3 && !STOP_WORDS.has(mot) && !QUERY_WORDS.has(mot))
	return typed.length > 1 && significant.length > 0 ? significant : [clean]
}

/** The values of one text of a profile (already normalised: `NormalizedTexts`). */
const valuesOf = (textes: SearchTexts, cle: TextKey): string[] => {
	const value = textes[cle]
	return (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'string' && v !== '')
}

interface IndexedValue {
	rang: number
	valeur: string
}

/** Fuse cuts a pattern longer than this in chunks; the prefilter below only reasons on a pattern in one piece. */
const CHUNK_MAX_LENGTH = 32

/**
 * The pieces of a word at least one of which must appear, whole, in a text the word matches. With `k`
 * typos allowed (`SEUIL`: one per 5 letters), cutting the word in `k + 1` pieces leaves one of them
 * untouched by the typos (pigeonhole), so a text that holds none of them cannot match. That lets a
 * plain `includes` reject most texts before the slow approximate match runs on the few that remain.
 * `null` when the word is too long to reason on (Fuse then reads all the texts).
 */
function wordChunks(mot: string): string[] | null {
	if (mot.length > CHUNK_MAX_LENGTH) return null
	const typos = Math.floor(THRESHOLD * mot.length + 1e-9)
	const chunks: string[] = []
	for (let i = 0; i <= typos; i += 1)
		chunks.push(mot.slice(Math.floor((i * mot.length) / (typos + 1)), Math.floor(((i + 1) * mot.length) / (typos + 1))))
	return chunks.every(morceau => morceau !== '') ? chunks : null
}

/** The values of every profile for each text. */
function textValues(liste: readonly NormalizedTexts[]): Record<TextKey, string[][]> {
	const byKey = {} as Record<TextKey, string[][]>
	for (const key of KEYS) byKey[key] = liste.map(textes => valuesOf(textes, key))
	return byKey
}

/**
 * The score of each profile a word matches in one text, by rank: the one Fuse gives, which is the
 * product of the scores of the values of that text that match (a value that holds the word whole is
 * an exact match, `Number.EPSILON`, and needs no search). Only the values that hold none of the pieces
 * of the word are left out of the approximate search, and the rest go to Fuse, one value at a time.
 */
function wordScores(valeurs: readonly string[][], mot: string): Map<number, number> {
	const chunks = wordChunks(mot)
	const scores = new Map<number, number>()
	const approximate: IndexedValue[] = []
	valeurs.forEach((textes, rang) => {
		let exacts = 0
		for (const value of textes) {
			if (value.includes(mot)) exacts += 1
			else if (chunks === null || chunks.some(morceau => value.includes(morceau)))
				approximate.push({ rang, valeur: value })
		}
		if (exacts > 0) scores.set(rang, Number.EPSILON ** exacts)
	})
	if (approximate.length === 0) return scores
	const fuse = new Fuse<IndexedValue>(approximate, {
		keys: ['valeur'],
		threshold: THRESHOLD,
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
export interface FoundProfile<T> {
	profil: T
	/** Lower is better; 0 would be an exact match of every word in every text. */
	score: number
}

/**
 * The profiles that match every word of `terme`, best first, with their score. The order of `profils`
 * breaks a tie. Nothing for a term without a word.
 */
export function rankByRelevance<T>(
	profils: readonly T[],
	textes: (profil: T) => NormalizedTexts,
	terme: string
): FoundProfile<T>[] {
	const words = searchWords(terme)
	if (words.length === 0 || profils.length === 0) return []
	const values = textValues(profils.map(textes))
	const scores = new Array<number>(profils.length).fill(0)
	const foundWords = new Array<number>(profils.length).fill(0)

	for (const word of words) {
		const found = new Set<number>()
		for (const key of KEYS) {
			const hits = wordScores(values[key], word)
			for (let rank = 0; rank < profils.length; rank += 1) {
				const score = hits.get(rank)
				// A text that does not match pays its weight; one that does pays its (normalised) Fuse score.
				scores[rank] = (scores[rank] ?? 0) + (score === undefined ? WEIGHTS[key] : score / TOTAL_WEIGHT)
				if (score !== undefined) found.add(rank)
			}
		}
		for (const rank of found) foundWords[rank] = (foundWords[rank] ?? 0) + 1
	}

	const found: { rang: number; score: number }[] = []
	for (let rank = 0; rank < profils.length; rank += 1)
		if (foundWords[rank] === words.length) found.push({ rang: rank, score: scores[rank] ?? 0 })
	found.sort((a, b) => a.score - b.score || a.rang - b.rang)
	return found.map(({ rang: rank, score }) => ({ profil: profils[rank] as T, score }))
}
