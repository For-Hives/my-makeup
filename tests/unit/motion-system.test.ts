import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { revealScript } from '@/lib/motion/reveal-script'

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

describe('motion tokens (issues 1069 and the visible pass)', () => {
	test('durations are in the ranges of the rules: 180-240 to answer a hand, 320-480 to lift, 450-600 to enter, 500-700 to reveal', () => {
		expect(ms('duration-hover')).toBeGreaterThanOrEqual(180)
		expect(ms('duration-hover')).toBeLessThanOrEqual(240)
		expect(ms('duration-lift')).toBeGreaterThanOrEqual(320)
		expect(ms('duration-lift')).toBeLessThanOrEqual(480)
		expect(ms('duration-appear')).toBeGreaterThanOrEqual(200)
		expect(ms('duration-appear')).toBeLessThanOrEqual(320)
		expect(ms('duration-enter')).toBeGreaterThanOrEqual(450)
		expect(ms('duration-enter')).toBeLessThanOrEqual(600)
		expect(ms('duration-reveal')).toBeGreaterThanOrEqual(500)
		expect(ms('duration-reveal')).toBeLessThanOrEqual(700)
		expect(ms('duration-page')).toBeGreaterThanOrEqual(400)
		expect(ms('duration-page')).toBeLessThanOrEqual(560)
	})

	test('distances stay measured: 12-16 px for a page, 24-32 px to rise, 4-8 px to lift, 3-6 % to grow', () => {
		expect(ms('motion-distance')).toBeGreaterThanOrEqual(12)
		expect(ms('motion-distance')).toBeLessThanOrEqual(16)
		expect(ms('motion-rise')).toBeGreaterThanOrEqual(24)
		expect(ms('motion-rise')).toBeLessThanOrEqual(32)
		expect(ms('motion-lift')).toBeGreaterThanOrEqual(4)
		expect(ms('motion-lift')).toBeLessThanOrEqual(8)
		expect(ms('motion-zoom')).toBeGreaterThanOrEqual(1.03)
		expect(ms('motion-zoom')).toBeLessThanOrEqual(1.06)
	})

	test('staggers are short: 60-100 ms between the lines of a load-in, 60-80 ms between cards', () => {
		expect(ms('stagger-enter')).toBeGreaterThanOrEqual(60)
		expect(ms('stagger-enter')).toBeLessThanOrEqual(100)
		expect(ms('stagger-card')).toBeGreaterThanOrEqual(60)
		expect(ms('stagger-card')).toBeLessThanOrEqual(80)
	})

	test('the load-in of a hero lasts 500 to 700 ms in all: the longest delay (index 2) plus the duration', () => {
		const total = ms('duration-enter') + 2 * ms('stagger-enter')
		expect(total).toBeGreaterThanOrEqual(500)
		expect(total).toBeLessThanOrEqual(700)
		const hero = readFileSync(join(ROOT, 'src/components/blocks/Hero.tsx'), 'utf8')
		expect(hero).toMatch(/enterOrder\(index: 1 \| 2\)/)
		expect(hero).not.toMatch(/enterOrder\(\s*[3-9]/)
	})

	test('the reveal staggers cards by 70 ms at most five steps: 350 ms, then the 600 ms of the rise', () => {
		const script = readFileSync(join(ROOT, 'src/lib/motion/reveal-script.ts'), 'utf8')
		expect(script).toContain('Math.min(n++,5)')
		expect(ms('stagger-card') * 5 + ms('duration-reveal')).toBeLessThanOrEqual(1000)
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

	test('every keyframe animates opacity, transform, a clip-path (the mask of a heading) or a paint-only color', () => {
		const allowed = new Set(['opacity', 'transform', 'clip-path', 'text-decoration-color', 'background-color', 'color'])
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

describe('nothing is hidden by the stylesheet alone (issue 1069, visible pass)', () => {
	test('opacity 0 appears only in a keyframe, or on a block the script has put on `wait`, under no-preference', () => {
		for (const rule of RULES.filter(item => !inKeyframes(item)))
			for (const [property, value] of rule.declarations)
				if (property === 'opacity' && Number.parseFloat(value) === 0) {
					expect(rule.selector).toBe('.reveal[data-reveal="wait"]')
					expect(rule.context).toContain(NO_PREFERENCE)
				}
	})

	test('a heading is never faded: the mask keyframe moves and clips only, so its text is painted from the first frame (LCP)', () => {
		const mask = RULES.filter(rule => rule.context.some(at => at === '@keyframes enter-mask'))
		expect(mask.length).toBeGreaterThan(0)
		for (const rule of mask) expect(rule.declarations.map(([property]) => property)).not.toContain('opacity')
		const rise = RULES.filter(rule => rule.context.some(at => at === '@keyframes enter-rise'))
		for (const rule of rise) expect(rule.declarations.map(([property]) => property)).not.toContain('opacity')
		// Only the `enter-fade` keyframe fades, and no heading or paragraph carries that class.
		const fade = RULES.filter(rule => rule.context.some(at => at === '@keyframes enter-fade'))
		expect(fade.flatMap(rule => rule.declarations.map(([property]) => property))).toContain('opacity')
	})

	test('the load-in classes sit under no-preference, hold no fill after the end and are cut in print and edit mode', () => {
		const declaring = RULES.filter(rule => rule.selector.startsWith('.enter'))
		expect(declaring.length).toBeGreaterThan(2)
		for (const rule of declaring) expect(rule.context).toContain(NO_PREFERENCE)
		const base = declaring.find(rule => rule.declarations.some(([property]) => property === 'animation-fill-mode'))
		expect(base?.declarations.find(([property]) => property === 'animation-fill-mode')?.[1]).toBe('backwards')
		expect(CSS).toMatch(/\[data-edit-page\] :is\(\.enter, \.enter-fade, \.enter-mask\)\s*\{\s*animation:\s*none/)
		expect(CSS).toMatch(/@media print\s*\{\s*:is\(\.enter, \.enter-fade, \.enter-mask\)\s*\{\s*animation:\s*none/)
	})

	test('the reveal is time-based, not scroll-linked, and exists only with motion allowed', () => {
		expect(CSS).not.toMatch(/animation-timeline/)
		for (const rule of RULES.filter(
			item => item.selector.startsWith('.reveal') && !item.context.includes('@media print')
		))
			expect(rule.context).toContain(NO_PREFERENCE)
		const wait = RULES.find(rule => rule.selector === '.reveal[data-reveal="wait"]')
		expect(wait?.declarations.find(([property]) => property === 'transition')?.[1]).toBe('none')
	})

	test('print and the edit page show every revealed block at once', () => {
		for (const selector of ['[data-edit-page] .reveal[data-reveal]', '.reveal[data-reveal]']) {
			const rule = RULES.find(item => item.selector === selector)
			expect(rule?.declarations.find(([property]) => property === 'opacity')?.[1]).toBe('1')
			expect(rule?.declarations.find(([property]) => property === 'transform')?.[1]).toBe('none')
		}
	})
})

describe('the reveal script (visible pass)', () => {
	const script = readFileSync(join(ROOT, 'src/lib/motion/reveal-script.ts'), 'utf8')

	test('it is a small inline script: well under 1 KB, no import, in the layout and not in a client component', () => {
		expect(revealScript.length).toBeLessThan(1000)
		expect(revealScript).not.toContain('\n')
		const layout = readFileSync(join(ROOT, 'src/app/(front)/layout.tsx'), 'utf8')
		expect(layout).toContain('revealScript')
		expect(layout).not.toMatch(/^\s*['"]use client['"]/)
		expect(script).not.toMatch(/^\s*import /m)
	})

	test('it leaves the page alone without IntersectionObserver, with reduced motion, in edit mode, and on any error', () => {
		expect(revealScript).toContain('"IntersectionObserver" in window')
		expect(revealScript).toContain('prefers-reduced-motion: reduce')
		expect(revealScript).toContain('[data-edit-page]')
		expect(revealScript.startsWith('(()=>{try{')).toBe(true)
		expect(revealScript.endsWith('catch(e){}})()')).toBe(true)
	})

	/** The script run against a small fake page: which blocks it hides, and what it shows when they come into view. */
	function play(options: { reduced?: boolean; observer?: boolean; tops: number[]; edit?: boolean }) {
		const attributes = options.tops.map(() => ({
			reveal: undefined as string | undefined,
			i: undefined as string | undefined,
		}))
		const blocks = options.tops.map((top, index) => ({
			dataset: attributes[index] as { reveal?: string },
			style: {
				setProperty(name: string, value: number) {
					if (name === '--reveal-i') attributes[index]!.i = String(value)
				},
			},
			closest: () => (options.edit ? {} : null),
			getBoundingClientRect: () => ({ top }),
		}))
		let callback: (entries: unknown[]) => void = () => undefined
		const observed: unknown[] = []
		const globals = {
			innerHeight: 800,
			matchMedia: () => ({ matches: options.reduced === true }),
			IntersectionObserver: function (this: object, cb: typeof callback) {
				callback = cb
				Object.assign(this, { observe: (t: unknown) => observed.push(t), unobserve: () => undefined })
			},
			MutationObserver: function (this: object) {
				Object.assign(this, { observe: () => undefined })
			},
			document: { documentElement: {}, querySelectorAll: () => blocks },
			requestAnimationFrame: () => 1,
		}
		if (options.observer === false) Reflect.deleteProperty(globals, 'IntersectionObserver')
		const names = Object.keys(globals)
		new Function('window', ...names, revealScript)(
			globals,
			...names.map(name => (globals as Record<string, unknown>)[name])
		)
		return { attributes, blocks, observed, enter: (entries: unknown[]) => callback(entries) }
	}

	test('blocks below the fold wait, those on the first screen are left alone', () => {
		const { attributes, observed } = play({ tops: [100, 790, 1200, 2400] })
		expect(attributes.map(item => item.reveal)).toEqual(['seen', 'seen', 'wait', 'wait'])
		expect(observed).toHaveLength(2)
	})

	test('nothing waits with reduced motion, without IntersectionObserver, or in edit mode', () => {
		expect(play({ reduced: true, tops: [1200] }).attributes[0]?.reveal).toBeUndefined()
		expect(play({ observer: false, tops: [1200] }).attributes[0]?.reveal).toBeUndefined()
		expect(play({ edit: true, tops: [1200] }).attributes[0]?.reveal).toBe('seen')
	})

	test('blocks coming into view together are staggered 0 to 5 in order, a block above the screen is shown with no delay', () => {
		const page = play({ tops: [1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] })
		const [first, ...rest] = page.blocks
		page.enter([
			...[first, ...rest].map(target => ({ target, isIntersecting: true, boundingClientRect: { top: 700 } })),
		])
		expect(page.attributes.map(item => item.i)).toEqual(['0', '1', '2', '3', '4', '5', '5', '5'])
		expect(page.attributes.every(item => item.reveal === 'in')).toBe(true)
		const jump = play({ tops: [1200] })
		jump.enter([{ target: jump.blocks[0], isIntersecting: false, boundingClientRect: { top: -50 } }])
		expect(jump.attributes[0]).toEqual({ reveal: 'in', i: '0' })
		const later = play({ tops: [1200] })
		later.enter([{ target: later.blocks[0], isIntersecting: false, boundingClientRect: { top: 900 } }])
		expect(later.attributes[0]?.reveal).toBe('wait')
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
		['src/components/blog/ArticleCard.tsx', 2, 'articles (cards, featured)'],
		['src/components/ranking/RankingExplainer.tsx', 3, 'ranking'],
		['src/components/static-pages/EditorialArticle.tsx', 2, 'content pages (article head, lead, signature)'],
		['src/components/static-pages/ClientGuide.tsx', 1, 'guides for the people looking for a makeup artist (steps)'],
		['src/components/static-pages/PageArticle.tsx', 1, 'À propos, partnerships, solutions for makeup artists (parts)'],
		['src/components/static-pages/Benefits.tsx', 2, 'the two « Pourquoi… » pages (head, cards)'],
		['src/app/(front)/(site)/demande-envoyee/page.tsx', 1, 'thank-you page'],
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
		// Below the hero of the home page (issue 1101): every section reveals its title and its blocks.
		['src/components/home/FeaturedProfiles.tsx', 1, 'home (Mise en avant)'],
		['src/components/home/Talents.tsx', 2, 'home (talents)'],
		['src/components/home/Presentation.tsx', 1, 'home (community)'],
		['src/components/home/Project.tsx', 2, 'home (project)'],
		['src/components/home/Collaboration.tsx', 4, 'home (collaboration)'],
		['src/components/home/SectionHead.tsx', 3, 'home (heading of each section)'],
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
		const rules = RULES.filter(rule => rule.selector === '[data-edit-page] .reveal[data-reveal]')
		expect(rules.length).toBeGreaterThan(0)
		expect(CSS).not.toMatch(/\.reveal[^{]*\.(is-visible|in-view|visible)/)
	})
})
