'use client'

import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState } from 'react'
import type { Pid } from '@/lib/analytics/events'
import { type ContactAction, subjectOf } from '@/lib/profile/contact-actions'
import { TrackedContactLink } from './TrackedContactLink'

/**
 * The way in to the contact of a profile (ticket 290). On a phone, a bar stuck at the bottom of the
 * screen with the lowest price and the button; on a computer, the same button under the header. Both
 * open the same sheet: a dialog of wide buttons, one per way of reaching her. The sheet is a native
 * `<dialog>` opened as a modal, so the keyboard stays inside it and the page behind is inert. Escape,
 * the « Fermer » button and a tap on the dark side close it, and the focus goes back to the button that
 * opened it.
 *
 * The sheet exists only once opened, so the links of the page stay those of the card of contacts that
 * the server renders: a visitor without JavaScript loses nothing.
 */

const RING = 'focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2'

const PRIMARY_BUTTON = `inline-flex min-h-12 max-w-full items-center justify-center rounded-full bg-indigo-700 px-6 py-2 text-center [overflow-wrap:anywhere] font-semibold text-base text-white hover:bg-indigo-800 ${RING}`

export function ContactButton({
	placement,
	name,
	price,
	actions,
	pid,
	mesure,
}: {
	/** `header`: the button under the header, from 768 px. `bar`: the bar stuck at the bottom, under 768 px. */
	placement: 'header' | 'bar'
	/** Her first name, or `null` when the page has nothing better than « la maquilleuse ». */
	name: string | null
	/** « À partir de 45 € », or `null` without a price. Shown in the bar only. */
	price: string | null
	actions: readonly ContactAction[]
	pid: Pid | null
	/** False in the preview of her own page: the links count no click. */
	mesure: boolean
}) {
	const [open, setOpen] = useState(false)
	const opener = useRef<HTMLButtonElement>(null)
	const titleId = useId()
	const label = `Contacter ${subjectOf(name)}`

	// The focus goes back once the sheet is gone: while it is open the page behind it is inert.
	const focusBack = useRef(false)
	useEffect(() => {
		if (open || !focusBack.current) return
		focusBack.current = false
		opener.current?.focus()
	}, [open])

	const close = () => {
		focusBack.current = true
		setOpen(false)
	}

	const button = (
		<button
			ref={opener}
			type="button"
			aria-haspopup="dialog"
			onClick={() => setOpen(true)}
			className={`${PRIMARY_BUTTON} ${placement === 'bar' ? 'min-w-0' : 'mt-3'}`}
		>
			{label}
		</button>
	)

	return (
		<>
			{placement === 'bar' ? (
				<div
					className={`sticky bottom-0 z-20 flex items-center gap-4 border-gray-300 border-t bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] md:hidden ${
						price === null ? 'justify-center' : 'justify-between'
					}`}
				>
					{price !== null && <p className="shrink-0 font-semibold text-gray-800">{price}</p>}
					{button}
				</div>
			) : (
				<div className="hidden md:block">{button}</div>
			)}
			{open && (
				<ContactSheet titleId={titleId} title={label} actions={actions} pid={pid} mesure={mesure} onClose={close} />
			)}
		</>
	)
}

function ContactSheet({
	titleId,
	title,
	actions,
	pid,
	mesure,
	onClose,
}: {
	titleId: string
	title: string
	actions: readonly ContactAction[]
	pid: Pid | null
	mesure: boolean
	onClose: () => void
}) {
	const dialog = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const element = dialog.current
		if (!element || element.open) return
		if (typeof element.showModal === 'function') element.showModal()
		else element.setAttribute('open', '')
	}, [])

	const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
		if (event.key !== 'Escape') return
		// The browser would close the dialog itself; closing here keeps one path for the focus.
		event.preventDefault()
		onClose()
	}

	// A tap on the dark side: the target is the dialog itself, not what is inside it.
	const onClick = (event: MouseEvent<HTMLDialogElement>) => {
		if (event.target === event.currentTarget) onClose()
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the « Fermer » button are the keyboard ways out; the tap on the dark side is a pointer shortcut
		<dialog
			ref={dialog}
			aria-labelledby={titleId}
			onKeyDown={onKeyDown}
			onClick={onClick}
			onCancel={event => {
				event.preventDefault()
				onClose()
			}}
			className="m-0 mt-auto w-full max-w-full rounded-t-2xl bg-white p-0 text-gray-800 shadow-xl backdrop:bg-black/50 md:m-auto md:max-w-md md:rounded-2xl"
		>
			<div className="flex flex-col gap-4 p-5">
				<div className="flex items-center justify-between gap-4">
					{/* A paragraph, not a heading: the page keeps its own outline of h1 and h2. */}
					<p id={titleId} className="min-w-0 break-words font-bold text-gray-800 text-xl">
						{title}
					</p>
					<button
						type="button"
						onClick={onClose}
						className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 ${RING}`}
					>
						<span className="sr-only">Fermer</span>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							className="h-6 w-6"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
				<ul className="flex flex-col gap-3">
					{actions.map(action => (
						<li key={action.canal}>
							<SheetLink action={action} pid={pid} mesure={mesure} />
						</li>
					))}
				</ul>
			</div>
		</dialog>
	)
}

function SheetLink({
	action: { canal, href, title, detail, newTab },
	pid,
	mesure,
}: {
	action: ContactAction
	pid: Pid | null
	mesure: boolean
}) {
	const properties = {
		href,
		...(newTab ? { target: '_blank' } : {}),
		rel: 'noopener nofollow noreferrer',
		className: `flex min-h-12 min-w-0 flex-col justify-center rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50 ${RING}`,
	}
	const content = (
		<>
			<span className="break-words font-semibold text-gray-800">{title}</span>
			<span className="break-words text-gray-600 text-sm [overflow-wrap:anywhere]">{detail}</span>
		</>
	)
	return mesure && pid !== null ? (
		<TrackedContactLink pid={pid} canal={canal} {...properties}>
			{content}
		</TrackedContactLink>
	) : (
		<a {...properties}>{content}</a>
	)
}
