'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconPath } from '@/components/art/IconPath'
import { ICON_ARROW_LEFT } from '@/components/art/icons'
import { backTarget } from '@/lib/dashboard/back-target'

/**
 * The back arrow of her space (27/10/2026), drawn once by the layout of `/auth`: top left, above the page. It is a plain
 * link to the home of her space (`backTarget`), so it works without JavaScript and never loops. A client component only
 * because the layout cannot read the address it is shown for; it draws nothing on the pages that have no way back
 * (sign-in, confirmation, her space itself). The icon is the `arrow-left` of the kit: its constant only, not the pack.
 *
 * The label is read by a screen reader everywhere and shown from `sm` up; the target is 44 px at least.
 */
export function BackArrow() {
	const target = backTarget(usePathname())
	if (target === null) return null
	return (
		<nav aria-label="Retour" data-testid="fleche-retour" className="border-hairline border-b bg-white">
			<div className="mx-auto flex w-full max-w-7xl px-2 sm:px-4 md:px-6">
				<Link
					href={target}
					prefetch={false}
					className="my-1 -ml-1 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 font-body font-semibold text-ink text-sm transition-colors hover:bg-nude-100 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 motion-reduce:transition-none"
				>
					<IconPath d={ICON_ARROW_LEFT} className="h-5 w-5 shrink-0" />
					<span className="sr-only sm:not-sr-only">Retour</span>
				</Link>
			</div>
		</nav>
	)
}
