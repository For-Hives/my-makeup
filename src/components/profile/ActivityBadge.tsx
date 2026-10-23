import Link from 'next/link'
import { BADGE_HELP_LINK, BADGE_HELP_PATH, BADGE_LABEL, badgeChecked } from '@/lib/activity/badge-text'
import { longDate } from '@/lib/dashboard/contact-details'

function Check() {
	return (
		<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-700">
			<path
				fillRule="evenodd"
				d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
				clipRule="evenodd"
			/>
		</svg>
	)
}

/**
 * The sober badge « Activité vérifiée » (issue 1004): a text first, a check mark as decoration, neutral colours
 * (not the lipstick of what can be changed, not a colour of alert). It says what is checked and nothing about the
 * quality of her work. On a card it is a plain text, because the whole card is already a link.
 */
export function ActivityBadgePill({ size = 'normal' }: { size?: 'small' | 'normal' }) {
	return (
		<span
			className={`inline-flex max-w-full items-center gap-1 rounded-full border border-gray-300 bg-gray-50 font-medium text-gray-800 ${
				size === 'small' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
			}`}
		>
			<Check />
			<span className="min-w-0">{BADGE_LABEL}</span>
		</span>
	)
}

/**
 * The badge on a profile: the pill, what was checked and when, and the link « Qu'est-ce que c'est ? » to the
 * explanation. Nothing is drawn without the badge, so the page of a profile without it is what it was.
 */
export function ActivityBadge({ checkedAt }: { checkedAt: string | null }) {
	return (
		<div className="mt-1 flex max-w-full flex-col items-center gap-1 md:items-start">
			<ActivityBadgePill />
			<p className="max-w-prose text-gray-700 text-sm">
				{badgeChecked(longDate(checkedAt))}{' '}
				<Link
					href={BADGE_HELP_PATH}
					className="inline-flex min-h-11 items-center font-semibold text-indigo-900 underline underline-offset-2"
				>
					{BADGE_HELP_LINK}
				</Link>
			</p>
		</div>
	)
}
