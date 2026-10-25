import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BACKDROP_COLORS } from '@/components/blocks/cta-palette'

/**
 * The tokens of the art direction kit (issue 1111): one named block of `globals.css`, the existing tokens untouched,
 * the lipstick red kept for what can be edited, and the text/background pairs of the kit held at 4.5:1.
 */

const ROOT = join(import.meta.dir, '../..')
const CSS = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')

const BLOCK_START = CSS.indexOf('ART DIRECTION KIT')
const KIT = CSS.slice(CSS.lastIndexOf('/*', BLOCK_START))
const KIT_CODE = KIT.replace(/\/\*[\s\S]*?\*\//g, '')
const THEME = /@theme static \{([\s\S]*?)\}/.exec(KIT_CODE)?.[1] ?? ''

function token(name: string): string {
	const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(THEME)?.[1]
	if (!value) throw new Error(`token --${name} missing`)
	return value.trim()
}

function luminance(hex: string): number {
	const channel = (index: number) => {
		const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

export function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
	return (light + 0.05) / (dark + 0.05)
}

// The Tailwind indigo values the kit leans on (tailwindcss 4 theme, sRGB).
const INDIGO = { 100: '#e0e7ff', 700: '#432dd7', 800: '#372aac', 900: '#312c85' }

describe('the kit block of globals.css', () => {
	test('is one clearly named block with its own theme', () => {
		expect(BLOCK_START).toBeGreaterThan(0)
		expect(CSS.match(/ART DIRECTION KIT/g)).toHaveLength(1)
		expect(THEME).toContain('--color-art-paper')
		expect(THEME).toContain('--radius-art-frame')
		expect(THEME).toContain('--shadow-art-lift')
	})

	test('keeps every token the site already had', () => {
		for (const existing of [
			'--color-lipstick:',
			'--color-ink:',
			'--color-mute:',
			'--color-blush: #f5f2ef',
			'--color-hairline:',
			'--radius-card: 22px',
			'--duration-hover:',
			'--font-display:',
		])
			expect(CSS.slice(0, BLOCK_START)).toContain(existing)
	})

	test('does not redefine an existing token: every new colour is prefixed art', () => {
		for (const [, , name] of THEME.matchAll(/--(color|radius|shadow)-([a-z0-9-]+):/g))
			expect(`${name}`).toMatch(/^art-/)
	})

	test('the lipstick red (the colour token) is never used by the kit, css or components; the lipstick drawing is only a picture', () => {
		expect(KIT_CODE).not.toContain('color-lipstick')
		for (const file of sources(join(ROOT, 'src/components/art')))
			expect(readFileSync(file, 'utf8')).not.toMatch(/(?:color|bg|text|border|outline|fill|ring)-lipstick/)
	})
})

describe('the utilities the kit uses exist', () => {
	test('every `*-art-*` utility in src/components/art is a token of the kit block', () => {
		const defined = new Set([...THEME.matchAll(/--(?:color|radius|shadow)-(art-[a-z0-9-]+):/g)].map(match => match[1]))
		const used = new Set<string>()
		for (const file of sources(join(ROOT, 'src/components/art')))
			for (const [, name] of readFileSync(file, 'utf8').matchAll(
				/(?:bg|text|border|fill|stroke|rounded|shadow|ring|outline|from|to|via)-(art-[a-z0-9-]+)/g
			))
				used.add(name as string)
		expect(used.size).toBeGreaterThan(5)
		expect([...used].filter(name => !defined.has(name))).toEqual([])
	})
})

describe('contrast of the kit pairs (WCAG AA, 4.5:1 for text)', () => {
	const paper = token('color-art-paper')
	const blush = token('color-art-blush')
	const pairs: [string, string, string][] = [
		['ink on paper', '#1a1417', paper],
		['mute on paper', '#463b41', paper],
		['mute on white', '#463b41', '#ffffff'],
		['indigo-800 eyebrow on paper', INDIGO[800], paper],
		['berry accent on paper', token('color-art-berry'), paper],
		['berry accent on white', token('color-art-berry'), '#ffffff'],
		['blush ink on blush chip', token('color-art-blush-ink'), blush],
		['indigo-900 on indigo-100 chip', INDIGO[900], INDIGO[100]],
		['indigo-900 on blush banner', INDIGO[900], blush],
		['white on indigo banner', '#ffffff', token('color-art-banner')],
		['white on solid indigo button', '#ffffff', INDIGO[700]],
		['night on white light button', token('color-art-night'), '#ffffff'],
		['night on blush light button hover', token('color-art-night'), blush],
		['rose accent on night (cta)', token('color-art-rose'), token('color-art-night')],
		['indigo-700 hover text on white chip', INDIGO[700], '#ffffff'],
	]
	for (const [name, foreground, background] of pairs)
		test(name, () => {
			expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
		})

	test('the call to action: white text holds 4.5:1 on every colour the shader can draw, so the side mask is not needed', () => {
		for (const colour of Object.values(BACKDROP_COLORS)) expect(contrast('#ffffff', colour)).toBeGreaterThanOrEqual(4.5)
		expect(contrast('#ffffff', token('color-art-night'))).toBeGreaterThanOrEqual(4.5)
	})

	test('the rose accent is for flat dark panels only: over the brightest shader colour it falls under 4.5:1, so ArtCta writes its text in white', () => {
		expect(contrast(token('color-art-rose'), BACKDROP_COLORS.front)).toBeLessThan(4.5)
		const cta = readFileSync(join(ROOT, 'src/components/art/ArtCta.tsx'), 'utf8')
		const writing = [...cta.matchAll(/<(?:h2|p)\s[^>]*className="([^"]*)"/g)].map(match => match[1]).join(' ')
		expect(writing.length).toBeGreaterThan(20)
		expect(writing).not.toMatch(/text-art-rose|text-indigo-|text-white\/\d/)
		expect(cta).toContain('text-white md:mt-7')
	})
})

function sources(folder: string): string[] {
	return readdirSync(folder).flatMap(name => {
		const path = join(folder, name)
		return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
	})
}
