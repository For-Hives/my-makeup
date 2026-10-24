import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Page transitions (issue 1087, docs/mouvement.md): the template of the public pages wraps the page in React's
 * `<ViewTransition>` (View Transitions API, no code of ours in the browser), the stylesheet gives it a short sober
 * fade (+ a 12 px rise) under `no-preference`, and reduced motion, the edit page and the dashboard get none.
 */

const ROOT = join(import.meta.dir, '../..')
const TEMPLATE = join(ROOT, 'src/app/(front)/(site)/template.tsx')
const CSS = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of every block whose head contains `head`, at any depth. */
function blocks(head: string): string[] {
	const found: string[] = []
	let from = 0
	for (;;) {
		const at = CSS.indexOf(head, from)
		if (at === -1) return found
		const open = CSS.indexOf('{', at)
		let depth = 1
		let end = open + 1
		while (depth > 0 && end < CSS.length) {
			if (CSS[end] === '{') depth++
			else if (CSS[end] === '}') depth--
			end++
		}
		found.push(CSS.slice(open + 1, end - 1))
		from = end
	}
}

const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)'
const REDUCE = '@media (prefers-reduced-motion: reduce)'

describe('the template of the public pages (issue 1087)', () => {
	const code = existsSync(TEMPLATE) ? readFileSync(TEMPLATE, 'utf8') : ''

	test('exists in the public group only, so the dashboard and the administration are never wrapped', () => {
		expect(existsSync(TEMPLATE)).toBe(true)
		expect(existsSync(join(ROOT, 'src/app/(front)/(dashboard)/template.tsx'))).toBe(false)
		expect(existsSync(join(ROOT, 'src/app/(front)/template.tsx'))).toBe(false)
	})

	test('is a Server Component: no JavaScript of ours is sent to the browser', () => {
		expect(code).not.toMatch(/^\s*['"]use client['"]/m)
	})

	test('wraps the page in a ViewTransition that does nothing by default and names its enter and exit classes', () => {
		expect(code).toMatch(/import \{[^}]*\bViewTransition\b[^}]*\} from 'react'/)
		expect(code).toMatch(/<ViewTransition[^>]*default="none"/)
		expect(code).toMatch(/enter="page-in"/)
		expect(code).toMatch(/exit="page-out"/)
	})
})

describe('the stylesheet of the page transition (issue 1087)', () => {
	test('the fade and the rise are declared under no-preference, with the tokens and no raw duration', () => {
		const inside = blocks(NO_PREFERENCE).join('\n')
		expect(inside).toMatch(/::view-transition-old\(\.page-out\)/)
		expect(inside).toMatch(/::view-transition-new\(\.page-in\)/)
		const rules = [...inside.matchAll(/::view-transition-(?:old|new)\(\.page-(?:in|out)\)\s*\{([^}]*)\}/g)].map(
			m => m[1]
		)
		expect(rules).toHaveLength(2)
		for (const body of rules) {
			expect(body).toMatch(/var\(--duration-/)
			expect(body).toMatch(/var\(--ease-/)
			expect(body).not.toMatch(/\b\d+(\.\d+)?m?s\b/)
		}
	})

	test('the whole transition is no longer than the page token: exit plus enter', () => {
		const inside = blocks(NO_PREFERENCE).join('\n')
		const exit = /::view-transition-old\(\.page-out\)\s*\{([^}]*)\}/.exec(inside)?.[1] ?? ''
		const enter = /::view-transition-new\(\.page-in\)\s*\{([^}]*)\}/.exec(inside)?.[1] ?? ''
		expect(exit).toContain('var(--duration-hover)')
		// The enter waits for the exit and lasts what is left of the page duration.
		expect(enter).toContain('calc(var(--duration-page) - var(--duration-hover))')
		expect(enter).toMatch(/var\(--duration-hover\)\s+both|animation-delay:\s*var\(--duration-hover\)/)
	})

	test('only opacity and a 16 px rise move (keyframes)', () => {
		for (const name of ['page-in', 'page-out']) {
			const body = blocks(`@keyframes ${name}`)[0] ?? ''
			expect(body).not.toBe('')
			expect(body).not.toMatch(/\b(width|height|margin|top|left|filter|scale)\b/)
		}
		expect(blocks('@keyframes page-in')[0]).toContain('var(--motion-distance)')
	})

	test('the snapshot of the whole page does not cross-fade: only the page content does', () => {
		expect(CSS).toMatch(/::view-transition-old\(root\)\s*\{[^}]*display:\s*none/)
		expect(CSS).toMatch(/::view-transition-group\(root\)\s*\{[^}]*animation:\s*none/)
	})

	test('the overlay never takes a click', () => {
		expect(CSS).toMatch(/::view-transition\s*\{[^}]*pointer-events:\s*none/)
	})

	test('reduced motion removes every view transition animation', () => {
		const reduce = blocks(REDUCE).join('\n')
		expect(reduce).toMatch(/::view-transition-group\(\*\)/)
		expect(reduce).toMatch(/::view-transition-old\(\*\)/)
		expect(reduce).toMatch(/::view-transition-new\(\*\)/)
		expect(reduce).toMatch(/animation:\s*none\s*!important/)
	})

	test('the edit page of the artist gets no view transition', () => {
		expect(CSS).toMatch(/:root:has\(\[data-edit-page\]\)[\s\S]*?::view-transition-new\(\*\)/)
	})
})
