import { createHash } from 'node:crypto'
import { stripMarkup } from '../../src/lib/html/strip-markup'

/**
 * The plain text of a page, the way a reader meets it (ticket 112): scripts and styles dropped, a line
 * break at the end of each block and at each `<br>`, tags removed without adding a space, entities
 * decoded, spaces collapsed, one line per block. Two pages that say the same words in different
 * markup give the same text.
 */
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decoder(texte: string): string {
	return texte.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (brut, nom: string) => {
		if (nom.startsWith('#')) {
			const code = nom[1]?.toLowerCase() === 'x' ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : brut
		}
		return ENTITIES[nom.toLowerCase()] ?? brut
	})
}

export function pageText(html: string): string {
	const withoutCode = stripMarkup(html, { dropContentOf: ['script', 'style', 'svg'], lineBreaks: true })
	return decoder(withoutCode)
		.split('\n')
		.map(ligne => ligne.replace(/\s+/g, ' ').trim())
		.filter(ligne => ligne !== '')
		.join('\n')
}

export const textFingerprint = (texte: string): string => createHash('sha256').update(texte).digest('hex')
