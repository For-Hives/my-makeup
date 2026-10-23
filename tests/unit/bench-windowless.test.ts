import { expect, test } from 'bun:test'
import { MODULES_PROBE_DOM } from '../support/preload-react-dom'

// A test file that opens no window: the test of a pure function. The component bench must cost
// it nothing but the preload, and leave it the globals of bun, without a browser.

test('a test file that opens no window has no browser global', () => {
	for (const name of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) {
		expect(name in globalThis, name).toBe(false)
	}
	expect(navigator.userAgent).toStartWith('Bun/')
})

test('the libraries that look for a browser were loaded by the preload', () => {
	expect([...MODULES_PROBE_DOM]).toEqual(['react-dom/client', 'react-hook-form'])
	for (const name of MODULES_PROBE_DOM) {
		expect(Bun.resolveSync(name, import.meta.dir) in require.cache, name).toBe(true)
	}
})
