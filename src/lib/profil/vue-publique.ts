/**
 * What a public profile page shows, computed from the profile as the public reading gives it
 * (plan 01 §3.2 UI-06): ported from src/lib/profil/vue-publique.js of the old site (branch main),
 * under the field names of the v3. Pure functions, no server code: the page and the tests call them.
 *
 * - No « undefined », « null » nor « Invalid Date » whatever was saved: a text goes through `texte`
 *   (src/lib/profil/nom-affiche.ts), which empties the words « null » and « undefined ».
 * - A section with nothing to show is not shown.
 */

import { type NomsDuProfil, nomComplet, texte } from './nom-affiche'

/**
 * The line under the name, when the profile has an artist name of its own: shown only if it differs
 * from the name of the h1 and the profile has a full name (else the artist name is the h1 already).
 * `null` otherwise.
 */
export function nomDArtisteAffiche(profil: NomsDuProfil, nomDuTitre: string): string | null {
	const nomArtiste = texte(profil.nomArtiste)
	return nomArtiste !== '' && nomArtiste !== nomDuTitre && nomComplet(profil) !== '' ? nomArtiste : null
}

/**
 * The non-empty lines of a text typed with line breaks, each one trimmed: a line « null » or
 * « undefined » is empty too. A description is shown one paragraph per line typed.
 */
export function lignes(valeur: unknown): string[] {
	return typeof valeur === 'string' ? valeur.split('\n').flatMap(ligne => texte(ligne) || []) : []
}
