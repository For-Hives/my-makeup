'use client'

import Link from 'next/link'
import { PREVIEW_PATH } from '@/lib/dashboard/preview'
import { useEditSession } from './EditSession'

/**
 * The bar above her page in edit mode (issue 1008): what she is doing, where the last save stands, and
 * the way to see the page as a visitor does. The line is a `role="status"`: a screen reader hears
 * « Enregistrement… », then « Enregistré à l’instant », and a failure.
 */
export function EditBar() {
	const { status } = useEditSession()
	const color =
		status.kind === 'saved'
			? 'text-ok'
			: status.kind === 'error'
				? 'text-lipstick'
				: status.kind === 'editing' || status.kind === 'saving'
					? 'text-warm'
					: 'text-mute'
	return (
		<section aria-label="Modification de ta page" className="border-hairline border-b bg-white font-body">
			<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 md:px-8">
				<p className="min-w-0 flex-1 basis-64 text-ink">
					<strong className="font-semibold">Tu modifies ta page.</strong>{' '}
					<span className="text-mute">Touche une zone pour la changer ; seule toi vois ces contrôles.</span>
				</p>
				<p role="status" data-testid="edit-status" className={`min-h-6 font-medium text-sm ${color}`}>
					{status.text}
				</p>
				<Link
					href={PREVIEW_PATH}
					className="flex min-h-11 items-center rounded-full border border-ink bg-white px-5 font-semibold text-ink text-sm focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2"
				>
					Voir comme une visiteuse
				</Link>
			</div>
		</section>
	)
}
