/**
 * The availability of a makeup artist, as she sets it in her space (ticket 124; plan 02 E19-E29):
 * one boolean. A profile with no value stored (an imported one) counts as available, as on the old
 * site and as the public list does (`src/lib/profile/visibility.ts`).
 *
 * The server reads the strict schema: a key that is not `disponible`, or a value that is not a
 * boolean (a string « false » included), refuses the whole request.
 */

import { z } from 'zod'

export interface AvailabilityValues extends Record<string, unknown> {
	disponible: boolean
}

export const availabilitySchema = z.strictObject({ disponible: z.boolean() })

/** What is stored, read as the site reads it: only an explicit `false` is unavailable. */
export const isAvailable = (stocke: boolean | null | undefined): boolean => stocke !== false

export const AVAILABLE_TEXT = 'Disponible'
export const UNAVAILABLE_TEXT = 'Pas disponible en ce moment'
/** Said on her card while she is unavailable: what it costs her. */
export const OUT_OF_SEARCH_TEXT = 'Ton profil n’apparaît plus dans les résultats de recherche.'
