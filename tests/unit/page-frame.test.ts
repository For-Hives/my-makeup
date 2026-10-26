import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The frame of the public pages (26/10/2026, docs/direction-artistique.md, « Le cadre des pages »): one utility,
 * `page-frame`, the box of the home hero, used by every section, the footer and the card grids. These tests keep the
 * two in step and keep the old frames from coming back.
 */

const ROOT = join(import.meta.dir, '../..')
const css = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')

/** The body of the first rule that opens with `opener`, braces balanced. */
function block(opener: string): string {
	const start = css.indexOf(opener)
	if (start < 0) throw new Error(`${opener} est introuvable dans globals.css`)
	let depth = 0
	for (let index = css.indexOf('{', start); index < css.length; index++) {
		if (css[index] === '{') depth++
		if (css[index] === '}' && --depth === 0) return css.slice(start, index + 1)
	}
	throw new Error(`${opener} n’est pas fermé`)
}

/** Every .tsx file under a folder of the repository. */
function sources(folder: string): string[] {
	const found: string[] = []
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name)
			if (statSync(path).isDirectory()) walk(path)
			else if (name.endsWith('.tsx')) found.push(relative(ROOT, path))
		}
	}
	walk(join(ROOT, folder))
	return found
}

describe('le cadre des pages', () => {
	const frame = block('@utility page-frame')

	test('celui du haut de l’accueil : 96rem au plus, centré, 1,5rem de gouttière, 4rem dès 64rem', () => {
		expect(frame).toMatch(/max-width:\s*96rem/)
		expect(frame).toMatch(/margin-inline:\s*auto/)
		expect(frame).toMatch(/padding-inline:\s*1\.5rem/)
		expect(frame).toMatch(/@media \(width >= 64rem\) \{\s*padding-inline:\s*4rem;/)
	})

	test('le haut de l’accueil a la même boîte et les mêmes gouttières', () => {
		const hero = block('.home-hero-grid {')
		expect(hero).toMatch(/max-width:\s*96rem/)
		expect(hero).toMatch(/padding:\s*2rem 1\.5rem 0/)
		expect(css).toMatch(/@media \(min-width: 64rem\) \{[\s\S]*?\.home-hero-grid \{[^}]*padding:\s*3rem 4rem 0;/)
	})

	/**
	 * The frames that keep their own width, and why: the public profile page and its editing bars (their HTML is
	 * frozen by tests/fixtures/direct-edit/*.golden, a change of its own), the call to action panel (a card centred in
	 * the frame), and files no page renders any more.
	 */
	const KEPT = [
		'src/components/profile/',
		'src/components/direct-edit/',
		'src/components/dashboard/',
		'src/components/art/ArtCta.tsx',
		'src/components/static-pages/EditorialArticle.tsx',
		'src/components/blocks/',
		'src/components/search/ResultList.tsx',
	]

	test('aucune section publique ne revient aux anciens cadres de 80 et 72rem', () => {
		const old = [...sources('src/components'), ...sources('src/app/(front)/(site)')]
			.filter(file => !KEPT.some(kept => file.startsWith(kept)))
			.filter(file => /\bmax-w-(7xl|6xl)\b/.test(readFileSync(join(ROOT, file), 'utf8')))
		expect(old).toEqual([])
	})

	test('aucune gouttière ne tombe à zéro sur un grand écran (« 2xl:px-0 » collerait le contenu au bord dès 1536 px)', () => {
		const flush = [...sources('src/components'), ...sources('src/app')].filter(file =>
			/\b2xl:(px|left)-0\b/.test(readFileSync(join(ROOT, file), 'utf8'))
		)
		expect(flush).toEqual([])
	})
})
