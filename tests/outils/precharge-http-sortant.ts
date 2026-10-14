import { afterAll, afterEach } from 'bun:test'
import { demarrerHttpSortant, exigerAucunRefus, oublierLesSimulations } from './http-sortant'

/**
 * No test calls the Internet (tests/outils/http-sortant.ts).
 *
 * bun loads this file before any test file (bunfig.toml, `[test] preload`). It starts the
 * interception of outgoing HTTP for the whole run, then declares two hooks that apply to every
 * test file:
 *  - after each test, the declarations of that test are forgotten, and the test fails if it made
 *    a request nothing simulated. The request was already refused when it was made; this verdict
 *    is for the code that catches the error and carries on;
 *  - after the last test of the run, the same verdict for a request made outside a test: in an
 *    `afterAll`, or by a promise nobody awaited.
 * A request made while a file loads, or in a `beforeAll`, fails the first test that follows.
 *
 * Every run pays for this file: MSW is loaded and a local server is opened, about 80 ms.
 * Nothing is read from the environment; six proxy variables are set for this process.
 */
await demarrerHttpSortant()

afterEach(() => {
	oublierLesSimulations()
	exigerAucunRefus(' pendant ce test, ou juste avant lui')
})

afterAll(() => {
	exigerAucunRefus(' après le dernier test')
})
