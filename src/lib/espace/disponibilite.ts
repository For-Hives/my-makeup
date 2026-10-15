/**
 * The availability of a makeup artist, as she sets it in her space (ticket 124; plan 02 E19-E29):
 * one boolean. A profile with no value stored (an imported one) counts as available, as on the old
 * site and as the public list does (`src/lib/profil/visibilite.ts`).
 *
 * The server reads the strict schema: a key that is not `disponible`, or a value that is not a
 * boolean (a string « false » included), refuses the whole request.
 */

import { z } from 'zod'

export interface ValeursDeLaDisponibilite extends Record<string, unknown> {
	disponible: boolean
}

export const schemaDeLaDisponibilite = z.strictObject({ disponible: z.boolean() })

/** What is stored, read as the site reads it: only an explicit `false` is unavailable. */
export const estDisponible = (stocke: boolean | null | undefined): boolean => stocke !== false

export const TEXTE_DISPONIBLE = 'Disponible'
export const TEXTE_INDISPONIBLE = 'Pas disponible en ce moment'
/** Said on her card while she is unavailable: what it costs her. */
export const TEXTE_HORS_RECHERCHE = 'Ton profil n’apparaît plus dans les résultats de recherche.'
