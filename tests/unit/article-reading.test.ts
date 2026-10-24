import { describe, expect, test } from 'bun:test'
import { type ArticleHeading, countWords, outlineOf, readingMinutes } from '@/lib/article-reading'

/** The reading time and the table of contents of an article (issue 1103): counted on the text, never invented. */

const heading = (id: string, level: 2 | 3 = 2): ArticleHeading => ({ id, text: id, level })
const words = (count: number) => Array.from({ length: count }, () => 'mot').join(' ')

describe('countWords', () => {
	test('les signes du markdown ne sont pas des mots', () => {
		expect(countWords('## Un titre\n\n- une **liste** de choses\n\n---\n\n> citation')).toBe(7)
	})
	test('un texte absent ou vide n’a aucun mot', () => {
		expect(countWords(null)).toBe(0)
		expect(countWords(undefined)).toBe(0)
		expect(countWords('  \n ')).toBe(0)
	})
})

describe('readingMinutes', () => {
	test('arrondi vers le haut, une minute au moins', () => {
		expect(readingMinutes(words(1))).toBe(1)
		expect(readingMinutes(words(220))).toBe(1)
		expect(readingMinutes(words(221))).toBe(2)
		expect(readingMinutes(words(1100))).toBe(5)
	})
	test('sans texte, le temps de lecture n’existe pas', () => {
		expect(readingMinutes('')).toBeNull()
		expect(readingMinutes(null)).toBeNull()
	})
})

describe('outlineOf', () => {
	const three = [heading('a'), heading('b'), heading('c')]
	test('un article long avec au moins trois parties a son sommaire', () => {
		expect(outlineOf(three, 5)).toEqual(three)
	})
	test('un article court n’en a pas', () => {
		expect(outlineOf(three, 4)).toEqual([])
		expect(outlineOf(three, null)).toEqual([])
	})
	test('moins de trois parties : pas de sommaire, et les sous-titres ne comptent pas', () => {
		expect(outlineOf([heading('a'), heading('b'), heading('c', 3), heading('d', 3)], 9)).toEqual([])
	})
	test('seuls les titres de second niveau sont listés', () => {
		expect(outlineOf([...three, heading('d', 3)], 9)).toEqual(three)
	})
})
