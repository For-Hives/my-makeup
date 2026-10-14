/**
 * Globals lent for a while, then given back exactly as they were.
 *
 * A browser global (`window`, `document`…) exists in a test only between the moment a jsdom
 * window is opened and the moment it is given back. bun runs every test file of a run in one
 * process: a global left behind by one file would be found by the next one.
 */

/** Sets each value on `globalThis` under its name, and returns what puts everything back. */
export function poserGlobaux(valeurs: Readonly<Record<string, unknown>>): () => void {
	const avant = Object.keys(valeurs).map(nom => [nom, Object.getOwnPropertyDescriptor(globalThis, nom)] as const)
	for (const [nom, valeur] of Object.entries(valeurs)) {
		Object.defineProperty(globalThis, nom, { configurable: true, value: valeur, writable: true })
	}
	return () => {
		for (const [nom, descripteur] of avant) {
			if (descripteur) Object.defineProperty(globalThis, nom, descripteur)
			else Reflect.deleteProperty(globalThis, nom)
		}
	}
}
