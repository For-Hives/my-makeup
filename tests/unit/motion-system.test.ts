import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The motion system (issue 1069, docs/mouvement.md), read from the stylesheet itself: tokens in their ranges, only
 * cheap properties move, everything that moves sits under `prefers-reduced-motion: no-preference`, reduced motion
 * ends what a component still declares, and nothing is hidden by default (no `opacity: 0` outside a keyframe).
 */

const ROOT = join(import.meta.dir, '../..')
const CSS = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule {
	/** The at-rules around the rule, outermost first, e.g. `@media (prefers-reduced-motion: no-preference)`. */
	context: string[]
	selector: string
	declarations: [string, string][]
}

/** A small reader for the nesting we use: at-rules around style rules, declarations inside. */
function readRules(css: string): Rule[] {
	const rules: Rule[] = []
	const walk = (text: string, context: string[]) => {
		let i = 0
		while (i < text.length) {
			const open = text.indexOf('{', i)
			const semicolon = text.indexOf(';', i)
			if (open === -1) return
			if (semicolon !== -1 && semicolon < open) {
				i = semicolon + 1
				continue
			}
			let depth = 1
			let j = open + 1
			while (depth > 0 && j < text.length) {
				if (text[j] === '{') depth++
				else if (text[j] === '}') depth--
				j++
			}
			const head = text.slice(i, open).trim()
			const body = text.slice(open + 1, j - 1)
			if (head.startsWith('@')) walk(body, [...context, head.replace(/\s+/g, ' ')])
			else {
				const declarations = body
					.split(';')
					.map(part => part.trim())
					.filter(part => part.includes(':') && !part.includes('{'))
					.map((part): [string, string] => {
						const cut = part.indexOf(':')
						return [part.slice(0, cut).trim(), part.slice(cut + 1).trim()]
					})
				rules.push({ context, selector: head, declarations })
			}
			i = j
		}
	}
	walk(css, [])
	return rules
}

const RULES = readRules(CSS)
const inKeyframes = (rule: Rule) => rule.context.some(at => at.startsWith('@keyframes'))
const MOVES = /^(transition|animation)(-|$)/
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)'
const REDUCE = '@media (prefers-reduced-motion: reduce)'

/** The declared tokens, from the `@theme static` block. */
function token(name: string): string {
	const block = /@theme static\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? ''
	const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)?.[1]
	if (!value) throw new Error(`token --${name} missing`)
	return value.trim()
}
const ms = (name: string) => Number.parseFloat(token(name))

describe('motion tokens (issue 1069)', () => {
	test('durations are in the ranges of the rules', () => {
		expect(ms('duration-hover')).toBeGreaterThanOrEqual(80)
		expect(ms('duration-hover')).toBeLessThanOrEqual(120)
		for (const name of ['duration-lift', 'duration-appear']) {
			expect(ms(name)).toBeGreaterThanOrEqual(200)
			expect(ms(name)).toBeLessThanOrEqual(320)
		}
		expect(ms('duration-page')).toBeLessThanOrEqual(400)
	})

	test('distances are small: 8 to 16 px to appear, 2 to 4 px to lift, 2 to 4 % to grow', () => {
		expect(ms('motion-distance')).toBeGreaterThanOrEqual(8)
		expect(ms('motion-distance')).toBeLessThanOrEqual(16)
		expect(ms('motion-lift')).toBeGreaterThanOrEqual(2)
		expect(ms('motion-lift')).toBeLessThanOrEqual(4)
		expect(ms('motion-zoom')).toBeGreaterThanOrEqual(1.02)
		expect(ms('motion-zoom')).toBeLessThanOrEqual(1.04)
	})

	test('two soft curves, no bounce: no control point leaves 0 to 1', () => {
		for (const name of ['ease-out-soft', 'ease-in-soft']) {
			const numbers =
				token(name)
					.match(/-?\d*\.?\d+/g)
					?.map(Number) ?? []
			expect(numbers).toHaveLength(4)
			expect(numbers[1]).toBeGreaterThanOrEqual(0)
			expect(numbers[3]).toBeLessThanOrEqual(1)
		}
	})
})

describe('what may move (issue 1069)', () => {
	const FORBIDDEN =
		/\b(all|width|height|margin[a-z-]*|padding[a-z-]*|top|left|right|bottom|inset[a-z-]*|gap|font[a-z-]*|line-height|border-width|flex[a-z-]*)\b/

	test('no transition names a layout property', () => {
		const named = RULES.filter(rule => !inKeyframes(rule)).flatMap(rule =>
			rule.declarations.filter(([property]) => property === 'transition-property' || property === 'transition')
		)
		expect(named.length).toBeGreaterThan(3)
		for (const [property, value] of named) expect(`${property}: ${value}`).not.toMatch(FORBIDDEN)
	})

	test('every keyframe animates opacity, transform or a paint-only color', () => {
		const allowed = new Set(['opacity', 'transform', 'text-decoration-color', 'background-color', 'color'])
		const properties = RULES.filter(inKeyframes).flatMap(rule => rule.declarations.map(([property]) => property))
		expect(properties.length).toBeGreaterThan(0)
		for (const property of properties) expect(allowed.has(property)).toBe(true)
	})

	test('every transition and animation is declared under no-preference, or ends motion under reduce', () => {
		const declaring = RULES.filter(rule => rule.declarations.some(([property]) => MOVES.test(property)))
		expect(declaring.length).toBeGreaterThan(5)
		for (const rule of declaring) {
			const motion = rule.declarations.filter(([property]) => MOVES.test(property))
			const quiet =
				rule.context.some(at => at === REDUCE) ||
				rule.context.includes('@media print') ||
				motion.every(([, value]) => value === 'none')
			expect(quiet || rule.context.includes(NO_PREFERENCE)).toBe(true)
		}
	})

	test('reduced motion ends every transition and animation at once and stops loops', () => {
		const rule = RULES.find(item => item.context.includes(REDUCE) && item.selector.startsWith('*'))
		const value = (property: string) => rule?.declarations.find(([name]) => name === property)?.[1]
		expect(value('transition-duration')).toContain('0.01ms')
		expect(value('animation-duration')).toContain('0.01ms')
		expect(value('animation-iteration-count')).toContain('1')
	})
})

describe('nothing is hidden by default (issue 1069)', () => {
	test('opacity 0 appears only inside a keyframe', () => {
		for (const rule of RULES.filter(item => !inKeyframes(item)))
			for (const [property, value] of rule.declarations)
				if (property === 'opacity') expect(Number.parseFloat(value)).toBeGreaterThan(0)
	})

	test('the reveal exists only where the browser knows scroll-driven animations, and not with reduced motion', () => {
		const reveal = RULES.filter(rule => rule.selector === '.reveal')
		expect(reveal.length).toBeGreaterThan(0)
		for (const rule of reveal) {
			if (rule.declarations.some(([, value]) => value === 'none')) continue
			expect(rule.context).toContain(NO_PREFERENCE)
			expect(rule.context).toContain('@supports (animation-timeline: view())')
		}
	})

	test('a revealed block shows its end state outside its range: there is no fill, so it is plain before its range', () => {
		const rule = RULES.find(item => item.selector === '.reveal' && item.declarations.length > 2)
		expect(rule?.declarations.find(([property]) => property === 'animation-fill-mode')?.[1]).toBe('none')
	})
})

describe('the components follow the system (issue 1069)', () => {
	const SOURCES: string[] = []
	const collect = (folder: string) => {
		for (const name of readdirSync(folder)) {
			const path = join(folder, name)
			if (statSync(path).isDirectory()) collect(path)
			else if (/\.(tsx|ts)$/.test(name)) SOURCES.push(path)
		}
	}
	collect(join(ROOT, 'src'))

	test('no `transition-all`, no bounce, ping or pulse, no duration over 400 ms', () => {
		for (const path of SOURCES) {
			const text = readFileSync(path, 'utf8')
			expect(`${path}: ${/transition-all/.test(text)}`).toBe(`${path}: false`)
			expect(`${path}: ${/animate-(bounce|ping|pulse)/.test(text)}`).toBe(`${path}: false`)
			for (const [, digits] of text.matchAll(/\bduration-(\d+)\b/g)) expect(Number(digits)).toBeLessThanOrEqual(400)
		}
	})
})

describe('the reveal reaches the pages (issue 1088)', () => {
	/** Where a block is revealed, and how many times at least: the file is the proof that its page is covered. */
	const REVEALED: [path: string, minimum: number, page: string][] = [
		[
			'src/components/blocks/ProfileBlock.tsx',
			2,
			'talents, zones, articles (cards of the makeup artists, search form)',
		],
		['src/app/(front)/(site)/talent/[slug]/page.tsx', 1, 'talent'],
		['src/app/(front)/(site)/maquilleuses/[department]/page.tsx', 1, 'zone'],
		['src/components/blog/ArticleList.tsx', 1, 'articles (list)'],
		['src/app/(front)/(site)/blog/page.tsx', 1, 'articles (heading)'],
		['src/components/ranking/RankingExplainer.tsx', 3, 'ranking'],
		['src/app/(front)/(site)/contact/page.tsx', 3, 'contact'],
		['src/app/(front)/(dashboard)/auth/signin/page.tsx', 2, 'sign-in'],
		['src/app/(front)/(dashboard)/auth/signup/page.tsx', 2, 'sign-up'],
		['src/components/auth/PasswordlessHelp.tsx', 1, 'sign-in'],
		['src/components/dashboard/overview/card.ts', 1, 'space (cards)'],
		['src/components/dashboard/AccountDeletion.tsx', 1, 'space'],
		['src/components/dashboard/QuoteRequests.tsx', 1, 'space'],
		['src/components/dashboard/PasswordChange.tsx', 1, 'space'],
		['src/components/dashboard/PageOnline.tsx', 1, 'space'],
		['src/components/dashboard/MyViews.tsx', 2, 'space'],
	]
	/** Class strings that begin with the shared class, whatever the quotes (JSX attribute, constant). */
	const reveals = (text: string) => text.match(/["'`]reveal[\s"'`]/g) ?? []

	test('every listed page has its blocks revealed with the shared class, and nowhere a second system', () => {
		for (const [path, minimum, page] of REVEALED) {
			const text = readFileSync(join(ROOT, path), 'utf8')
			expect(`${page}: ${path}: ${reveals(text).length >= minimum}`).toBe(`${page}: ${path}: true`)
		}
	})

	test('no revealed block of a public page is in a client component: the reveal costs no JavaScript there', () => {
		// « Mon espace » (src/components/dashboard) loads its client components anyway: a class name there is a few bytes.
		for (const [path] of REVEALED.filter(([file]) => !file.includes('/dashboard/')))
			expect(`${path}: ${/^\s*['"]use client['"]/.test(readFileSync(join(ROOT, path), 'utf8'))}`).toBe(`${path}: false`)
	})

	test('the edit page and print stay free of reveal, and the sheet adds no JavaScript hook', () => {
		const rules = RULES.filter(rule => rule.selector === '[data-edit-page] .reveal')
		expect(rules.length).toBeGreaterThan(0)
		for (const rule of rules) expect(rule.declarations.find(([property]) => property === 'animation')?.[1]).toBe('none')
		expect(CSS).not.toMatch(/\.reveal[^{]*\.(is-visible|in-view|visible)/)
	})
})
