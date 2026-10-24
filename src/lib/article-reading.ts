/**
 * What the page of an article says about its own length (issue 1103): a reading time and, for a long
 * article only, a table of contents. Pure and without `next`, so the tests read it too.
 *
 * Nothing is invented: the minutes are counted on the words the newsroom wrote, and the table of
 * contents lists the titles that exist in the text.
 */

/** Words a reader goes through in a minute (French, on a screen). */
export const WORDS_PER_MINUTE = 220

/** A table of contents needs at least this many parts... */
export const OUTLINE_MIN_HEADINGS = 3
/** ...and an article at least this long, in minutes: a short text is read at once, an outline would only weigh on it. */
export const OUTLINE_MIN_MINUTES = 5

/** A title of an article, as the table of contents links it. */
export interface ArticleHeading {
	id: string
	text: string
	level: 2 | 3
}

/** The number of words of a text: a word has at least a letter or a digit, markdown signs do not count. */
export function countWords(markdown: unknown): number {
	if (typeof markdown !== 'string') return 0
	return markdown.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length
}

/** The minutes to read a markdown text, rounded up, or `null` when the text is empty (the page then says nothing). */
export function readingMinutes(markdown: unknown): number | null {
	const words = countWords(markdown)
	return words === 0 ? null : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/** The parts of the table of contents: the second-level titles of a long article, or none. */
export function outlineOf(headings: readonly ArticleHeading[], minutes: number | null): ArticleHeading[] {
	const parts = headings.filter(heading => heading.level === 2)
	return parts.length >= OUTLINE_MIN_HEADINGS && (minutes ?? 0) >= OUTLINE_MIN_MINUTES ? parts : []
}
