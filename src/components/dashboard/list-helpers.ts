import type { KeyboardEvent } from 'react'
import type { RowValues } from '@/lib/dashboard/list'

/** What the editors of a list share (tickets 129 to 132). */

export const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
export const ROW_BUTTON = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-sm'
export const FIELD = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/** A row of a list in the panel: `cle` is the key of its display and belongs to the row, never to what it says (L1, L2). */
export interface EditedRow {
	readonly cle: string
	/** The identifier the server gave to the row; none for a row just added. */
	readonly id: string | null
	readonly valeurs: RowValues
}

let keysCounter = 0
export const newKey = (): string => `ligne-${++keysCounter}`

/** Held down, Enter repeats: a button acts once (L7). */
export function ignoreRepeat(evenement: KeyboardEvent<HTMLElement>): void {
	if (evenement.key === 'Enter' && evenement.repeat) evenement.preventDefault()
}
