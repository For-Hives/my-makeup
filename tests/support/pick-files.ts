import { act } from 'react'
import type { DomWindow } from './dom-react'

/**
 * Picks files in a file field, as the file dialog does: the field holds them, then fires `change`.
 * jsdom has no dialog, and a field's `files` can only be given by redefining it.
 */
export async function pickFiles(fenetre: DomWindow, champ: Element, fichiers: File[]): Promise<void> {
	await act(async () => {
		Object.defineProperty(champ, 'files', { configurable: true, value: fichiers })
		champ.dispatchEvent(new fenetre.w.Event('change', { bubbles: true }))
	})
}
