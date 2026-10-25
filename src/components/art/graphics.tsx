import {
	LINE_DRAWINGS,
	type LineDrawingName,
	MAKEUP_OBJECTS,
	type MakeupObjectName,
	SWASHES,
	type SwashName,
} from './generated-art'

/**
 * The drawn assets of the art direction (issue 1111). Every one is decoration: `aria-hidden`, no `<title>`, drawn in
 * `currentColor` so a class sets its colour. None of them twinkles, spins or moves by itself. The kit's first
 * version had 4-point sparkles and thin-line flowers; the owner did not like them, they are gone for good and a test
 * refuses to bring them back (tests/unit/art-forbidden.test.ts). What replaces them:
 *
 * - print marks (`PrintMark`): a fine plus, a small open circle, a dot, a short brush-stroke dash, like the registration
 *   marks of a printed page. Very sparse: two or three per section at most.
 * - one-line drawings of lips, an eye, a profile and a hand holding a brush (`LineDrawing`), and organic brush-stroke
 *   swashes (`Swash`): fashion and editorial, never botanical.
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

/** The small interface icons of the kit: 24 px grid, 1.6 stroke, round ends. */
export type IconName =
	| 'arrow-right'
	| 'arrow-left'
	| 'play'
	| 'pause'
	| 'search'
	| 'pin'
	| 'seal'
	| 'calendar'
	| 'chevron-down'
	| 'menu'

const ICONS: Record<IconName, React.ReactNode> = {
	'arrow-right': <path d="M4 12H20M14 6L20 12L14 18" />,
	'arrow-left': <path d="M20 12H4M10 6L4 12L10 18" />,
	play: <path d="M7 4.5L19 12L7 19.5Z" fill="currentColor" stroke="none" />,
	pause: <path d="M8 5V19M16 5V19" />,
	search: (
		<>
			<circle cx="11" cy="11" r="6.5" />
			<path d="M16 16L21 21" />
		</>
	),
	pin: (
		<>
			<path d="M12 21C7 15.5 5 12.5 5 9.5A7 7 0 0 1 19 9.5C19 12.5 17 15.5 12 21Z" />
			<circle cx="12" cy="9.5" r="2.4" />
		</>
	),
	seal: (
		<>
			<path d="M12 2.5L14.6 4.4L17.8 4.2L18.8 7.2L21.4 9.1L20.4 12L21.4 14.9L18.8 16.8L17.8 19.8L14.6 19.6L12 21.5L9.4 19.6L6.2 19.8L5.2 16.8L2.6 14.9L3.6 12L2.6 9.1L5.2 7.2L6.2 4.2L9.4 4.4Z" />
			<path d="M8.2 12.2L11 15L16 9.4" />
		</>
	),
	calendar: (
		<>
			<rect x="3.5" y="5" width="17" height="15" rx="3" />
			<path d="M3.5 10H20.5M8 3V7M16 3V7" />
		</>
	),
	'chevron-down': <path d="M6 9L12 15L18 9" />,
	menu: <path d="M4 8H20M4 16H20" />,
}

export function Icon({ name, className = 'h-5 w-5' }: DecorProps & { name: IconName }) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			{ICONS[name]}
		</svg>
	)
}

function Generated({ shape, className }: DecorProps & { shape: { viewBox: string; d: string } }) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox={shape.viewBox}
			fill="currentColor"
			className={className}
			preserveAspectRatio="xMidYMid meet"
		>
			<path fillRule="evenodd" d={shape.d} />
		</svg>
	)
}

/** A makeup object drawn as a clean outline (brush, lipstick, compact, mirror, sponge, mascara, nail polish, eyelash curler). */
export function MakeupObject({ name, className = 'h-full w-full' }: DecorProps & { name: MakeupObjectName }) {
	return <Generated shape={MAKEUP_OBJECTS[name]} className={className} />
}

/** A one-line drawing: lips, an eye, a profile, a hand holding a brush. */
export function LineDrawing({ name, className = 'h-full w-full' }: DecorProps & { name: LineDrawingName }) {
	return <Generated shape={LINE_DRAWINGS[name]} className={className} />
}

/** An organic brush-stroke swash, a filled stroke, to underline or to frame. */
export function Swash({ name, className = 'h-6 w-40' }: DecorProps & { name: SwashName }) {
	return <Generated shape={SWASHES[name]} className={className} />
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
