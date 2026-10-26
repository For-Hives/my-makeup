import { ICONS, type IconName } from './icons'

export type { IconName }

/**
 * An interface icon of the pack (arrows, chevrons, menu, close, search, pin, check, calendar, mail...): the same family
 * and weight as the drawings, drawn by us. A single filled path on a 24 grid in `currentColor`: a class sets the size
 * and the colour. Decoration (`aria-hidden`): the control that holds it carries the accessible name. This file imports
 * the icon data only, so a client component may draw an icon without shipping the drawings.
 */
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className={className}>
			<path fillRule="evenodd" d={ICONS[name]} />
		</svg>
	)
}
