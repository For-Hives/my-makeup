import type { KeyboardEvent } from 'react'
import type { ValeursDeLigne } from '@/lib/dashboard/liste'

/** What the editors of a list share (tickets 129 to 132). */

export const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
export const BOUTON_DE_LIGNE = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-sm'
export const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/** A row of a list in the panel: `cle` is the key of its display and belongs to the row, never to what it says (L1, L2). */
export interface LigneEditee {
	readonly cle: string
	/** The identifier the server gave to the row; none for a row just added. */
	readonly id: string | null
	readonly valeurs: ValeursDeLigne
}

let compteurDeCles = 0
export const nouvelleCle = (): string => `ligne-${++compteurDeCles}`

/** Held down, Enter repeats: a button acts once (L7). */
export function ignorerLaRepetition(evenement: KeyboardEvent<HTMLElement>): void {
	if (evenement.key === 'Enter' && evenement.repeat) evenement.preventDefault()
}
