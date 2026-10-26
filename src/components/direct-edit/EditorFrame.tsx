'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'
import { Icon } from '@/components/art/Icon'
import { useEditSession } from './EditSession'

/**
 * The card an open block draws its editor in (issue 1008): « Tu modifies : <block> », the question
 * « Continuer / Abandonner » when she tries to leave with changes not saved, and Escape to close.
 * The focus goes to its first field when it opens.
 */
export function EditorFrame({ title, buttonId, children }: { title: string; buttonId: string; children: ReactNode }) {
	const session = useEditSession()
	const root = useRef<HTMLDivElement>(null)
	const keep = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		const first = root.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button')
		first?.focus()
		root.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])

	useEffect(() => {
		if (session.confirmation !== null) keep.current?.focus()
	}, [session.confirmation])

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== 'Escape') return
		event.preventDefault()
		event.stopPropagation()
		if (session.confirmation !== null) session.keepEditing()
		else session.close()
	}

	return (
		<section
			ref={root}
			aria-label={`${title}, en cours de modification`}
			data-direct-edit-editor={buttonId}
			onKeyDown={onKeyDown}
			className="mt-6 w-full scroll-mt-4 rounded-card border-2 border-lipstick bg-white p-5 font-body text-ink shadow-[0_18px_40px_-24px_rgba(26,20,23,0.45)] sm:p-7"
		>
			<p
				data-testid="editor-title"
				className="mb-5 flex items-center gap-2 border-hairline border-b pb-4 font-semibold text-base text-lipstick-800"
			>
				<Icon name="pencil" className="h-[18px] w-[18px]" />
				Tu modifies : {title}
			</p>
			{session.confirmation !== null ? (
				<div
					role="alert"
					className="mb-4 flex flex-col gap-3 rounded-2xl border border-nude-300 bg-nude-100 p-4 text-ink"
				>
					<p className="text-sm">Tu as des modifications non enregistrées. Si tu continues, elles seront perdues.</p>
					<div className="flex flex-wrap gap-3">
						<button
							ref={keep}
							type="button"
							onClick={session.keepEditing}
							className="min-h-11 rounded-full bg-ink px-5 font-semibold text-sm text-white"
						>
							Continuer à modifier
						</button>
						<button
							type="button"
							onClick={session.abandon}
							className="min-h-11 rounded-full border border-ink bg-white px-5 font-semibold text-ink text-sm"
						>
							Abandonner mes modifications
						</button>
					</div>
				</div>
			) : null}
			{children}
		</section>
	)
}

/** The place under the header where the open block draws its editor. Nothing is in it while no block is open. */
export function EditorSlot() {
	const { setSlot } = useEditSession()
	return <div ref={setSlot} data-direct-edit-slot className="mx-auto w-full max-w-7xl" />
}
