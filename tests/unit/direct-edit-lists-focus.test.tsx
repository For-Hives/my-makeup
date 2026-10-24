import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { benchOf } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Rule L4 on the options of a service (issue 1075): after a removal by a click or a tap the focus never goes to a
 * text field (it would open the keyboard of a phone); after a key it goes to the first field of the row.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const press = (button: Element, detail: 0 | 1) =>
	act(async () => {
		// A finger or a mouse presses first; Enter does not.
		if (detail === 1) button.dispatchEvent(new window_.w.MouseEvent('mousedown', { bubbles: true }))
		button.dispatchEvent(new window_.w.MouseEvent('click', { bubbles: true, detail }))
	})
const open = async () => {
	await benchOf(window_).mount()
	await window_.cliquer(window_.bouton('Modifier mes prestations'))
	await window_.cliquer(window_.bouton('Modifier la prestation Maquillage de la mariée'))
}

describe('L4 : le retrait d’une option', () => {
	test('au clavier, le focus va au premier champ de la ligne', async () => {
		await open()
		await press(window_.bouton('Retirer l’option Essai'), 0)
		expect(doc().activeElement?.tagName).toBe('INPUT')
	})

	test('au toucher, le focus va au titre, jamais à un champ', async () => {
		await open()
		await press(window_.bouton('Retirer l’option Essai'), 1)
		expect(doc().activeElement?.tagName).toBe('H3')
	})
})
