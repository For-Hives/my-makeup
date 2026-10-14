/** Titles and descriptions (ticket 070, tests U44 and U45). */

export const MARQUE = 'My-Makeup'
export const TITRE_MAX = 60
export const DESCRIPTION_MIN = 70
export const DESCRIPTION_MAX = 155

/** What a value says as plain text: never « null » or « undefined », which old code let through. */
export function texteSur(valeur: unknown): string {
	if (typeof valeur !== 'string' && typeof valeur !== 'number') return ''
	return String(valeur)
		.replace(/<[^>]*>/g, ' ')
		.replace(/[<>]/g, ' ')
		.split(/\s+/)
		.filter(mot => mot !== '' && mot !== 'null' && mot !== 'undefined')
		.join(' ')
}

/** Cut at a word boundary with an ellipsis, `max` characters at most. */
export function tronquer(texte: string, max: number): string {
	if (texte.length <= max) return texte
	const coupe = texte.slice(0, max - 1)
	const mot = coupe.replace(/\s+\S*$/, '')
	return `${(mot.length >= max / 2 ? mot : coupe).replace(/[\s,;:.–-]+$/, '')}…`
}

/** « <title> | My-Makeup » when it fits in 60 characters; the brand alone when the title is empty. */
export function titrePage(valeur: unknown): string {
	const titre = texteSur(valeur) || MARQUE
	if (titre.includes(MARQUE)) return tronquer(titre, TITRE_MAX)
	const complet = `${titre} | ${MARQUE}`
	return complet.length <= TITRE_MAX ? complet : tronquer(titre, TITRE_MAX)
}

/** The first text of 70 characters or more, else the fallback; 155 characters at most, no HTML. */
export function descriptionMeta(candidats: unknown, repli: string): string {
	const liste = Array.isArray(candidats) ? candidats : [candidats]
	const texte = liste.map(texteSur).find(candidat => candidat.length >= DESCRIPTION_MIN)
	return tronquer(texte ?? texteSur(repli), DESCRIPTION_MAX)
}
