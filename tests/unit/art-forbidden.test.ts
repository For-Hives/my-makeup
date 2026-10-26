import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { LINE_DRAWINGS, MAKEUP_OBJECTS } from '@/components/art/drawings'
import { ICONS } from '@/components/art/icons'
import { pathOf } from '../../scripts/art/build-drawings'
import { ALL_ICON_ORIGINS } from '../../scripts/art/icon-origins'

/**
 * What the art direction forbids, held by the code (issue 1111). The owner did not like the 4-point sparkles and the
 * thin-line flowers of the first kit: they are gone, and nothing may bring them back, as a file, an import or a
 * stylesheet name. The same page forbids the other things the kit never does: bounce, neon, twinkling.
 */

const ROOT = join(import.meta.dir, '../..')
const SRC = join(ROOT, 'src')

function files(folder: string): string[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder).flatMap(name => {
		const path = join(folder, name)
		return statSync(path).isDirectory() ? files(path) : [path]
	})
}

const ART = files(join(SRC, 'components/art'))
const code = (path: string) =>
	readFileSync(path, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*(\/\/|\*).*$/gm, '')
const PUBLIC_ART = files(join(ROOT, 'public/art'))
const FORBIDDEN_NAME = /(sparkle|spark|twinkle|flower|floral|blossom|botanic|chamomile|anemone|leaf-sprig|petal)/i

describe('the removed sparkle and flower assets', () => {
	test('no file of the kit, in src or in public, carries a sparkle or flower name', () => {
		const everything = [...files(SRC), ...files(join(ROOT, 'public'))]
		const named = everything.filter(path => FORBIDDEN_NAME.test(relative(ROOT, path).split('/').pop() ?? ''))
		expect(named.map(path => relative(ROOT, path))).toEqual([])
	})

	test('nothing in the source imports or points to a removed asset', () => {
		const offenders: string[] = []
		for (const path of files(SRC).filter(file => /\.(tsx?|css)$/.test(file))) {
			const code = readFileSync(path, 'utf8')
			// Only the guard words in a comment that explains the rule may appear in the kit; code never does.
			const uncommented = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
			if (/(?:from|import\()\s*['"][^'"]*(sparkle|flower|leaf-sprig|chamomile|anemone)[^'"]*['"]/i.test(uncommented))
				offenders.push(relative(ROOT, path))
			if (/url\([^)]*(sparkle|flower|leaf-sprig|chamomile|anemone)/i.test(uncommented))
				offenders.push(relative(ROOT, path))
		}
		expect(offenders).toEqual([])
	})

	test('the kit uses no sparkle or flower identifier, class or data attribute', () => {
		for (const path of ART) {
			const code = readFileSync(path, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*(\/\/|\*).*$/gm, '')
			expect(`${relative(ROOT, path)}: ${FORBIDDEN_NAME.exec(code)?.[0] ?? 'ok'}`).toEndWith(': ok')
		}
		expect(PUBLIC_ART.filter(path => FORBIDDEN_NAME.test(path))).toEqual([])
	})

	test('the drawings are the five kinds of the direction, none of them botanical: lips, eye and the makeup objects', () => {
		expect(Object.keys(LINE_DRAWINGS).sort()).toEqual(['eye', 'lips'])
		expect(Object.keys(MAKEUP_OBJECTS)).not.toContainEqual(expect.stringMatching(FORBIDDEN_NAME))
	})
})

describe('the icon pack is custom, listed, with its origin', () => {
	const credits = readFileSync(join(ROOT, 'docs/credits-svg.md'), 'utf8')
	/** A credits row: | `name` | origin | source file | role |. */
	const rows = credits
		.split('\n')
		.filter(line => line.startsWith('| `'))
		.map(line => line.split('|').map(cell => cell.trim()))
	const ORIGIN_LABEL = { traced: 'Généré par IA, tracé', hand: 'Dessiné à la main' } as const
	const ICON_FOLDER = join(ROOT, 'scripts/art/icons')

	test('no file or export of the art layer is named as generated art, and the AI-generated data file is gone', () => {
		const offenders: string[] = []
		for (const path of [...ART, ...PUBLIC_ART]) {
			const name = relative(ROOT, path)
			if (/generated|\bai[-_]/i.test(name.split('/').pop() ?? '')) offenders.push(name)
			if (
				/\.(tsx?|svg)$/.test(path) &&
				/export (const|function|type|interface) \w*Generated/.test(readFileSync(path, 'utf8'))
			)
				offenders.push(`${name}: exported as generated art`)
		}
		expect(offenders).toEqual([])
		expect(existsSync(join(SRC, 'components/art/generated-art.ts'))).toBe(false)
	})

	test('every icon has a row in docs/credits-svg.md with its origin (traced from an AI sheet, or drawn by hand) and its source file', () => {
		for (const [name, origin] of Object.entries(ALL_ICON_ORIGINS)) {
			const row = rows.find(cells => cells[1] === `\`${name}\``)
			expect(`${name}: ${row ? 'listed' : 'missing'}`).toBe(`${name}: listed`)
			expect(row?.[2]).toBe(ORIGIN_LABEL[origin])
			expect(row?.[3]).toBe(`\`scripts/art/icons/${name}.svg\``)
		}
		for (const cells of rows) expect(Object.hasOwn(ALL_ICON_ORIGINS, (cells[1] ?? '').replaceAll('`', ''))).toBe(true)
	})

	test('the data modules hold exactly the icons of the pack, and each path is the one of its source file', async () => {
		const data = { ...MAKEUP_OBJECTS, ...LINE_DRAWINGS, ...ICONS } as Record<string, string>
		expect(Object.keys(data).sort()).toEqual(Object.keys(ALL_ICON_ORIGINS).sort())
		const sources = readdirSync(ICON_FOLDER)
			.filter(file => file.endsWith('.svg'))
			.map(file => file.slice(0, -4))
		expect(sources.sort()).toEqual(Object.keys(ALL_ICON_ORIGINS).sort())
		for (const name of sources) {
			const file = join(ICON_FOLDER, `${name}.svg`)
			expect(statSync(file).size).toBeLessThan(6 * 1024)
			expect(data[name]).toBe(await pathOf(readFileSync(file, 'utf8'), name))
		}
	})

	test('every SVG file of the art layer or of public/art is listed in the credits too', () => {
		const svgFiles = [...ART, ...PUBLIC_ART].filter(path => path.endsWith('.svg')).map(path => relative(ROOT, path))
		for (const file of svgFiles) expect(credits).toContain(file)
	})

	test('no inline <svg> outside the pack: the files that draw one are an explicit list', () => {
		/** Each file that may write an `<svg>` itself, and why. Anything else draws an icon of the pack. */
		const ALLOWED: Record<string, string> = {
			'components/art/graphics.tsx': 'the drawings, the print marks, the hairline, the frames and the glow of the kit',
			'components/art/IconPath.tsx': 'the one component that draws a path of the pack',
			'components/art/SwirlEllipse.tsx': 'the hand-drawn ellipse of the active entry (an effect, not an icon)',
			'components/art/RotatingBadge.tsx': 'the badge text on a circle (an effect, not an icon)',
			'components/home/HomeHero.tsx': 'the ring of the home hero (the hero is another work)',
			'components/home/GuidedSearch.tsx':
				'the chevron and the arrow of the form of the home hero (the hero is another work)',
			'components/blocks/Hero.tsx': 'the hero block, another work',
			'components/blocks/icons.tsx':
				'Heroicons of SearchBlock and DemoCard, left for the hero work: to replace with the pack',
		}
		const drawers = files(SRC)
			.filter(path => path.endsWith('.tsx') && readFileSync(path, 'utf8').includes('<svg'))
			.map(path => relative(SRC, path))
			.sort()
		expect(drawers).toEqual(Object.keys(ALLOWED).sort())
	})

	test('a client component draws an icon with IconPath and the constant it needs, never the map or the by-name Icon', () => {
		for (const path of files(SRC).filter(file => /\.tsx$/.test(file))) {
			const code = readFileSync(path, 'utf8')
			if (!/^['"]use client['"]/.test(code)) continue
			const imports = code.split('\n').filter(line => line.startsWith('import '))
			for (const line of imports) {
				expect(
					`${relative(ROOT, path)}: ${/art\/Icon'|\.\/Icon'|art\/graphics'|art\/drawings|\bICONS\b/.test(line)}`
				).toEndWith(': false')
			}
		}
	})

	test('no third-party icon set is left: no licence file, no IconPark code', () => {
		expect(existsSync(join(ROOT, 'LICENSES/IconPark-Apache-2.0.txt'))).toBe(false)
		for (const path of files(SRC).filter(file => /\.tsx?$/.test(file))) {
			const text = readFileSync(path, 'utf8')
			expect(`${relative(ROOT, path)}: ${/iconpark/i.test(text)}`).toEndWith(': false')
		}
	})

	test('the credits state that the pack is custom, made with fal, finished in VectorCraft, with no copyright claim', () => {
		expect(credits).toContain('sur mesure')
		expect(credits).toContain('fal')
		expect(credits).toContain('VectorCraft')
		expect(credits).toContain('aucun droit d’auteur')
		expect(credits).toContain('conditions de fal')
		expect(credits).toContain('OpenAI')
	})

	test('the data modules hold bare filled paths only: no stroke, colour, style, link, script or event attribute', () => {
		for (const file of ['drawings.ts', 'icons.ts']) {
			const data = readFileSync(join(SRC, 'components/art', file), 'utf8')
			const body = data.slice(data.indexOf('export const'))
			expect(body).not.toMatch(/\b(fill|stroke|style|href|xlink|onload|onclick|script|foreignObject)\b/i)
			expect(body).not.toMatch(/#[0-9a-f]{3,6}\b/i)
		}
	})
})

describe('the rules of the look', () => {
	const css = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')
	const kit = css.slice(css.indexOf('ART DIRECTION KIT'))

	test('nothing twinkles, bounces or pulses', () => {
		expect(kit).not.toMatch(/twinkle|bounce|pulse|wiggle|shake|elastic/i)
		for (const path of ART) expect(code(path)).not.toMatch(/animate-(bounce|ping|pulse)|twinkle/)
	})

	test('no neon: no glow made with a shadow or a blur, no saturated colour in the kit tokens', () => {
		expect(kit).not.toMatch(/text-shadow|drop-shadow|filter:\s*blur|hsl\(/)
		const theme = /@theme static \{([\s\S]*?)\}/.exec(kit)?.[1] ?? ''
		for (const [, hex] of theme.matchAll(/#([0-9a-f]{6})/g)) {
			const [r, g, b] = [0, 2, 4].map(index => Number.parseInt((hex ?? '').slice(index, index + 2), 16) / 255) as [
				number,
				number,
				number,
			]
			const max = Math.max(r, g, b)
			const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max
			// The most saturated colour of the kit is the indigo-violet band (79 % in HSV): that is the ceiling.
			expect(saturation).toBeLessThanOrEqual(0.8)
		}
	})

	test('the drawing data is only imported by server components', () => {
		for (const path of files(SRC).filter(file => /\.tsx?$/.test(file))) {
			const code = readFileSync(path, 'utf8')
			if (/^['"]use client['"]/.test(code) && /art\/drawings|\.\/drawings/.test(code))
				throw new Error(`${relative(ROOT, path)} is a client component that imports the drawing data`)
		}
	})

	test('the kit has a single client component: the pause button of the banner', () => {
		const clients = ART.filter(path => /^['"]use client['"]/.test(readFileSync(path, 'utf8'))).map(path =>
			relative(SRC, path)
		)
		expect(clients).toEqual(['components/art/MarqueePauseButton.tsx'])
	})

	test('fonts are self-hosted by next/font and declared for the whole site once: the public layout sets the variables, three files load a face', () => {
		const loaders = files(SRC).filter(
			path => /\.tsx?$/.test(path) && /from ['"]next\/font\/(google|local)['"]/.test(readFileSync(path, 'utf8'))
		)
		// The kit declares the faces once for the whole site; the preloaded pair of the routes that paint Bodoni above the fold
		// (content pages, blog, edit mode) stays in `direct-edit/fonts.ts`; the home hero « en arche » loads its own static
		// cuts, cut down to its text, from `home/hero-font.ts` (docs/accueil.md, « La police »): no other file loads a face.
		expect(loaders.map(path => relative(SRC, path)).sort()).toEqual([
			'components/art/fonts.ts',
			'components/direct-edit/fonts.ts',
			'components/home/hero-font.ts',
		])
		const layout = readFileSync(join(SRC, 'app/(front)/layout.tsx'), 'utf8')
		expect(layout).toContain('FONT_VARIABLES')
		expect(layout).toMatch(/<html lang="fr" className=\{FONT_VARIABLES\}>/)
		const fonts = code(join(SRC, 'components/art/fonts.ts'))
		for (const face of ['Bodoni_Moda', 'Instrument_Sans', 'Pinyon_Script']) expect(fonts).toContain(face)
		expect(fonts.match(/preload: false/g)).toHaveLength(3)
		expect(fonts.match(/display: 'swap'/g)).toHaveLength(3)
		// No stylesheet pulls a face from a font service.
		expect(
			files(SRC)
				.filter(path => /\.(tsx?|css)$/.test(path))
				.filter(path => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(path, 'utf8')))
		).toEqual([])
	})
})
