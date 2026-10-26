import { IconPath } from './IconPath'
import { ICONS, type IconName } from './icons'

export type { IconName }

/**
 * An interface icon of the pack by name (arrows, chevrons, menu, close, search, pin, check, calendar, mail...): the same
 * family and weight as the drawings, drawn by us. Decoration (`aria-hidden`): the control that holds it carries the
 * accessible name. For SERVER components only: it reads the whole map of paths. A client component imports the constant
 * of the icon it draws and uses `IconPath`.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
	return <IconPath d={ICONS[name]} className={className} />
}
