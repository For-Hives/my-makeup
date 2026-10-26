/**
 * Rebuilds `src/components/art/drawings.ts` from the upstream icon files (issue 1134).
 *
 *   bun --no-env-file scripts/art/extract-drawings.ts <folder> [output file]
 *
 * `<folder>` holds one sub-folder per upstream set, each with the `icons.json` of the npm package `@iconify-json/<set>`
 * at the version pinned in `docs/credits-svg.md` (`npm pack @iconify-json/lucide@<version>`, then extract
 * `package/icons.json` into `<folder>/lucide/`). The packages are read from disk only: none is a dependency of the site.
 *
 * Every icon body is wrapped in an `<svg>` and parsed with the HTML rewriter (no pattern matching on markup), then
 * reduced to bare shapes: only path, rect, circle, ellipse, line, polyline and polygon survive, with their geometry
 * attributes and nothing else. Colours, stroke widths, fills, line caps, groups, scripts, styles, links and metadata
 * are dropped: the component draws every shape in `currentColor`, round ends, ONE stroke width for the whole family.
 * A shape that is a dot (a path ending in `h.01`, drawn by the upstream as a round-capped zero-length stroke) stays a
 * dot. A shape the upstream fills (no stroke) is refused: the family is an outline family.
 *
 * The list of drawings and the upstream icon of each one is `SOURCES` below; `docs/credits-svg.md` has the same list.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Upstream = readonly [set: 'iconoven' | 'lucide' | 'hugeicons', icon: string]

export const SOURCES = {
	objects: {
		lipstick: ['iconoven', 'lipstick'],
		brush: ['hugeicons', 'blush-brush-01'],
		compact: ['iconoven', 'compact-mirror'],
		mirror: ['iconoven', 'mirror'],
		mascara: ['iconoven', 'mascara'],
		'nail-polish': ['iconoven', 'nail-polish'],
		perfume: ['iconoven', 'perfume-bottle'],
		comb: ['iconoven', 'comb'],
	},
	lines: {
		lips: ['lucide', 'mouth'],
		eye: ['lucide', 'eye'],
	},
	icons: {
		'arrow-right': ['lucide', 'arrow-right'],
		'arrow-left': ['lucide', 'arrow-left'],
		play: ['lucide', 'play'],
		pause: ['lucide', 'pause'],
		search: ['lucide', 'search'],
		pin: ['lucide', 'map-pin'],
		seal: ['lucide', 'badge-check'],
		calendar: ['lucide', 'calendar'],
		'chevron-down': ['lucide', 'chevron-down'],
		menu: ['lucide', 'menu'],
		check: ['lucide', 'check'],
		close: ['lucide', 'x'],
		mail: ['lucide', 'mail'],
		phone: ['lucide', 'phone'],
		user: ['lucide', 'user'],
		heart: ['lucide', 'heart'],
		share: ['lucide', 'share-2'],
		star: ['lucide', 'star'],
	},
} as const satisfies Record<string, Record<string, Upstream>>

const GEOMETRY = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points']
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const NOT_DRAWN = new Set([
	'defs',
	'clippath',
	'mask',
	'lineargradient',
	'radialgradient',
	'filter',
	'style',
	'script',
	'metadata',
])

type Shape = Record<string, string>

/** The shapes of one icon body, in drawing order. */
export async function shapesOf(body: string, name: string): Promise<Shape[]> {
	const shapes: Shape[] = []
	let hidden = 0
	const rewriter = new HTMLRewriter().on('*', {
		element(element) {
			const tag = element.tagName.toLowerCase()
			if (NOT_DRAWN.has(tag)) {
				hidden += 1
				element.onEndTag(() => {
					hidden -= 1
				})
				return
			}
			if (hidden > 0 || !SHAPES.has(tag)) return
			const shape: Shape = { tag }
			for (const attribute of GEOMETRY) {
				const value = element.getAttribute(attribute)
				if (value !== null) shape[attribute] = value.replace(/\s+/g, ' ').trim()
			}
			shapes.push(shape)
		},
	})
	await rewriter
		.transform(new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`))
		.text()
	if (shapes.length === 0) throw new Error(`${name}: no shape`)
	// An outline family: an icon that fills a shape (no stroke anywhere in the upstream) is not one of ours.
	if (!/stroke=/.test(body)) throw new Error(`${name}: the upstream icon has no stroke`)
	return shapes
}

interface IconifySet {
	icons: Record<string, { body: string }>
	aliases?: Record<string, { parent: string }>
}

function bodyOf(folder: string, [set, icon]: Upstream): string {
	const data = JSON.parse(readFileSync(join(folder, set, 'icons.json'), 'utf8')) as IconifySet
	const found = data.icons[icon] ?? data.icons[data.aliases?.[icon]?.parent ?? '']
	if (!found) throw new Error(`${set}:${icon} is not in the upstream set`)
	return found.body
}

const HEADER = `/**
 * The drawings of the art direction: makeup objects, line drawings and the small interface icons, human-made outline
 * icons from three open-source families, licensed MIT (IconOven, Hugeicons) and ISC (Lucide): see docs/credits-svg.md
 * for every drawing, its upstream icon, author and licence, and LICENSES/ for the licence texts.
 *
 * MODIFIED from the upstream files (the MIT and ISC licences allow it): the colours, the stroke width, the line caps,
 * the groups and the fills are dropped (the component draws every shape in currentColor, round ends, ONE stroke width
 * for the whole family), and the markup is reduced to bare shapes. The 24 x 24 grid is kept as is, so every drawing has
 * the same scale and weight.
 *
 * This file is data only. It is built by scripts/art/extract-drawings.ts: do not edit it by hand.
 */

export type ShapeTag = 'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'

/** One bare shape: its tag and its geometry attributes, nothing else (no colour, no style, no link). */
export interface Shape {
	readonly tag: ShapeTag
	readonly [attribute: string]: string
}

export const DRAWING_VIEW_BOX = '0 0 24 24'
`

const EXPORTS = { objects: 'MAKEUP_OBJECTS', lines: 'LINE_DRAWINGS', icons: 'UI_ICONS' } as const

if (import.meta.main) {
	const [, , folder, output = 'src/components/art/drawings.ts'] = process.argv
	if (!folder) throw new Error('usage: extract-drawings.ts <folder of @iconify-json icons.json files> [output]')
	const body: string[] = []
	for (const [group, entries] of Object.entries(SOURCES)) {
		body.push(`export const ${EXPORTS[group as keyof typeof EXPORTS]} = {`)
		for (const [name, upstream] of Object.entries(entries as Record<string, Upstream>)) {
			const shapes = await shapesOf(bodyOf(folder, upstream), name)
			const key = /^[a-z]+$/.test(name) ? name : `'${name}'`
			body.push(`\t${key}: [`)
			for (const shape of shapes) {
				const { tag, ...attrs } = shape
				body.push(
					`\t\t{ tag: '${tag}', ${Object.entries(attrs)
						.map(([attribute, value]) => `${attribute}: '${value}'`)
						.join(', ')} },`
				)
			}
			body.push('\t],')
		}
		body.push('} as const satisfies Record<string, readonly Shape[]>', '')
	}
	body.push(
		'export type MakeupObjectName = keyof typeof MAKEUP_OBJECTS',
		'export type LineDrawingName = keyof typeof LINE_DRAWINGS',
		'export type IconName = keyof typeof UI_ICONS',
		''
	)
	writeFileSync(output, `${HEADER}\n${body.join('\n')}`)
}
