/**
 * The name a public page gives a makeup artist: the only h1 of her page, and later the titles of
 * the page and of her card (plan 01 §3.5).
 *
 * Ported as is from src/lib/profil/vue-publique.js of the old site (branch main, `texte`,
 * `nomComplet`, `nomAffiche`), under the names of the fields of the v3: first and last name, else
 * the artist name, else a neutral label. Never « undefined » nor « null », whatever was saved.
 *
 * No server code here: the makeup artist's space shows the same name in the browser.
 */

/** What the name is read from: the fields of a profile of the v3. */
export interface NomsDuProfil {
	readonly prenom?: string | null
	readonly nom?: string | null
	readonly nomArtiste?: string | null
}

/** The name shown when the profile gives none. */
export const NOM_NEUTRE = 'Maquilleuse professionnelle'

const MOTS_VIDES = new Set(['null', 'undefined'])

/** Trimmed text; '' for anything else, and for the words « null » and « undefined ». */
export function texte(valeur: unknown): string {
	if (typeof valeur !== 'string') return ''
	const rogne = valeur.trim()
	return MOTS_VIDES.has(rogne.toLowerCase()) ? '' : rogne
}

/** « Prénom Nom », with whichever of the two is filled; '' when neither is. */
export function nomComplet(profil: NomsDuProfil): string {
	return [texte(profil.prenom), texte(profil.nom)].filter(Boolean).join(' ')
}

/** The name of the h1: the full name, else the artist name, else the neutral label. */
export function nomAffiche(profil: NomsDuProfil): string {
	return nomComplet(profil) || texte(profil.nomArtiste) || NOM_NEUTRE
}
