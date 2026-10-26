import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The hover of the public site (issue 1137, docs/mouvement.md « Le survol d'une carte »), read from the stylesheet and
 * the sources: a card that leads to a page is washed, never shadowed with a hard dark shadow; the controls ease their
 * borders as they ease their fills; the parts that follow the hover of their parent use the tokens of the site.
 */

const ROOT = join(import.meta.dir, '../..')
const SHEET = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')
const CSS = SHEET.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule of the stylesheet as `[selector, body]`, at any depth of at-rules. */
function rules(): [string, string][] {
	const found: [string, string][] = []
	for (const match of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) found.push([match[1]?.trim() ?? '', match[2] ?? ''])
	return found
}

function body(selector: string): string {
	const rule = rules().find(([name]) => name === selector)
	if (!rule) throw new Error(`rule ${selector} missing from globals.css`)
	return rule[1]
}

/** The files of a folder, recursively. */
function files(dir: string, found: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) files(path, found)
		else if (path.endsWith('.tsx')) found.push(path)
	}
	return found
}

/** The alpha of every `rgb(... / a)` in a value, 1 when it has none. */
function alphas(value: string): number[] {
	return [...value.matchAll(/rgba?\(([^)]*)\)/g)].map(match => {
		const slash = /\/\s*([\d.]+)(%?)/.exec(match[1] ?? '')
		if (!slash) return 1
		return Number(slash[1]) / (slash[2] ? 100 : 1)
	})
}

describe('a card is washed, not shadowed', () => {
	test('no rule of a hovered card carries a box-shadow', () => {
		for (const [selector, declarations] of rules()) {
			if (!/card-hover/.test(selector)) continue
			expect(`${selector}: ${declarations}`).not.toMatch(/box-shadow/)
		}
	})

	test('no hover rule of the stylesheet draws a dark shadow: the alpha of a hovered shadow stays under 0.2', () => {
		for (const [selector, declarations] of rules()) {
			if (!/:hover|:focus-visible/.test(selector)) continue
			const shadow = /(?:^|;)\s*box-shadow:([^;]*)/.exec(declarations)?.[1]
			if (!shadow || shadow.trim() === 'none') continue
			for (const value of alphas(shadow)) expect(`${selector}: ${value}`).toMatch(/: (0\.1\d*|0\.0\d*|0)$/)
		}
	})

	test('the public components never name a heavier shadow on hover', () => {
		const offenders: string[] = []
		for (const file of files(join(ROOT, 'src/components')).concat(files(join(ROOT, 'src/app/(front)/(site)')))) {
			const text = readFileSync(file, 'utf8')
			for (const match of text.matchAll(/(?:group-)?hover:shadow-(?:md|lg|xl|2xl)/g))
				offenders.push(`${file}: ${match[0]}`)
		}
		expect(offenders).toEqual([])
	})

	test('the wash is a pseudo-element that reaches 12 px past the card, for a mouse only, with no lift', () => {
		const wash = body('.card-hover::before')
		expect(wash).toMatch(/inset:\s*-12px/)
		expect(wash).toMatch(/z-index:\s*-1/)
		expect(wash).toMatch(/pointer-events:\s*none/)
		expect(body('.card-hover')).toMatch(/isolation:\s*isolate/)
		expect(body('.card-hover:hover::before')).toMatch(/background-color:\s*color-mix\(/)
		const hoverMedia = SHEET.indexOf('@media (hover: hover) {\n\t.card-hover {')
		expect(hoverMedia).toBeGreaterThan(-1)
		// Nothing lifts: the hovered card keeps its place.
		for (const [selector, declarations] of rules())
			if (/^\.card-hover(:hover)?$/.test(selector)) expect(declarations).not.toMatch(/transform/)
	})

	test('the wash and the photo move with the tokens of the site, under no-preference', () => {
		const motion = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: no-preference)'))
		const wash = /\.card-hover::before\s*\{([^{}]*)\}/.exec(motion)?.[1] ?? ''
		expect(wash).toContain('transition-property: background-color, transform')
		expect(wash).toContain('var(--duration-lift)')
		expect(wash).toContain('var(--ease-out-soft)')
		expect(/\.card-zoom\s*\{([^{}]*)\}/.exec(motion)?.[1]).toContain('var(--duration-lift)')
	})

	test('a card with a face of its own is washed from the list item: the wash paints under the face and shows around it', () => {
		const grid = readFileSync(join(ROOT, 'src/components/search/SearchGrid.tsx'), 'utf8')
		expect(grid.match(/'reveal isolate /g)).toHaveLength(2)
		expect(body('.card-hover.bg-white')).toMatch(/isolation:\s*auto/)
	})

	test('the rail of the search page keeps room around its cards, or the wash would be clipped', () => {
		const grid = readFileSync(join(ROOT, 'src/components/search/SearchGrid.tsx'), 'utf8')
		expect(grid).toMatch(/-mt-4[^']*pt-4[^']*pb-4/)
	})
})

describe('the controls ease what they change (issue 1137)', () => {
	test('the base transition names the border, the fill and the stroke as well as the colors', () => {
		const list = /transition-property:\s*([^;]*background-color[^;]*text-decoration-color);/.exec(CSS)?.[1] ?? ''
		for (const property of ['background-color', 'border-color', 'color', 'fill', 'stroke', 'text-decoration-color'])
			expect(list).toContain(property)
	})

	test('the parts that follow the hover of their parent ease with the tokens, not the 150 ms default of a utility', () => {
		const part = readFileSync(join(ROOT, 'src/components/art/ProfileCard.tsx'), 'utf8')
		const pill = readFileSync(join(ROOT, 'src/components/art/Pill.tsx'), 'utf8')
		for (const text of [part, pill]) {
			expect(text).toContain('hover-fade')
			expect(text).not.toContain('transition-colors')
		}
		const ease = body('.hover-fade')
		expect(ease).toContain('var(--duration-hover)')
		expect(ease).toContain('var(--ease-out-soft)')
		for (const file of files(join(ROOT, 'src/components/art')))
			expect(readFileSync(file, 'utf8'), file).not.toMatch(/\btransition-colors\b/)
	})

	test("« Lire l'article » draws a line and moves its arrow with the tokens", () => {
		const card = readFileSync(join(ROOT, 'src/components/art/BlogCard.tsx'), 'utf8')
		expect(card).toContain('read-more-label')
		expect(card).toContain('read-more-arrow')
		expect(card).not.toContain('duration-200')
		expect(body('.read-more-label::after')).toMatch(/transform:\s*scaleX\(0\)/)
		expect(body('.card-hover:hover .read-more-label::after')).toMatch(/transform:\s*scaleX\(1\)/)
		const motion = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: no-preference)'))
		expect(motion).toMatch(/\.read-more-label::after,\s*\.read-more-arrow\s*\{[^{}]*var\(--duration-hover\)/)
	})

	test('a chip link fills softly and does not underline; a pill does not underline either', () => {
		const chip = readFileSync(join(ROOT, 'src/components/art/Chip.tsx'), 'utf8')
		expect(chip).toContain('hover:no-underline')
		expect(chip).toMatch(/plain: 'hover:bg-indigo-50'/)
		const pill = readFileSync(join(ROOT, 'src/components/art/pill-class.ts'), 'utf8')
		expect(pill).toContain('hover:no-underline')
	})
})
