/**
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

export const MAKEUP_OBJECTS = {
	lipstick: [
		{
			tag: 'path',
			d: 'M39.4346 5.32275L40.8488 6.73697C42.4109 8.29906 42.4109 10.8317 40.8488 12.3938L33.7777 19.4649L29.5351 15.2222L39.4346 5.32275Z',
		},
		{ tag: 'rect', x: '28.1211', y: '13.8076', width: '10', height: '16', transform: 'rotate(45 28.1211 13.8076)' },
		{ tag: 'rect', x: '15.3936', y: '23.7075', width: '14', height: '14', transform: 'rotate(45 15.3936 23.7075)' },
	],
	brush: [
		{
			tag: 'path',
			d: 'M16.0991 25.8287L38.7265 6.02967C38.7265 6.02967 40.8478 3.90835 42.9691 6.02967C45.0904 8.15099 42.9691 10.2723 42.9691 10.2723L23.1701 32.8997L16.0991 25.8287Z',
		},
		{ tag: 'path', d: 'M22.4639 20.8789L28.1207 26.5358' },
		{
			tag: 'path',
			d: 'M5.49331 30.7782L16.0999 25.8284L23.171 32.8995L18.2212 43.5061C18.2212 43.5061 13.2715 44.2132 9.02884 39.9706C4.7862 35.7279 5.49331 30.7782 5.49331 30.7782Z',
		},
		{ tag: 'path', d: 'M6.90783 36.4349L11.8576 34.3136' },
		{ tag: 'path', d: 'M12.5653 42.0921L13.9795 39.2637' },
		{ tag: 'path', d: 'M18.9291 23.3536L21.7575 20.8787L24.586 18.4038' },
		{ tag: 'path', d: 'M30.5957 24.4141L28.1208 27.2425L25.646 30.0709' },
	],
	compact: [
		{ tag: 'ellipse', rx: '16', ry: '6', cx: '24', cy: '30' },
		{ tag: 'ellipse', rx: '16', ry: '10', cx: '24', cy: '14' },
		{ tag: 'path', d: 'M23 10L18 13' },
		{ tag: 'path', d: 'M30 14L25 17' },
		{ tag: 'path', d: 'M40 38C40 41.3137 32.8366 44 24 44C15.1634 44 8 41.3137 8 38' },
		{ tag: 'path', d: 'M40 38V30' },
		{ tag: 'path', d: 'M8 38V30' },
	],
	mirror: [
		{ tag: 'circle', cx: '24', cy: '17', r: '13' },
		{ tag: 'path', d: 'M42 17C42 26.9411 33.9411 35 24 35C14.0589 35 6 26.9411 6 17' },
		{ tag: 'path', d: 'M42 17H38' },
		{ tag: 'path', d: 'M10 17H6' },
		{ tag: 'path', d: 'M30 44H18' },
		{ tag: 'path', d: 'M24 44V36' },
	],
	mascara: [
		{ tag: 'rect', x: '28', y: '16', width: '12', height: '28' },
		{ tag: 'rect', x: '8', y: '28', width: '12', height: '16' },
		{ tag: 'path', d: 'M14 4V28' },
		{ tag: 'path', d: 'M20 36H8' },
		{ tag: 'path', d: 'M20 32V40' },
		{ tag: 'path', d: 'M8 32V40' },
		{ tag: 'path', d: 'M18 9H10' },
		{ tag: 'path', d: 'M20 15L8 15' },
		{ tag: 'path', d: 'M18 21H10' },
	],
	'nail-polish': [
		{ tag: 'rect', x: '8', y: '20', width: '32', height: '24', rx: '2' },
		{ tag: 'rect', x: '17', y: '4', width: '14', height: '16' },
		{ tag: 'path', d: 'M22 32H26L27 37H21L22 32Z' },
		{ tag: 'path', d: 'M24 20V32' },
		{ tag: 'path', d: 'M31 20H17' },
	],
	perfume: [
		{ tag: 'rect', x: '16', y: '4', width: '16', height: '10', rx: '3' },
		{ tag: 'rect', x: '6', y: '20', width: '36', height: '24', rx: '12' },
		{ tag: 'path', d: 'M6 32.9999C9.04225 29.1325 18 29.9999 24 31.9999C30 33.9999 38 36.9999 42 31.9999' },
	],
	comb: [
		{ tag: 'path', d: 'M4.20117 31.0713L16.9291 43.7992L43.7992 16.9292L31.0712 4.20123' },
		{ tag: 'path', d: 'M9.15137 26.1221L16.2224 33.1931' },
		{ tag: 'path', d: 'M14.8076 20.4653L21.8787 27.5364' },
		{ tag: 'path', d: 'M20.4648 14.8081L27.5359 21.8792' },
		{ tag: 'path', d: 'M26.1211 9.15137L33.1922 16.2224' },
		{ tag: 'path', d: 'M12.6865 39.5566L39.5566 12.6866' },
	],
} as const satisfies Record<string, readonly Shape[]>

export const LINE_DRAWINGS = {
	lips: [
		{
			tag: 'path',
			d: 'M4 24C4 24 10 15 14 15C18 15 22 17 24 17C26 17 30 15 34 15C38 15 44 24 44 24C44 24 34 34 24 34C14 34 4 24 4 24Z',
		},
		{ tag: 'path', d: 'M4 24H44' },
	],
	eye: [
		{
			tag: 'path',
			d: 'M24 40C33.9411 40 42 30 42 30C42 30 33.9411 20 24 20C14.0589 20 6 30 6 30C6 30 14.0589 40 24 40Z',
		},
		{
			tag: 'path',
			d: 'M24 34C26.2091 34 28 32.2091 28 30C28 27.7909 26.2091 26 24 26C21.7909 26 20 27.7909 20 30C20 32.2091 21.7909 34 24 34Z',
		},
		{
			tag: 'path',
			d: 'M28.0001 6C21 6 10.0001 9.5 7.00005 12C4.00005 14.5 5.99999 19 8.00005 18C10.0001 17 23.2001 12.2 28.0001 11C32.8001 9.8 39.6667 11.8333 42 13C39.6667 11 35.0001 6 28.0001 6Z',
		},
	],
} as const satisfies Record<string, readonly Shape[]>

export type MakeupObjectName = keyof typeof MAKEUP_OBJECTS
export type LineDrawingName = keyof typeof LINE_DRAWINGS
