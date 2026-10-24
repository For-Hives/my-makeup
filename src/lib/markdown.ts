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
import type { ArticleHeading } from './article-reading'

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

/** The plain text of an element: its text nodes, whatever the bold or the link around them. */
function textOf(node: Root | Element): string {
	return node.children
		.map(child => (child.type === 'text' ? child.value : child.type === 'element' ? textOf(child) : ''))
		.join('')
}

/** « Un détail » gives `un-detail`: no accent, no sign, words joined by dashes; '' when nothing is left. */
function slugOfTitle(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

/**
 * The anchors of the titles (issue 1103): each h2 and h3 gets an `id` (`section-<title>`, numbered when two titles
 * are alike), and the list of the titles goes to `file.data.headings` for the table of contents of a long article.
 * Run after the sanitizing, so the prefix of rehype-sanitize does not apply: the ids are the page's own.
 */
function addAnchors() {
	return (tree: Root, file: { data: Record<string, unknown> }): void => {
		const seen = new Map<string, number>()
		const headings: ArticleHeading[] = []
		walk(tree, element => {
			if (element.tagName !== 'h2' && element.tagName !== 'h3') return
			const text = textOf(element).replace(/\s+/g, ' ').trim()
			const base = slugOfTitle(text) || 'partie'
			const count = (seen.get(base) ?? 0) + 1
			seen.set(base, count)
			const id = `section-${base}${count > 1 ? `-${count}` : ''}`
			element.properties = { ...element.properties, id }
			if (text) headings.push({ id, text, level: element.tagName === 'h2' ? 2 : 3 })
		})
		file.data.headings = headings
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

const documentConverter = unified()
	.use(remarkParse)
	.use(remarkRehype)
	.use(rehypeSanitize)
	.use(adjustHtml)
	.use(addAnchors)
	.use(rehypeStringify)

/**
 * The same HTML as `markdownToHtml`, with an anchor on each h2 and h3, and the list of those titles (the page
 * of an article builds its table of contents from it). A text that is not one gives no HTML and no title.
 */
export async function markdownToDocument(source: unknown): Promise<{ html: string; headings: ArticleHeading[] }> {
	if (typeof source !== 'string' || source.trim() === '') return { html: '', headings: [] }
	const file = await documentConverter.process(source)
	return { html: String(file), headings: (file.data.headings as ArticleHeading[] | undefined) ?? [] }
}
