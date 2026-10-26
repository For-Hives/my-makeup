import Link from 'next/link'
import { useId } from 'react'
import { Icon } from './graphics'

/**
 * The circular badge with text running round it and a round link in the middle. The ring turns slowly (26 s, only
 * with `prefers-reduced-motion: no-preference`: otherwise it stands still), the text is decoration (`aria-hidden`: the
 * link says it with `label`), the centre is a 56 px target. Pass `href` and `label` for the link, or neither for a
 * badge that only decorates. `text` runs once round the circle (spaced to fill it): 20 to 30 characters read well.
 */
export function RotatingBadge({
	text,
	href,
	label,
	className = 'h-30 w-30',
}: {
	text: string
	href?: string
	label?: string
	className?: string
}) {
	const id = useId()
	const path = `${id}-circle`
	const phrase = `${text.toUpperCase()} · `
	return (
		<div className={`relative text-ink ${className}`}>
			<svg
				aria-hidden="true"
				focusable="false"
				viewBox="0 0 120 120"
				className="art-spin absolute inset-0 h-full w-full font-body"
			>
				<path id={path} d="M60 60m-42 0a42 42 0 1 1 84 0a42 42 0 1 1 -84 0" fill="none" />
				<text fontSize="9.2" fill="currentColor" fontWeight="600">
					<textPath href={`#${path}`} textLength="262" lengthAdjust="spacing">
						{phrase}
					</textPath>
				</text>
			</svg>
			{href && label ? (
				<Link
					href={href}
					aria-label={label}
					className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-ink text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700"
				>
					<Icon name="arrow-right" className="art-arrow h-5 w-5" />
				</Link>
			) : (
				<span
					aria-hidden="true"
					className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-ink text-white"
				>
					<Icon name="arrow-right" className="h-5 w-5" />
				</span>
			)}
		</div>
	)
}
