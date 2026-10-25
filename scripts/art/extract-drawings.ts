/**
 * Rebuilds `src/components/art/drawings.ts` from the upstream IconPark SVG files (Apache-2.0, ByteDance).
 *
 *   bun --no-env-file scripts/art/extract-drawings.ts <path to a checkout of bytedance/IconPark> [output file]
 *
 * Every file is parsed with the HTML rewriter (no pattern matching on markup), then reduced to bare shapes: only
 * path, rect, circle, ellipse, line, polyline and polygon survive, with their geometry attributes and nothing else.
 * Gradients, clip paths, masks, scripts, styles, links, metadata and comments are dropped. Colours and stroke
 * widths are not kept: the component draws every shape with `currentColor`, round ends and one stroke width.
 * The list of drawings and the upstream file of each one are below; `docs/credits-svg.md` has the same list.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SOURCES = {
	objects: {
		lipstick: 'Makeups/lipstick-one',
		brush: 'Makeups/cosmetic-brush',
		compact: 'Makeups/face-powder',
		mirror: 'Makeups/mirror-two',
		mascara: 'Makeups/mascara',
		'nail-polish': 'Makeups/nail-polish-one',
		perfume: 'Clothes/perfume',
		comb: 'Makeups/comb',
	},
	lines: {
		lips: 'Makeups/mouth',
		eye: 'Makeups/eyebrow',
	},
} as const

const GEOMETRY = [
	'd',
	'x',
	'y',
	'width',
	'height',
	'rx',
	'ry',
	'cx',
	'cy',
	'r',
	'x1',
	'y1',
	'x2',
	'y2',
	'points',
	'transform',
]
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

async function shapesOf(svg: string, name: string): Promise<Shape[]> {
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
			// A shape with no stroke is a fill-only detail of the two-tone original (a white hole, a highlight): outline
			// drawings have no fills, so it is left out.
			if (!element.getAttribute('stroke')) return
			const shape: Shape = { tag }
			for (const attribute of GEOMETRY) {
				const value = element.getAttribute(attribute)
				if (value !== null) shape[attribute] = value.replace(/\s+/g, ' ').trim()
			}
			shapes.push(shape)
		},
	})
	await rewriter.transform(new Response(svg)).text()
	if (shapes.length === 0) throw new Error(`${name}: no shape`)
	return shapes
}

const [, , upstream, output = 'src/components/art/drawings.ts'] = process.argv
if (!upstream) throw new Error('usage: extract-drawings.ts <IconPark checkout> [output]')

const HEADER = `/**
 * The drawings of the art direction: makeup objects and line drawings, in ONE family, the "IconPark" outline icons
 * by ByteDance, human-made, licensed Apache-2.0 (https://github.com/bytedance/IconPark, LICENSE in
 * LICENSES/IconPark-Apache-2.0.txt). Every drawing, its source file and its licence are listed in docs/credits-svg.md.
 *
 * MODIFIED from the upstream files (Apache-2.0 section 4(b)): the two-tone fills are removed (outline only, the
 * white detail strokes are kept as lines), the colours, the stroke width, the line caps and the clip path are dropped
 * (the component draws every shape in currentColor, round ends, one stroke width), and the markup is reduced to bare
 * shapes. The 48 x 48 grid is kept as is, so every drawing has the same scale and weight.
 *
 * This file is data only. It is built by scripts/art/extract-drawings.ts: do not edit it by hand.
 */

export type ShapeTag = 'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'

/** One bare shape: its tag and its geometry attributes, nothing else (no colour, no style, no link). */
export interface Shape {
	readonly tag: ShapeTag
	readonly [attribute: string]: string
}

export const DRAWING_VIEW_BOX = '0 0 48 48'
`

const body: string[] = []
for (const [group, entries] of Object.entries(SOURCES)) {
	body.push(`export const ${group === 'objects' ? 'MAKEUP_OBJECTS' : 'LINE_DRAWINGS'} = {`)
	for (const [name, file] of Object.entries(entries)) {
		const shapes = await shapesOf(readFileSync(join(upstream, 'source', `${file}.svg`), 'utf8'), name)
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
	''
)
writeFileSync(output, `${HEADER}\n${body.join('\n')}`)
