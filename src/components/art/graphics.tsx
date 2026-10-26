import { createElement } from 'react'
import {
	DRAWING_VIEW_BOX,
	type IconName,
	LINE_DRAWINGS,
	type LineDrawingName,
	MAKEUP_OBJECTS,
	type MakeupObjectName,
	type Shape,
	UI_ICONS,
} from './drawings'

export type { IconName }

/**
 * The drawn assets of the art direction (issue 1111). Every one is decoration: `aria-hidden`, no `<title>`, drawn in
 * `currentColor` so a class sets its colour. None of them twinkles, spins or moves by itself. The kit's first
 * version had 4-point sparkles and thin-line flowers; the owner did not like them, they are gone for good and a test
 * refuses to bring them back (tests/unit/art-forbidden.test.ts). What replaces them:
 *
 * - print marks (`PrintMark`): a fine plus, a small open circle, a dot, a short brush-stroke dash, like the registration
 *   marks of a printed page. Very sparse: two or three per section at most.
 * - makeup objects (`MakeupObject`), line drawings of lips and an eye (`LineDrawing`) and the small interface icons
 *   (`Icon`): real, human-made, fine outline icons on one 24 grid and one stroke weight (IconOven and Hugeicons: MIT,
 *   Lucide: ISC, docs/credits-svg.md), never drawn by an AI model, never botanical.
 */

interface DecorProps {
	className?: string
}

/** Print marks: the four registration-style marks, sparse and still. */
export type PrintMarkKind = 'plus' | 'ring' | 'dot' | 'dash'

const PRINT_MARKS: Record<PrintMarkKind, React.ReactNode> = {
	plus: <path d="M12 3.5V20.5M3.5 12H20.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
	ring: <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />,
	dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
	dash: (
		<path
			d="M3.5 15.5C8 11.5 14 10.5 20.5 8"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
		/>
	),
}

export function PrintMark({ kind = 'plus', className = 'h-4 w-4' }: DecorProps & { kind?: PrintMarkKind }) {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className}>
			{PRINT_MARKS[kind]}
		</svg>
	)
}

/**
 * One drawing of the family: bare shapes on a 24 grid, an outline in `currentColor` with round ends. The stroke width
 * is the CSS variable `--art-drawing-stroke` (`.art-drawing`, globals.css), the same for every drawing, so the whole
 * set has one weight; a class on the parent may change it.
 */
function Drawing({ shapes, className, filled }: DecorProps & { shapes: readonly Shape[]; filled?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox={DRAWING_VIEW_BOX}
			fill={filled ? 'currentColor' : 'none'}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={`art-drawing ${className ?? ''}`.trim()}
			preserveAspectRatio="xMidYMid meet"
		>
			{shapes.map(({ tag, ...attributes }) => createElement(tag, { key: JSON.stringify(attributes), ...attributes }))}
		</svg>
	)
}

/** The small interface icons of the kit: the same grid, stroke and round ends as the drawings (`play` is solid). */
export function Icon({ name, className = 'h-5 w-5' }: DecorProps & { name: IconName }) {
	return <Drawing shapes={UI_ICONS[name]} className={className} filled={name === 'play'} />
}

/** A makeup object as an outline: brush, lipstick, compact, mirror, mascara, nail polish, perfume, comb. */
export function MakeupObject({ name, className = 'h-full w-full' }: DecorProps & { name: MakeupObjectName }) {
	return <Drawing shapes={MAKEUP_OBJECTS[name]} className={className} />
}

/** A line drawing, in the same family and weight as the objects: lips, an eye. */
export function LineDrawing({ name, className = 'h-full w-full' }: DecorProps & { name: LineDrawingName }) {
	return <Drawing shapes={LINE_DRAWINGS[name]} className={className} />
}

/** A hairline rule; `marks` puts a fine plus in the middle, `dots` three dots. */
export function Hairline({
	variant = 'line',
	className = 'h-3 w-full',
}: DecorProps & { variant?: 'line' | 'dots' | 'marks' }) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 400 12"
			preserveAspectRatio="none"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			vectorEffect="non-scaling-stroke"
		>
			{variant === 'line' && <path d="M0 6H400" vectorEffect="non-scaling-stroke" />}
			{variant === 'dots' && (
				<>
					<path d="M0 6H150M250 6H400" vectorEffect="non-scaling-stroke" />
					<circle cx="180" cy="6" r="2" fill="currentColor" stroke="none" />
					<circle cx="200" cy="6" r="3" fill="currentColor" stroke="none" />
					<circle cx="220" cy="6" r="2" fill="currentColor" stroke="none" />
				</>
			)}
			{variant === 'marks' && (
				<>
					<path d="M0 6H182M218 6H400" vectorEffect="non-scaling-stroke" />
					<path d="M200 1V11M195 6H205" vectorEffect="non-scaling-stroke" />
				</>
			)}
		</svg>
	)
}

export { SwirlEllipse } from './SwirlEllipse'

/** The arch frame as a standalone asset: the arch, the band offset behind it, an inner hairline. Colours are classes. */
export function ArchFrame({
	bandClassName = 'fill-art-band',
	fillClassName = 'fill-art-blush-50',
	className = 'h-full',
}: DecorProps & { bandClassName?: string; fillClassName?: string }) {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 320 400" className={className}>
			<path d="M48 400V126A120 120 0 0 1 288 126V400Z" className={bandClassName} />
			<path d="M20 400V140A120 120 0 0 1 260 140V400Z" className={fillClassName} stroke="#fff" strokeWidth="2" />
			<path d="M30 394V142A110 110 0 0 1 250 142V394" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35" />
		</svg>
	)
}

/** The capsule frame as a standalone asset: a pill, a solid offset, an inner hairline. */
export function CapsuleFrame({
	bandClassName = 'fill-indigo-200',
	fillClassName = 'fill-art-blush-50',
	className = 'h-full',
}: DecorProps & { bandClassName?: string; fillClassName?: string }) {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 184 100" className={className}>
			<rect x="12" y="14" width="160" height="76" rx="38" className={bandClassName} />
			<rect x="6" y="8" width="160" height="76" rx="38" className={fillClassName} stroke="#fff" strokeWidth="3" />
			<rect
				x="12"
				y="14"
				width="148"
				height="64"
				rx="32"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				opacity=".5"
			/>
		</svg>
	)
}

/**
 * A glow: a very soft coloured light behind a section, drawn by a radial gradient (`.art-glow`, globals.css). Three
 * sizes, all large and wide so the colour is seen and no edge is. Position it with `className`; the parent clips it
 * (`overflow-hidden`) and the glow never takes a click.
 */
export function GlowBlob({
	size = 'md',
	tone = 'rose',
	className = '',
}: DecorProps & { size?: 'sm' | 'md' | 'lg'; tone?: 'rose' | 'indigo' | 'blush' }) {
	return <span aria-hidden="true" data-size={size} data-tone={tone} className={`art-glow ${className}`} />
}
