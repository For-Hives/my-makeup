/**
 * Globals lent for a while, then given back exactly as they were.
 *
 * A browser global (`window`, `document`…) exists in a test only between the moment a jsdom
 * window is opened and the moment it is given back. bun runs every test file of a run in one
 * process: a global left behind by one file would be found by the next one.
 */

/** Sets each value on `globalThis` under its name, and returns what puts everything back. */
export function setGlobals(valeurs: Readonly<Record<string, unknown>>): () => void {
	const before = Object.keys(valeurs).map(nom => [nom, Object.getOwnPropertyDescriptor(globalThis, nom)] as const)
	for (const [name, value] of Object.entries(valeurs)) {
		Object.defineProperty(globalThis, name, { configurable: true, value: value, writable: true })
	}
	return () => {
		for (const [name, descripteur] of before) {
			if (descripteur) Object.defineProperty(globalThis, name, descripteur)
			else Reflect.deleteProperty(globalThis, name)
		}
	}
}
