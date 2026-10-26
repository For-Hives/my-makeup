import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { LINE_DRAWINGS, MAKEUP_OBJECTS } from '@/components/art/drawings'

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

describe('the drawings are real, licensed, listed', () => {
	const credits = readFileSync(join(ROOT, 'docs/credits-svg.md'), 'utf8')
	const ACCEPTED = ['Apache-2.0', 'MIT', 'ISC', 'CC0-1.0']
	/** A credits row: | `name` | upstream file | author | SPDX licence | modification |. */
	const rows = credits
		.split('\n')
		.filter(line => line.startsWith('| `'))
		.map(line => line.split('|').map(cell => cell.trim()))

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

	test('every drawing of the data module has a row in docs/credits-svg.md with an accepted licence and an upstream file', () => {
		for (const name of [...Object.keys(MAKEUP_OBJECTS), ...Object.keys(LINE_DRAWINGS)]) {
			const row = rows.find(cells => cells[1] === `\`${name}\``)
			expect(`${name}: ${row ? 'listed' : 'missing'}`).toBe(`${name}: listed`)
			expect(ACCEPTED).toContain(row?.[4] ?? '')
			expect(row?.[2]).toMatch(/\.svg/)
		}
	})

	test('every SVG file of the art layer or of public/art is listed in the credits too, and nothing listed is missing from the code', () => {
		const files = [...ART, ...PUBLIC_ART].filter(path => path.endsWith('.svg')).map(path => relative(ROOT, path))
		for (const file of files) expect(credits).toContain(file)
		const names = new Set([...Object.keys(MAKEUP_OBJECTS), ...Object.keys(LINE_DRAWINGS)])
		for (const cells of rows) expect(names.has((cells[1] ?? '').replaceAll('`', ''))).toBe(true)
	})

	test('the licence texts the licences require are shipped, and the credits name the upstream commit', () => {
		const licence = readFileSync(join(ROOT, 'LICENSES/IconPark-Apache-2.0.txt'), 'utf8')
		expect(licence).toContain('Apache License')
		expect(licence).toContain('Copyright 2019-present Bytedance Inc.')
		expect(credits).toMatch(/[0-9a-f]{40}/)
	})

	test('the data module holds bare outline shapes only: no fill, colour, style, link, script or event attribute', () => {
		const data = readFileSync(join(SRC, 'components/art/drawings.ts'), 'utf8')
		const shapes = data.slice(data.indexOf('export const MAKEUP_OBJECTS'))
		expect(shapes).not.toMatch(/\b(fill|stroke|style|href|xlink|onload|onclick|script|foreignObject)\b/i)
		expect(shapes).not.toMatch(/#[0-9a-f]{3,6}\b/i)
		for (const [, tag] of shapes.matchAll(/tag: '([a-z]+)'/g))
			expect(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']).toContain(tag ?? '')
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

	test('fonts are self-hosted by next/font and declared for the whole site once: the public layout sets the variables, two files load a face', () => {
		const loaders = files(SRC).filter(
			path => /\.tsx?$/.test(path) && /from ['"]next\/font\/(google|local)['"]/.test(readFileSync(path, 'utf8'))
		)
		// The kit declares the faces once for the whole site; the preloaded pair of the routes that paint Bodoni above the fold
		// (content pages, blog, edit mode) stays in `direct-edit/fonts.ts`: no other file loads a face.
		expect(loaders.map(path => relative(SRC, path)).sort()).toEqual([
			'components/art/fonts.ts',
			'components/direct-edit/fonts.ts',
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
