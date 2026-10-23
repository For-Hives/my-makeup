/**
 * Reads the pieces of a zone typed on the old site: the countries it names and the places left
 * once the countries are taken out (plans/PLAN-ZONES.md §3.5; ticket 261).
 *
 * - The text is cut at `, ; / & +` and `|`, at « et », at a dash between spaces, and at a dash
 *   glued between two words (« Bruxelles-Belgique »).
 * - The longest country names are recognised first, over the whole text: « Pays-Bas »,
 *   « Royaume-Uni », « Antigua-et-Barbuda » or « Bosnie-Herzégovine » are never cut, whatever
 *   separator they hold.
 * - What is not a country stays whole: a run of words and dashes that names no country is one
 *   place (« Saint-Denis », « Aix-en-Provence »), never chopped at its own dashes.
 *
 * Pure: it reads a text, it never decides what the zone is (./cities.ts does).
 */

import { countryByName } from '../../../src/lib/countries'

/** One piece of a zone text: a country of the list (by its code), or a place no country names. */
export type ZonePiece = { kind: 'country'; code: string } | { kind: 'place'; text: string }

/** A stretch of the text, by its position. */
interface Span {
	start: number
	end: number
}

/** The separators that always cut: punctuation, « et », and a dash with spaces around it. */
const STRONG_SEPARATOR = /\s*[,;/&+|]\s*|\s+et\s+|\s+[-–—]\s+/giu

/** A dash glued between two words. */
const GLUED_DASH = /(?<=\S)[-–—](?=\S)/gu

/** The stretches between the matches of a separator, empty ones left out. */
function stretches(text: string, within: Span, separator: RegExp): Span[] {
	const spans: Span[] = []
	let start = within.start
	const slice = text.slice(within.start, within.end)
	for (const found of slice.matchAll(separator)) {
		const end = within.start + (found.index ?? 0)
		if (end > start) spans.push({ start, end })
		start = end + found[0].length
	}
	if (within.end > start) spans.push({ start, end: within.end })
	return spans
}

/**
 * The pieces of some stretches, the longest country name first: from each stretch, the most
 * stretches that together spell a country (separators included, as the text holds them), else the
 * stretch alone.
 */
function matched(text: string, spans: readonly Span[]): { span: Span; code: string | null }[] {
	const out: { span: Span; code: string | null }[] = []
	for (let first = 0; first < spans.length; ) {
		let last = spans.length - 1
		let code: string | null = null
		for (; last >= first; last--) {
			const start = spans[first]?.start ?? 0
			const end = spans[last]?.end ?? 0
			code = countryByName(text.slice(start, end).trim())?.code ?? null
			if (code !== null) break
		}
		if (code === null) {
			out.push({ span: spans[first] as Span, code: null })
			first++
		} else {
			out.push({ span: { start: spans[first]?.start ?? 0, end: spans[last]?.end ?? 0 }, code })
			first = last + 1
		}
	}
	return out
}

/** Adds a piece, merging a place with the place that comes right before it (their dash is theirs). */
function pushPlace(pieces: ZonePiece[], text: string, merge: boolean): void {
	const last = pieces.at(-1)
	if (merge && last?.kind === 'place') last.text = `${last.text}-${text}`
	else pieces.push({ kind: 'place', text })
}

/** The pieces of a zone text, in the order of the text. An empty text gives none. */
export function readZonePieces(text: string): ZonePiece[] {
	const whole: Span = { start: 0, end: text.length }
	const pieces: ZonePiece[] = []
	for (const segment of matched(text, stretches(text, whole, STRONG_SEPARATOR))) {
		if (segment.code !== null) {
			pieces.push({ kind: 'country', code: segment.code })
			continue
		}
		const parts = stretches(text, segment.span, GLUED_DASH)
		// A place with its own dashes is one place; only a country glued to it cuts it.
		let previousWasPlace = false
		for (const part of matched(text, parts)) {
			const piece = text.slice(part.span.start, part.span.end).trim()
			if (part.code !== null) {
				pieces.push({ kind: 'country', code: part.code })
				previousWasPlace = false
			} else if (piece !== '') {
				pushPlace(pieces, piece, previousWasPlace)
				previousWasPlace = true
			}
		}
	}
	return pieces
}

/**
 * The regions of France, current and former, and the overseas ones: a place that is one of them is
 * no town abroad (« Suisse et Bretagne »). The départements are read from src/lib/departments.ts.
 */
export const FRENCH_REGIONS: readonly string[] = [
	'Auvergne-Rhône-Alpes',
	'Bourgogne-Franche-Comté',
	'Bretagne',
	'Centre-Val de Loire',
	'Corse',
	'Grand Est',
	'Hauts-de-France',
	'Île-de-France',
	'Normandie',
	'Nouvelle-Aquitaine',
	'Occitanie',
	'Pays de la Loire',
	'Provence-Alpes-Côte d’Azur',
	'PACA',
	'Guadeloupe',
	'Martinique',
	'Guyane',
	'La Réunion',
	'Mayotte',
	'Alsace',
	'Aquitaine',
	'Auvergne',
	'Basse-Normandie',
	'Bourgogne',
	'Champagne-Ardenne',
	'Franche-Comté',
	'Haute-Normandie',
	'Languedoc-Roussillon',
	'Limousin',
	'Lorraine',
	'Midi-Pyrénées',
	'Nord-Pas-de-Calais',
	'Picardie',
	'Poitou-Charentes',
	'Rhône-Alpes',
]
