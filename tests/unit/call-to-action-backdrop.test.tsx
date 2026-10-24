/**
 * The animated background of the call to action (issue 1067). The text never depends on it: a static layer is
 * always under it, and the shader is mounted only when it can be seen and moves nothing against the wish of the
 * visitor. The written budget is in the issue.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { CtaBackdrop } from '@/components/blocks/CtaBackdrop'
import { backdropMode } from '@/components/blocks/cta-backdrop-mode'
import { BACKDROP_COLORS } from '@/components/blocks/cta-palette'
import { openWindow } from '../support/dom-react'

const SRC = join(import.meta.dir, '../../src')

function files(folder: string): string[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap(entry =>
		entry.isDirectory() ? files(join(folder, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(folder, entry.name)] : []
	)
}

/** WCAG relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
	const [r = 0, g = 0, b = 0] = [1, 3, 5].map(at => {
		const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('1067 : quand le fond bouge', () => {
	test('le shader ne tourne que visible, sans mouvement réduit, avec WebGL', () => {
		expect(backdropMode({ reducedMotion: false, visible: true, webgl: true })).toBe('shader')
		expect(backdropMode({ reducedMotion: true, visible: true, webgl: true })).toBe('static')
		expect(backdropMode({ reducedMotion: false, visible: false, webgl: true })).toBe('static')
		expect(backdropMode({ reducedMotion: false, visible: true, webgl: false })).toBe('static')
	})
})

describe('1067 : le texte se lit sur le plus clair du fond', () => {
	test('chaque couleur du fond tient 4,5:1 sous du texte blanc', () => {
		for (const color of Object.values(BACKDROP_COLORS)) {
			expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5)
		}
	})
})

describe('1067 : le shader est un morceau différé', () => {
	test('seul CtaShader importe la bibliothèque, et seul CtaBackdrop importe CtaShader, en import()', () => {
		const importing = files(SRC).filter(file => readFileSync(file, 'utf8').includes('@paper-design/shaders'))
		expect(importing.map(file => file.slice(SRC.length + 1))).toEqual(['components/blocks/CtaShader.tsx'])
		const users = files(SRC).filter(file => /\bCtaShader\b/.test(readFileSync(file, 'utf8')))
		expect(users.map(file => file.slice(SRC.length + 1)).sort()).toEqual([
			'components/blocks/CtaBackdrop.tsx',
			'components/blocks/CtaShader.tsx',
		])
		const backdrop = readFileSync(join(SRC, 'components/blocks/CtaBackdrop.tsx'), 'utf8')
		expect(backdrop).toMatch(/import\(\s*['"]\.\/CtaShader['"]\s*\)/)
		expect(backdrop).not.toMatch(/^import .* from ['"]\.\/CtaShader['"]/m)
	})
})

describe('1067 : le composant du fond', () => {
	const jsdomWindow = openWindow()
	type Observer = { callback: (entries: { isIntersecting: boolean }[]) => void }
	let observer: Observer | undefined

	function setUp({ reduced, observes = true }: { reduced: boolean; observes?: boolean }): void {
		const w = jsdomWindow.w as unknown as Record<string, unknown>
		w.matchMedia = (query: string) => ({
			matches: reduced && query.includes('prefers-reduced-motion'),
			addEventListener: () => {},
			removeEventListener: () => {},
		})
		if (observes) {
			// The component reads the global, as in a browser: the window of the bench does not set this name.
			;(globalThis as Record<string, unknown>).IntersectionObserver = class {
				constructor(callback: Observer['callback']) {
					observer = { callback }
				}
				observe() {}
				disconnect() {}
			}
		}
		;(w.HTMLCanvasElement as { prototype: { getContext: unknown } }).prototype.getContext = () => ({})
		mock.module('@/components/blocks/CtaShader', () => ({
			CtaShader: () => <canvas data-testid="shader" />,
		}))
	}

	/** The block comes on screen, or leaves it: the observer says so inside a React update. */
	async function see(isIntersecting: boolean): Promise<void> {
		await act(async () => {
			observer?.callback([{ isIntersecting }])
		})
	}

	afterEach(() => {
		observer = undefined
		delete (globalThis as Record<string, unknown>).IntersectionObserver
	})

	test('mouvement réduit : le fond reste statique, même visible', async () => {
		setUp({ reduced: true })
		const zone = await jsdomWindow.monter(<CtaBackdrop />)
		await see(true)
		expect(zone.querySelector('[data-backdrop]')?.getAttribute('data-backdrop')).toBe('static')
		expect(zone.querySelector('canvas')).toBeNull()
	})

	test('sans IntersectionObserver : le fond reste statique', async () => {
		setUp({ reduced: false, observes: false })
		const zone = await jsdomWindow.monter(<CtaBackdrop />)
		expect(zone.querySelector('[data-backdrop]')?.getAttribute('data-backdrop')).toBe('static')
		expect(zone.querySelector('canvas')).toBeNull()
	})

	test('visible, le shader se monte ; hors de l’écran, il est retiré', async () => {
		setUp({ reduced: false })
		const zone = await jsdomWindow.monter(<CtaBackdrop />)
		expect(zone.querySelector('canvas')).toBeNull()
		await see(true)
		await jsdomWindow.attendre(() => zone.querySelector('canvas'))
		expect(zone.querySelector('[data-backdrop]')?.getAttribute('data-backdrop')).toBe('shader')
		await see(false)
		await jsdomWindow.attendre(() => (zone.querySelector('canvas') === null ? true : null))
		expect(zone.querySelector('[data-backdrop]')?.getAttribute('data-backdrop')).toBe('static')
	})
})
