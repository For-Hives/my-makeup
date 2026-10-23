/**
 * Takes the markup out of a page of HTML with a scanner, not with regular expressions: a regular
 * expression that removes `<script>…</script>` misses `</script\t\n bar>`, `<SCRIPT>`, and a tag
 * rebuilt from the pieces that are left (`<scr<!-- -->ipt>`).
 *
 * The scanner reads the text once, from left to right, and only ever copies what it has read: it
 * never looks at its own output while it works. It starts again until nothing changes, so that a
 * tag rebuilt by the first pass is removed by the next one.
 */

export interface StripOptions {
	/** The elements removed with everything inside them. Lower case. */
	readonly dropContentOf?: readonly string[]
	/** True keeps the tags that are not dropped, as they were written: only the comments and the dropped elements go. */
	readonly keepTags?: boolean
	/** True writes a line break for the end of a block and for `<br>`, instead of `tagText`. */
	readonly lineBreaks?: boolean
	/** What replaces a tag that is removed (default: nothing). */
	readonly tagText?: string
}

const BLOCKS: ReadonlySet<string> = new Set([
	'p',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'div',
	'header',
	'article',
	'main',
	'section',
	'ul',
	'ol',
])

const isLetter = (character: string | undefined): boolean => character !== undefined && /^[a-z]$/i.test(character)

/** The name of the tag that starts at `from`, lower case, and the position just after it. */
function readName(html: string, from: number): { name: string; end: number } {
	let end = from
	while (end < html.length && !/[\s/>]/.test(html.charAt(end))) end += 1
	return { name: html.slice(from, end).toLowerCase(), end }
}

/** The position of the `>` that closes a tag, quotes of the attributes respected; -1 when it never closes. */
function tagEnd(html: string, from: number): number {
	let quote = ''
	for (let index = from; index < html.length; index += 1) {
		const character = html.charAt(index)
		if (quote !== '') {
			if (character === quote) quote = ''
		} else if (character === '"' || character === "'") quote = character
		else if (character === '>') return index
	}
	return -1
}

/** The position after the end tag of `name` (`</name`, then a space, `/` or `>`), or the end of the text. */
function afterElement(html: string, lower: string, name: string, from: number): number {
	const marker = `</${name}`
	let at = lower.indexOf(marker, from)
	while (at !== -1) {
		const next = lower.charAt(at + marker.length)
		if (next === '' || /[\s/>]/.test(next)) {
			const close = html.indexOf('>', at)
			return close === -1 ? html.length : close + 1
		}
		at = lower.indexOf(marker, at + marker.length)
	}
	return html.length
}

function pass(html: string, options: StripOptions): string {
	const dropped = new Set(options.dropContentOf ?? [])
	const lower = html.toLowerCase()
	const out: string[] = []
	let index = 0
	while (index < html.length) {
		const character = html.charAt(index)
		if (character !== '<') {
			out.push(character)
			index += 1
			continue
		}
		if (html.startsWith('<!--', index)) {
			const close = html.indexOf('-->', index + 4)
			index = close === -1 ? html.length : close + 3
			continue
		}
		const next = html.charAt(index + 1)
		const closing = next === '/'
		if (isLetter(next) || (closing && isLetter(html.charAt(index + 2)))) {
			const { name, end: nameEnd } = readName(html, index + (closing ? 2 : 1))
			const close = tagEnd(html, nameEnd)
			const after = close === -1 ? html.length : close + 1
			if (dropped.has(name)) {
				index = closing ? after : afterElement(html, lower, name, after)
				continue
			}
			if (options.keepTags === true) out.push(html.slice(index, after))
			else if (options.lineBreaks === true && ((closing && BLOCKS.has(name)) || name === 'br')) out.push('\n')
			else out.push(options.tagText ?? '')
			index = after
			continue
		}
		if (next === '!' || next === '?') {
			const close = html.indexOf('>', index)
			if (close !== -1) {
				index = close + 1
				continue
			}
		}
		// A `<` that opens no tag (« 3 < 5 ») is text.
		out.push(character)
		index += 1
	}
	return out.join('')
}

/** The HTML without its comments, its dropped elements and, unless `keepTags`, its tags. */
export function stripMarkup(html: string, options: StripOptions = {}): string {
	let text = html
	for (;;) {
		const next = pass(text, options)
		if (next === text) return text
		text = next
	}
}
