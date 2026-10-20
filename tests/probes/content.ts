/**
 * What the probes read in a page, as text: the profile addresses of a sitemap, and what the
 * server HTML of a page shows before any JavaScript runs (R03, plan 02 §7.6).
 *
 * Pure functions: nothing here makes a request. The HTML is parsed by jsdom, which neither runs
 * the scripts of the page nor loads anything it links to.
 */

import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'

/** A profile page of the site: `/profil/<slug>`, one segment, as the frozen URL table writes it. */
const PROFILE_PATH = /^\/profil\/[^/]+$/

/** The words a page shows when the code printed a missing value: JavaScript writes them so. */
export const FORBIDDEN_WORDS = ['undefined', 'null'] as const
export type ForbiddenWord = (typeof FORBIDDEN_WORDS)[number]

/** Attributes a visitor, a screen reader or a search engine reads as text. */
const READ_ATTRIBUTES = ['alt', 'title', 'aria-label', 'placeholder'] as const

/** Elements whose content is not shown: the data and code of the page, its styles. */
const SHOWN_NOT = 'script, style, template'

const ENTITIES_XML: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decoderXml = (texte: string): string =>
	texte.replace(/&(amp|lt|gt|quot|apos);/g, (_entite, nom: string) => ENTITIES_XML[nom] ?? '')

/**
 * The profile paths of a sitemap, in its order and without duplicates. The origin of each
 * `<loc>` is dropped: the probes read the path on their own target, whatever origin the
 * sitemap writes.
 */
export function profilePaths(xml: string): string[] {
	const paths = new Set<string>()
	for (const [, loc = ''] of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
		const url = decoderXml(loc)
		if (!URL.canParse(url)) continue
		const { pathname } = new URL(url)
		if (PROFILE_PATH.test(pathname)) paths.add(pathname)
	}
	return [...paths]
}

/**
 * A short and stable name for a page that may belong to a real person: the first 8 hex digits
 * of the SHA-256 of its path. The report never writes the address of a profile (CLAUDE.md,
 * rule 3); a person who needs it computes the fingerprints of the sitemap on their own machine
 * (docs/tests/sondes.md).
 */
export function fingerprint(chemin: string): string {
	return createHash('sha256').update(chemin).digest('hex').slice(0, 8)
}

/** Where a forbidden word was seen, and how many times. Never the text around it. */
export interface Occurrence {
	mot: ForbiddenWord
	/** `texte`, or the name of the attribute (`alt`, `content` of a meta tag…). */
	lieu: string
	nombre: number
}

export interface HtmlReading {
	/** `h1` elements with some text, in the HTML the server sent. */
	titresH1: number
	occurrences: Occurrence[]
}

const countItems = (texte: string, mot: ForbiddenWord): number =>
	texte.match(new RegExp(`\\b${mot}\\b`, 'g'))?.length ?? 0

/**
 * What the server HTML shows: its `h1` titles, and every « undefined » or « null » written as a
 * word in a text, in an attribute read as text, or in the content of a meta tag. The scripts,
 * where the data of the page legitimately holds `null`, are left out.
 */
export function readHtml(html: string): HtmlReading {
	const { window } = new JSDOM(html)
	try {
		const { document, NodeFilter } = window
		for (const element of document.querySelectorAll(SHOWN_NOT)) element.remove()

		const titleH1 = [...document.querySelectorAll('h1')].filter(titre => titre.textContent?.trim()).length

		const seen = new Map<string, Occurrence>()
		const note = (texte: string | null | undefined, lieu: string) => {
			if (!texte) return
			for (const word of FORBIDDEN_WORDS) {
				const count = countItems(texte, word)
				if (count === 0) continue
				const key = `${word} ${lieu}`
				const already = seen.get(key)
				seen.set(key, { mot: word, lieu, nombre: (already?.nombre ?? 0) + count })
			}
		}

		// Text node by text node: two neighbours like « Ville » and « null » are two words, not « Villenull ».
		const journey = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT)
		for (let node = journey.nextNode(); node; node = journey.nextNode()) note(node.nodeValue, 'texte')
		for (const name of READ_ATTRIBUTES)
			for (const element of document.querySelectorAll(`[${name}]`)) note(element.getAttribute(name), name)
		for (const meta of document.querySelectorAll('meta[content]'))
			note(meta.getAttribute('content'), 'content d’une balise meta')

		return { titresH1: titleH1, occurrences: [...seen.values()] }
	} finally {
		window.close()
	}
}
