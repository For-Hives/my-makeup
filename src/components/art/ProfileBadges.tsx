import Link from 'next/link'
import { BADGES_HELP_LINK, BADGES_HELP_PATH, SUPER_LABEL, VERIFIED_LABEL } from '@/lib/profile/badges'
import { Icon } from './graphics'

/** What the badges read of a profile: a card or a page, each key present only with its badge. */
export interface BadgeFlags {
	superMaquilleuse?: boolean
	verified?: boolean
}

const hasBadge = (flags: BadgeFlags): boolean => flags.superMaquilleuse === true || flags.verified === true

/**
 * « Super maquilleuse »: the stronger of the two badges, a solid night pill with white text. Words only, no picture
 * (no star: the kit forbids it). The label carries the meaning; the colour only helps.
 */
function SuperBadge() {
	return (
		<span
			data-badge="super"
			className="inline-flex items-center whitespace-nowrap rounded-full bg-art-night px-2.5 py-1 font-semibold text-[11.5px] text-white leading-tight"
		>
			{SUPER_LABEL}
		</span>
	)
}

/** « Vérifiée »: the sober one, a white pill with an ink outline and the shield of the kit as decoration. */
function VerifiedBadge() {
	return (
		<span
			data-badge="verified"
			className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-art-line bg-white px-2.5 py-1 font-medium text-[11.5px] text-ink leading-tight"
		>
			<Icon name="shield-check" className="h-3.5 w-3.5 flex-none" />
			{VERIFIED_LABEL}
		</span>
	)
}

/**
 * The badges of a card (issue 1170), « Super maquilleuse » first, « Vérifiée » beside it. They sit on the picture or on the
 * top edge of the card, never in the flow, so a card keeps its height with or without them, and nothing is drawn
 * without a badge. Server component, no motion.
 * - `photo` (default): bottom left of a wide photo; `narrow` stacks them under 768 px (a small photo).
 * - `edge`: straddling the top edge of the card, for the row card whose photo is too small to hold the words.
 */
export function PhotoBadges({
	flags,
	placement = 'photo',
	narrow = false,
}: {
	flags: BadgeFlags
	placement?: 'photo' | 'edge'
	narrow?: boolean
}) {
	if (!hasBadge(flags)) return null
	const place =
		placement === 'edge'
			? 'absolute -top-3.5 left-5 z-[3] flex items-center gap-1.5 md:left-6'
			: `absolute inset-x-2 bottom-3 z-[3] flex gap-1.5 md:inset-x-3.5 md:bottom-4 ${narrow ? 'flex-col items-start md:flex-row md:items-end' : 'items-end'}`
	return (
		<div className={place}>
			{flags.superMaquilleuse && <SuperBadge />}
			{flags.verified && <VerifiedBadge />}
		</div>
	)
}

/**
 * The badges in the head of a profile, with the link to what they mean (the legend of `/classement`). Nothing without a
 * badge, so the page of a profile without them is what it was.
 */
export function ProfileBadges({ flags }: { flags: BadgeFlags }) {
	if (!hasBadge(flags)) return null
	return (
		<div className="mt-1 flex max-w-full flex-col items-center gap-1 md:items-start">
			<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
				{flags.superMaquilleuse && <SuperBadge />}
				{flags.verified && <VerifiedBadge />}
			</div>
			<Link
				href={BADGES_HELP_PATH}
				className="inline-flex min-h-11 items-center font-semibold text-indigo-900 text-sm underline underline-offset-2"
			>
				{BADGES_HELP_LINK}
			</Link>
		</div>
	)
}
