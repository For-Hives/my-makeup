/**
 * The French elision of « de » before a first name (tickets 290 and 304): « d’Inès », « d’Hélène »,
 * « de Léa ». The apostrophe is the typographic one, as in the rest of the texts of the site.
 *
 * The rule looks at the first letter of the name, accents removed:
 * - a vowel elides (« d’Inès », « d’Océane », « d’Éloïse »), and so does the ligature « œ » ;
 * - a silent « h » elides (« d’Hélène »), an aspirated one does not (« de Hugo ») : the few first names
 *   that are known to be aspirated are listed below, any other « h » is taken as silent ;
 * - « y » elides before a consonant (« d’Yvonne », « d’Yves ») and not before a vowel (« de Yasmine »,
 *   « de Yann »), where it is a consonant ;
 * - a compound name is read on its first part (« d’Anne-Laure », « de Jean-Pierre »).
 */

const ACCENTS = /\p{Diacritic}/gu
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'œ', 'æ'])
const ASPIRATED_H = new Set(['hugo', 'hans', 'harold'])
const FIRST_PART = /^[^\s-]+/

/** The first part of a name, lowercase, without accents. */
function firstPart(name: string): string {
	const part = FIRST_PART.exec(name.trim())?.[0] ?? ''
	return part.normalize('NFD').replace(ACCENTS, '').toLowerCase()
}

/** True when « de » loses its « e » before this name. */
export function elidesBefore(name: string): boolean {
	const part = firstPart(name)
	const [first, second] = part
	if (first === undefined) return false
	if (VOWELS.has(first)) return true
	if (first === 'h') return !ASPIRATED_H.has(part)
	if (first === 'y') return second !== undefined && !VOWELS.has(second) && second !== 'y'
	return false
}

/**
 * « de » and the name, elided when the rule says so: `ofName('Inès')` is « d’Inès », `ofName('Léa')` is
 * « de Léa ». An empty name gives an empty text.
 */
export function ofName(name: string): string {
	const trimmed = name.trim()
	if (trimmed === '') return ''
	return elidesBefore(trimmed) ? `d’${trimmed}` : `de ${trimmed}`
}
