/**
 * The name a public page gives a makeup artist: the only h1 of her page, and later the titles of
 * the page and of her card (plan 01 §3.5).
 *
 * Ported as is from src/lib/profil/vue-publique.js of the old site (branch main, `texte`,
 * `fullName`, `displayName`), under the names of the fields of the v3: first and last name, else
 * the artist name, else a neutral label. Never « undefined » nor « null », whatever was saved.
 *
 * No server code here: the makeup artist's space shows the same name in the browser.
 */

/** What the name is read from: the fields of a profile of the v3. */
export interface ProfileNames {
	readonly firstName?: string | null
	readonly lastName?: string | null
	readonly artistName?: string | null
}

/** The name shown when the profile gives none. */
export const NEUTRAL_NAME = 'Maquilleuse professionnelle'

const STOP_WORDS = new Set(['null', 'undefined'])

/** Trimmed text; '' for anything else, and for the words « null » and « undefined ». */
export function text(valeur: unknown): string {
	if (typeof valeur !== 'string') return ''
	const trimmed = valeur.trim()
	return STOP_WORDS.has(trimmed.toLowerCase()) ? '' : trimmed
}

/** « Prénom Nom », with whichever of the two is filled; '' when neither is. */
export function fullName(profil: ProfileNames): string {
	return [text(profil.firstName), text(profil.lastName)].filter(Boolean).join(' ')
}

/** The name of the h1: the full name, else the artist name, else the neutral label. */
export function displayName(profil: ProfileNames): string {
	return fullName(profil) || text(profil.artistName) || NEUTRAL_NAME
}
