'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import { ACCOUNT_PATH, previewPath } from '@/lib/direct-edit/edit-mode'
import { useEditSession } from './EditSession'

const MODE_BASE =
	'flex min-h-11 items-center justify-center px-5 font-semibold text-sm focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'

/**
 * The bar above her page in edit mode (issues 1008 and 1022): what she is doing, where the last save stands, the
 * two modes of the page (« Édition » where she is, « Aperçu » to see it as a visitor does) and the way to her
 * account. The line of the save is a `role="status"`: a screen reader hears « Enregistrement… », then
 * « Enregistré à l’instant », and a failure.
 *
 * The two links leave the page through the session, which asks first when a block holds changes not
 * saved: a link of the router does not trigger the warning of the browser, and what she typed would be lost.
 */
export function EditBar() {
	const { status, leave } = useEditSession()
	const color =
		status.kind === 'saved'
			? 'text-ok'
			: status.kind === 'error'
				? 'text-lipstick'
				: status.kind === 'editing' || status.kind === 'saving'
					? 'text-warm'
					: 'text-mute'
	/** A plain click goes through the session; a click that opens another tab or window is left to the browser. */
	const go = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		leave(href)
	}
	return (
		<section aria-label="Modification de ta page" className="border-hairline border-b bg-white font-body">
			<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 md:px-8">
				<p className="min-w-0 flex-1 basis-64 text-ink">
					<strong className="font-semibold">Tu modifies ta page.</strong>{' '}
					<span className="text-mute">Touche une zone pour la changer ; seule toi vois ces contrôles.</span>
				</p>
				<p
					role="status"
					data-testid="edit-status"
					className={`flex min-h-6 items-center gap-2 font-medium text-sm ${color}`}
				>
					{status.kind === 'resting' ? null : (
						<span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
					)}
					{status.text}
				</p>
				<nav aria-label="Mode de la page" className="flex flex-wrap items-center gap-3">
					<div className="flex overflow-hidden rounded-full border border-ink">
						<span data-testid="mode-edition" aria-current="page" className={`${MODE_BASE} bg-ink text-white`}>
							Édition
						</span>
						<Link
							href={previewPath()}
							data-testid="mode-apercu"
							onClick={go(previewPath())}
							className={`${MODE_BASE} bg-white text-ink`}
						>
							Aperçu
						</Link>
					</div>
					<Link
						href={ACCOUNT_PATH}
						data-testid="mon-compte"
						onClick={go(ACCOUNT_PATH)}
						className="flex min-h-11 items-center rounded-full px-3 font-semibold text-ink text-sm underline focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2"
					>
						Mon compte
					</Link>
				</nav>
			</div>
		</section>
	)
}
