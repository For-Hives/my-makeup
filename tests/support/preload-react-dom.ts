import { JSDOM } from 'jsdom'
import { setGlobals } from './globals'

/**
 * A window, lent to the libraries that look for a browser while they load.
 *
 * bun runs every test file of a run in one process, and a module is evaluated once. Some
 * libraries look for a DOM at that very moment and keep the answer for the whole process:
 *  - `react-dom/client` (`canUseDOM`): loaded without a window, React behaves as in a browser
 *    that has no `input` event, and no test can type in a field any more (`onChange` does not fire);
 *  - `react-hook-form` (`isWeb`): loaded without a window, it takes every field for a detached
 *    one, and `reset()` leaves the native form alone.
 * Which file loads them first depends on the order of the run, so the failure moves with it.
 *
 * bun loads this file before any test file (bunfig.toml, `[test] preload`). The libraries listed
 * below are loaded here, once, inside a jsdom window that is given back at once: the globals are
 * left as they were, and a test file that opens no window still has none
 * (tests/unit/bench-windowless.test.ts). A test file that needs one opens it with
 * `ouvrirFenetre()` (tests/support/dom-react.ts).
 *
 * A library that reads `window` or `document` when it loads is added to the list below, and
 * nowhere else. Every run pays for this file, pure functions included: about half a second,
 * nearly all of it to load jsdom. Nothing is read from the environment, nothing from the network.
 */
export const MODULES_PROBE_DOM = ['react-dom/client', 'react-hook-form'] as const

/**
 * A listed library that bun already knows was imported by a file that came before this one: it
 * has loaded, or is about to load, without a window. The bench would look fine and fail later,
 * somewhere else. Stopping here names the cause.
 */
for (const name of MODULES_PROBE_DOM) {
	if (Bun.resolveSync(name, import.meta.dir) in require.cache) {
		throw new Error(
			`Banc de composants : le préchargement doit passer avant « ${name} », qui cherche un navigateur dès son chargement. ` +
				'Lance les tests depuis la racine du dépôt : bunfig.toml y charge tests/support/preload-react-dom.ts avant tout fichier de test.'
		)
	}
}

const dom = new JSDOM('<!doctype html><html lang="fr"><body></body></html>', { url: 'http://localhost/' })
const renderGlobals = setGlobals({ document: dom.window.document, window: dom.window })
try {
	for (const name of MODULES_PROBE_DOM) await import(name)
} finally {
	renderGlobals()
	dom.window.close()
}
