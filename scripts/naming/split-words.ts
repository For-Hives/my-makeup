/**
 * Splits a name into lowercase words: camelCase, PascalCase, `-`, `_`, `.`, digits and any other
 * separator. Accents are removed, as in the word list.
 *
 *   splitName('lireLeProfilPublic')   -> ['lire', 'le', 'profil', 'public']
 *   splitName('HTTPServer2')          -> ['http', 'server']
 *   splitName('a-propos')             -> ['a', 'propos']
 */
export function splitName(name: string): string[] {
	return name
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/[^A-Za-z]+/)
		.filter(word => word.length > 0)
		.map(word => word.toLowerCase())
}

/** The words of a name that the list knows as French, in the order of the name, without duplicates. */
export function frenchWordsOf(name: string, words: ReadonlySet<string>): string[] {
	return [...new Set(splitName(name).filter(word => words.has(word)))]
}

/** Reads a word list: one word per line or several per line, `#` starts a comment. */
export function parseWordList(text: string): Set<string> {
	const words = new Set<string>()
	for (const line of text.split('\n')) {
		for (const word of line.replace(/#.*/, '').split(/\s+/)) {
			if (word) words.add(word.toLowerCase())
		}
	}
	return words
}
