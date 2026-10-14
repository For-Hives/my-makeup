import { expect, test } from 'bun:test'
import { MODULES_QUI_SONDENT_LE_DOM } from '../outils/precharge-react-dom'

// A test file that opens no window: the test of a pure function. The component bench must cost
// it nothing but the preload, and leave it the globals of bun, without a browser.

test('a test file that opens no window has no browser global', () => {
	for (const nom of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) {
		expect(nom in globalThis, nom).toBe(false)
	}
	expect(navigator.userAgent).toStartWith('Bun/')
})

test('the libraries that look for a browser were loaded by the preload', () => {
	expect([...MODULES_QUI_SONDENT_LE_DOM]).toEqual(['react-dom/client', 'react-hook-form'])
	for (const nom of MODULES_QUI_SONDENT_LE_DOM) {
		expect(Bun.resolveSync(nom, import.meta.dir) in require.cache, nom).toBe(true)
	}
})
