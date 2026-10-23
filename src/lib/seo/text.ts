/** Titles and descriptions (ticket 070, tests U44 and U45). */

export const BRAND = 'My-Makeup'
export const MAX_TITLE = 60
/** The shortest title of the page of a talent the newsroom writes (ticket 108): Bing asks for 50 to 60. */
export const TALENT_MIN_TITLE = 50
export const DESCRIPTION_MIN = 70
export const DESCRIPTION_MAX = 155

/** What a value says as plain text: never « null » or « undefined », which old code let through. */
export function textAbout(valeur: unknown): string {
	if (typeof valeur !== 'string' && typeof valeur !== 'number') return ''
	return String(valeur)
		.replace(/<[^>]*>/g, ' ')
		.replace(/[<>]/g, ' ')
		.split(/\s+/)
		.filter(mot => mot !== '' && mot !== 'null' && mot !== 'undefined')
		.join(' ')
}

/** Cut at a word boundary with an ellipsis, `max` characters at most. */
export function truncate(texte: string, max: number): string {
	if (texte.length <= max) return texte
	const cut = texte.slice(0, max - 1)
	const word = cut.replace(/\s+\S*$/, '')
	return `${(word.length >= max / 2 ? word : cut).replace(/[\s,;:.–-]+$/, '')}…`
}

/**
 * « <title> | My-Makeup » when it fits in 60 characters; the brand alone when the title is empty. With
 * `marque: false` the title is kept as written (a fixed page whose title on the old site had no brand).
 */
export function pageTitle(valeur: unknown, { marque = true }: { marque?: boolean } = {}): string {
	const title = textAbout(valeur) || BRAND
	if (title.includes(BRAND) || !marque) return truncate(title, MAX_TITLE)
	const full = `${title} | ${BRAND}`
	return full.length <= MAX_TITLE ? full : truncate(title, MAX_TITLE)
}

/** The first text of 70 characters or more, else the fallback; 155 characters at most, no HTML. */
export function descriptionMeta(candidats: unknown, repli: string): string {
	const list = Array.isArray(candidats) ? candidats : [candidats]
	const text = list.map(textAbout).find(candidat => candidat.length >= DESCRIPTION_MIN)
	return truncate(text ?? textAbout(repli), DESCRIPTION_MAX)
}

/** Markdown or HTML reduced to plain text, for a description. */
export function plainText(valeur: unknown): string {
	if (typeof valeur !== 'string') return ''
	return textAbout(
		valeur
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/<[^>]*>/g, ' ')
			.replace(/[#*_>`~|]+/g, ' ')
	)
}

/**
 * The description of a page the newsroom writes (a talent, an article), ticket 106: the text it wrote for
 * the search engines is kept as it is, even under 70 characters (cut at 155), as on the site online. Only
 * when it wrote none does the first text of 70 characters or more of `autres` serve (markdown reduced to
 * plain text), then the fallback.
 */
export function editorialDescription(redigee: unknown, autres: readonly unknown[], repli: string): string {
	const text = plainText(redigee)
	if (text) return truncate(text, DESCRIPTION_MAX)
	return descriptionMeta(autres.map(plainText), repli)
}
