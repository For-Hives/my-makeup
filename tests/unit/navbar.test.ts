import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The navigation bar of the public site (issue 1100, docs/navbar.md), read from its source and from the stylesheet:
 * one underline per entry that slides in with the site's tokens, a panel without the grey square, a sign-in link
 * that no longer stacks two underlines, and everything that moves under `prefers-reduced-motion: no-preference`.
 * The behaviour (hover intent, keyboard) is played in a browser by tests/e2e/navbar.spec.ts.
 */

const ROOT = join(import.meta.dir, '../..')
const SOURCE = readFileSync(join(ROOT, 'src/components/layout/Nav.tsx'), 'utf8')
const SHEET = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')
const CSS = SHEET.replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the first rule whose selector is exactly `selector`, wherever it is nested. */
function body(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = new RegExp(`(?:^|[}{;\\s])${escaped}\\s*\\{([^{}]*)\\}`).exec(CSS)
	if (!match) throw new Error(`rule ${selector} missing from globals.css`)
	return match[1] ?? ''
}

/** The block of the stylesheet that holds the navigation bar, between its two named markers. */
const NAVBAR_BLOCK = (() => {
	const start = SHEET.indexOf('/* Navbar (issue 1100')
	const end = SHEET.indexOf('/* End of the navbar */')
	if (start === -1 || end === -1) throw new Error('the navbar block of globals.css is not delimited')
	return SHEET.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
})()

describe('the navbar markup (issue 1100)', () => {
	test('the panel has no grey square, no ring and no grid of cards', () => {
		expect(SOURCE).not.toContain('hover:bg-gray-50')
		expect(SOURCE).not.toContain('ring-gray-900/5')
		expect(SOURCE).not.toContain('rounded-3xl')
		expect(SOURCE).not.toContain('absolute inset-0')
	})

	test('« Me connecter » is not drawn with the old class that stacked a border on the link underline', () => {
		expect(SOURCE).not.toContain('btn-primary-simple')
		expect(CSS).not.toContain('.btn-primary-simple')
	})

	test('every entry is a 44 px target', () => {
		expect(SOURCE).toContain('nav-link')
		expect(body('.nav-link')).toMatch(/min-height:\s*2\.75rem/)
		expect(body('.nav-link')).toMatch(/padding-inline:\s*0\.75rem|padding-inline:\s*1rem/)
	})

	test('the groups answer the keyboard: Escape, arrows, Home and End', () => {
		for (const key of ['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End']) expect(SOURCE).toContain(`'${key}'`)
	})

	test('the hover opens a group with an intent delay, in both directions, for a mouse on a computer only', () => {
		expect(SOURCE).toMatch(/OPEN_DELAY\s*=\s*\d+/)
		expect(SOURCE).toMatch(/CLOSE_DELAY\s*=\s*\d+/)
		const open = Number(/OPEN_DELAY\s*=\s*(\d+)/.exec(SOURCE)?.[1])
		const close = Number(/CLOSE_DELAY\s*=\s*(\d+)/.exec(SOURCE)?.[1])
		expect(open).toBeGreaterThanOrEqual(60)
		expect(open).toBeLessThanOrEqual(150)
		expect(close).toBeGreaterThan(open)
		expect(close).toBeLessThanOrEqual(300)
		expect(SOURCE).toContain("pointerType !== 'mouse'")
		expect(SOURCE).toContain('(min-width: 1024px)')
	})
})

describe('the two buttons and the current link, in the art direction kit', () => {
	test('« Trouver une maquilleuse » is the outline pill of the kit with its arrow, not the old bordered button', () => {
		expect(SOURCE).toContain("pillClassName({ variant: 'outline', size: 'sm' })")
		expect(SOURCE).toContain('art-arrow')
		expect(SOURCE).not.toContain('btn-primary-with-icon')
		expect(SOURCE).not.toContain('nav-search')
		expect(CSS).not.toContain('.nav-search')
	})

	test('« Me connecter » and « Me déconnecter » are one soft pill that keeps the single sliding underline', () => {
		expect(SOURCE.match(/\$\{SIGN_IN_PILL\}/g)).toHaveLength(2)
		const pill = /const SIGN_IN_PILL =\s*'([^']*)'/.exec(SOURCE)?.[1] ?? ''
		expect(pill).toContain('nav-link-strong')
		expect(pill).toContain('rounded-full')
		expect(pill).toContain('after:inset-x-5')
		expect(pill).not.toMatch(/\bborder\b/)
	})

	test('the current link is ringed by the sketched ellipse, and its bar gives way to it', () => {
		expect(SOURCE).toContain('<SwirlEllipse')
		expect(SOURCE).toMatch(/path === entry\.href && \(\s*<SwirlEllipse/)
		expect(body('.nav-link[aria-current="page"]::after')).toMatch(/content:\s*none/)
	})

	test('the bar reads the pill and the ellipse without the drawings: neither file imports anything', () => {
		for (const file of ['pill-class.ts', 'SwirlEllipse.tsx']) {
			const code = readFileSync(join(ROOT, 'src/components/art', file), 'utf8')
			expect(code).not.toMatch(/^import /m)
		}
	})
})

describe('the navbar styles (issue 1100)', () => {
	test('the underline is a bar that scales in from the left: transform only, never a width', () => {
		const bar = body('.nav-link::after')
		expect(bar).toMatch(/transform:\s*scaleX\(0\)/)
		expect(bar).toMatch(/transform-origin:\s*left/)
		expect(bar).not.toMatch(/\bwidth\s*:\s*[^;]*%?\s*;[\s\S]*transition/)
		expect(body('.nav-link:is(:hover, :focus-visible, [aria-expanded="true"], [aria-current="page"])::after')).toMatch(
			/transform:\s*scaleX\(1\)/
		)
	})

	test('the links draw their own underline: the global text-decoration is switched off for them', () => {
		expect(body('.nav-link')).toMatch(/text-decoration(-line)?:\s*none/)
		expect(body('.nav-link:hover')).toMatch(/text-decoration(-line)?:\s*none/)
	})

	test('the controls of the bar keep the site tint off: no filter and no grey background on hover', () => {
		const hover = body('.nav-link:is(:hover, :focus-visible, [aria-expanded="true"])')
		expect(hover).toMatch(/color:/)
		expect(hover).toMatch(/background-color:\s*transparent/)
		expect(hover).toMatch(/filter:\s*none/)
	})

	test('the transitions and the entry of the panel are declared under no-preference and use the site tokens', () => {
		const motion = NAVBAR_BLOCK.slice(NAVBAR_BLOCK.indexOf('prefers-reduced-motion: no-preference'))
		expect(NAVBAR_BLOCK).toContain('@media (prefers-reduced-motion: no-preference)')
		expect(motion).toContain('var(--duration-hover)')
		expect(motion).toContain('var(--ease-out-soft)')
		expect(motion).toContain('nav-panel-in')
		const before = NAVBAR_BLOCK.slice(0, NAVBAR_BLOCK.indexOf('@media (prefers-reduced-motion: no-preference)'))
		expect(before).not.toMatch(/\btransition\b|animation:/)
		expect(NAVBAR_BLOCK).not.toMatch(/transition(-property)?:[^;]*\b(all|width|height|margin|padding|top|left)\b/)
	})

	test('the panel opens with a short fade and a rise of a few pixels, from `@keyframes nav-panel-in`', () => {
		const frames = /@keyframes nav-panel-in\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
		expect(frames).toMatch(/opacity:\s*0/)
		expect(frames).toMatch(/translateY\(/)
		expect(frames).not.toMatch(/scale\(|rotate\(|bounce/)
	})

	test('the panel is a clean card: radius, hairline, soft shadow, and a transparent bridge over the gap', () => {
		const card = body('.nav-panel-card')
		expect(card).toMatch(/border-radius/)
		expect(card).toMatch(/box-shadow/)
		expect(card).not.toMatch(/ring/)
		expect(body('.nav-panel')).toMatch(/padding-top/)
	})
})
