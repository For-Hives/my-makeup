/**
 * The one function that turns the markdown of the newsroom into HTML (ticket 106): articles and
 * talents both call it. It runs on the server and is pure (no `next` import), so the tests read it too.
 *
 * - Raw HTML written in the markdown is dropped, never passed on (the old site did the same through
 *   `remark-html`, which sanitized by default): a `<script>` slid into an article does not come out.
 * - What is left goes through `rehype-sanitize` with its default schema: no script, no event handler,
 *   no `javascript:` link, no frame, and the `id` and `name` attributes get a prefix so that they cannot
 *   take over an element of the page.
 * - The titles are lowered AFTER the sanitizing: « # title » of the content becomes an h2, so the title of
 *   the page stays the only h1 (SEO-10; the old site did the same with `retrograderTitres`).
 * - Images wait until they are scrolled to.
 */

import type { Element, Root } from 'hast'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

/** Walks the tree and gives each element to `visiteur`. */
function walk(noeud: Root | Element, visiteur: (element: Element) => void): void {
	for (const child of noeud.children) {
		if (child.type !== 'element') continue
		visiteur(child)
		walk(child, visiteur)
	}
}

/** The last step before the HTML is written: h1 become h2, images load lazily. */
function adjustHtml() {
	return (arbre: Root): void => {
		walk(arbre, element => {
			if (element.tagName === 'h1') element.tagName = 'h2'
			else if (element.tagName === 'img')
				element.properties = { ...element.properties, loading: 'lazy', decoding: 'async' }
		})
	}
}

const converter = unified().use(remarkParse).use(remarkRehype).use(rehypeSanitize).use(adjustHtml).use(rehypeStringify)

/**
 * The HTML of a markdown text, sanitized, with no h1. Anything that is not a text (a field never filled in:
 * `null`, `undefined`) gives an empty string, never the word « null ».
 */
export async function markdownToHtml(source: unknown): Promise<string> {
	if (typeof source !== 'string' || source.trim() === '') return ''
	return String(await converter.process(source))
}
