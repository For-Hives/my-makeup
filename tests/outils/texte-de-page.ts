import { createHash } from 'node:crypto'

/**
 * The plain text of a page, the way a reader meets it (ticket 112): scripts and styles dropped, a line
 * break at the end of each block and at each `<br>`, tags removed without adding a space, entities
 * decoded, spaces collapsed, one line per block. Two pages that say the same words in different
 * markup give the same text.
 */
const ENTITES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decoder(texte: string): string {
	return texte.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (brut, nom: string) => {
		if (nom.startsWith('#')) {
			const code = nom[1]?.toLowerCase() === 'x' ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : brut
		}
		return ENTITES[nom.toLowerCase()] ?? brut
	})
}

export function texteDePage(html: string): string {
	const sansCode = html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style|svg)\b[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<\/(p|li|h[1-6]|div|header|article|main|section|ul|ol)\s*>|<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
	return decoder(sansCode)
		.split('\n')
		.map(ligne => ligne.replace(/\s+/g, ' ').trim())
		.filter(ligne => ligne !== '')
		.join('\n')
}

export const empreinteDuTexte = (texte: string): string => createHash('sha256').update(texte).digest('hex')
