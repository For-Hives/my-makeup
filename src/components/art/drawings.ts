/**
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

export const MAKEUP_OBJECTS = {
	lipstick: [
		{ tag: 'path', d: 'M9.5 13.5V6.9a1 1 0 0 1 .5-.87l3.75-2.25a.5.5 0 0 1 .75.43v9.29Z' },
		{ tag: 'rect', x: '7.75', y: '13.5', width: '8.5', height: '7.75', rx: '1.5' },
		{ tag: 'path', d: 'M7.75 16.5h8.5' },
	],
	brush: [
		{
			tag: 'path',
			d: 'm8.065 11.032l-5.181 1.791c-2.448.915.851 5.134 1.946 6.224s5.502 4.536 6.421 2.101l1.743-5.212m-9.76.554l2.702-1.378m1.703 5.386l1.254-2.443m3.733-9.805l1.003-.998c.394-.392 1.082-.319 1.476.074l1.564 1.556a1 1 0 0 1 0 1.42l-1.002.997a2 2 0 0 0-.562 1.082l-.495 2.877c-.138.803-1.13 1.117-1.709.54l-4.538-4.787c-.58-.576-.474-1.5.333-1.637l2.892-.492c.412-.07.743-.339 1.038-.633m4.319.753l4.582-4.742c1.357-1.35-.508-3.1-1.808-1.807l-4.794 4.54',
		},
	],
	compact: [
		{ tag: 'circle', cx: '12', cy: '8', r: '5.25' },
		{ tag: 'path', d: 'M14.75 8a2.75 2.75 0 1 1-5.5 0a2.75 2.75 0 1 1 5.5 0' },
		{ tag: 'rect', x: '4.75', y: '15.5', width: '14.5', height: '5.75', rx: '2.75' },
		{ tag: 'path', d: 'M8.5 18.5h7' },
	],
	mirror: [
		{ tag: 'path', d: 'M12 2.75a5.75 5.25 0 1 1 0 10.5a5.75 5.25 0 1 1 0-10.5' },
		{ tag: 'rect', x: '10.75', y: '13.75', width: '2.5', height: '7.5', rx: '1.25' },
		{ tag: 'path', d: 'M12 5.25a3.25 2.75 0 1 1 0 5.5a3.25 2.75 0 1 1 0-5.5' },
		{ tag: 'path', d: 'M10.75 9.25A1.25 1.25 0 0 1 12 8' },
	],
	mascara: [
		{ tag: 'rect', x: '10', y: '2.75', width: '4', height: '5.5', rx: '1.5' },
		{ tag: 'path', d: 'M10 5.5h4m-2 3.75v2.25' },
		{ tag: 'rect', x: '9', y: '11.75', width: '6', height: '9.5', rx: '1.5' },
		{ tag: 'path', d: 'M9 14.75h6' },
	],
	'nail-polish': [
		{ tag: 'rect', x: '9.5', y: '2.75', width: '5', height: '6.5', rx: '1.25' },
		{ tag: 'rect', x: '6.25', y: '11.75', width: '11.5', height: '9.5', rx: '2.5' },
		{ tag: 'path', d: 'M9.25 16.5h5.5' },
	],
	perfume: [
		{ tag: 'rect', x: '9', y: '2.75', width: '6', height: '3.5', rx: '1' },
		{ tag: 'rect', x: '10.5', y: '6.25', width: '3', height: '4.25', rx: '.5' },
		{ tag: 'rect', x: '5.75', y: '10.5', width: '12.5', height: '10.75', rx: '2.5' },
		{ tag: 'path', d: 'M18.5 4.5h.01' },
	],
	comb: [
		{ tag: 'rect', x: '2.75', y: '5.25', width: '18.5', height: '4.5', rx: '1.5' },
		{ tag: 'path', d: 'M5 9.75v8.5m2.5-8.5v9.5m2.5-9.5v9.5m2.5-9.5v9.5m2.5-9.5v9.5m2.5-9.5v9.5m2.5-9.5v8.5' },
	],
} as const satisfies Record<string, readonly Shape[]>

export const LINE_DRAWINGS = {
	lips: [
		{ tag: 'path', d: 'M2 12a50.5 50.5 0 0 0 20 0a1 1 0 0 0-1-1' },
		{
			tag: 'path',
			d: 'M2.457 11.159a1 1 0 0 0-.307 1.369a11.59 11.59 0 0 0 19.7 0a1 1 0 0 0-.308-1.368c-2.426-1.568-3.65-2.284-5.479-3.644a2.6 2.6 0 0 0-3.373.208a1 1 0 0 1-1.38 0a2.62 2.62 0 0 0-3.373-.208c-1.83 1.36-3.053 2.076-5.48 3.643',
		},
	],
	eye: [
		{
			tag: 'path',
			d: 'M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0',
		},
		{ tag: 'circle', cx: '12', cy: '12', r: '3' },
	],
} as const satisfies Record<string, readonly Shape[]>

export const UI_ICONS = {
	'arrow-right': [{ tag: 'path', d: 'M5 12h14m-7-7l7 7l-7 7' }],
	'arrow-left': [{ tag: 'path', d: 'm12 19l-7-7l7-7m7 7H5' }],
	play: [{ tag: 'path', d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }],
	pause: [
		{ tag: 'rect', x: '14', y: '3', width: '5', height: '18', rx: '1' },
		{ tag: 'rect', x: '5', y: '3', width: '5', height: '18', rx: '1' },
	],
	search: [
		{ tag: 'path', d: 'm21 21l-4.34-4.34' },
		{ tag: 'circle', cx: '11', cy: '11', r: '8' },
	],
	pin: [
		{
			tag: 'path',
			d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
		},
		{ tag: 'circle', cx: '12', cy: '10', r: '3' },
	],
	seal: [
		{
			tag: 'path',
			d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77a4 4 0 0 1 6.74 0a4 4 0 0 1 4.78 4.78a4 4 0 0 1 0 6.74a4 4 0 0 1-4.77 4.78a4 4 0 0 1-6.75 0a4 4 0 0 1-4.78-4.77a4 4 0 0 1 0-6.76',
		},
		{ tag: 'path', d: 'm16 9l-5.5 5.5L8 12' },
	],
	calendar: [
		{ tag: 'path', d: 'M8 2v3m8-3v3' },
		{ tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2' },
		{ tag: 'path', d: 'M3 9h18' },
	],
	'chevron-down': [{ tag: 'path', d: 'm6 9l6 6l6-6' }],
	menu: [{ tag: 'path', d: 'M4 5h16M4 12h16M4 19h16' }],
	check: [{ tag: 'path', d: 'M20 6L9 17l-5-5' }],
	close: [{ tag: 'path', d: 'M18 6L6 18M6 6l12 12' }],
	mail: [
		{ tag: 'path', d: 'm22 7l-8.991 5.727a2 2 0 0 1-2.009 0L2 7' },
		{ tag: 'rect', x: '2', y: '4', width: '20', height: '16', rx: '2' },
	],
	phone: [
		{
			tag: 'path',
			d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233a14 14 0 0 0 6.392 6.384',
		},
	],
	user: [
		{ tag: 'path', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' },
		{ tag: 'circle', cx: '12', cy: '7', r: '4' },
	],
	heart: [
		{
			tag: 'path',
			d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676a.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
		},
	],
	share: [
		{ tag: 'circle', cx: '18', cy: '5', r: '3' },
		{ tag: 'circle', cx: '6', cy: '12', r: '3' },
		{ tag: 'circle', cx: '18', cy: '19', r: '3' },
		{ tag: 'path', d: 'm8.59 13.51l6.83 3.98m-.01-10.98l-6.82 3.98' },
	],
	star: [
		{
			tag: 'path',
			d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z',
		},
	],
} as const satisfies Record<string, readonly Shape[]>

export type MakeupObjectName = keyof typeof MAKEUP_OBJECTS
export type LineDrawingName = keyof typeof LINE_DRAWINGS
export type IconName = keyof typeof UI_ICONS
