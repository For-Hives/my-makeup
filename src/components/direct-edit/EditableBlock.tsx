'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { blockAnchor } from '@/lib/dashboard/draft-notice'
import { EditorFrame } from './EditorFrame'
import { useEditSession } from './EditSession'

/**
 * A block of her page she can change in place (issue 1008). The same markup as the visitor sees, plus
 * what only she gets:
 * - one button that covers the whole block, named for what it changes (« Modifier ma photo
 *   principale »), so a click anywhere opens it and the keyboard reaches it;
 * - a pen that is always visible, and says « Modifier » when the block is hovered or focused: red is
 *   reserved for what can be changed;
 * - when there is nothing to show, an invitation that says what to do, in place of the content;
 * - when it opens, its editor under the header (`EditorSlot`), the other blocks dimmed.
 *
 * `shape` is the outline of the block, for the ring and for the button that covers it.
 */

export type BlockShape = 'round' | 'card' | 'pill'

const SHAPES: Record<BlockShape, string> = {
	round: 'rounded-full',
	card: 'rounded-card',
	pill: 'rounded-full',
}

export function EditableBlock({
	id,
	title,
	penLabel,
	empty,
	invitation,
	shape = 'card',
	className = '',
	penClassName = 'right-1 top-1',
	editor,
	children,
}: {
	/** Stable identifier of the block: one open at a time. */
	id: string
	/** The block in a few words, for the editor's heading: « Photo principale ». */
	title: string
	/** The accessible name of the button: « Modifier ma photo principale ». */
	penLabel: string
	/** Nothing to show yet: the invitation replaces the content. */
	empty: boolean
	/** What to do, in a sentence: « Ajoute ta photo principale ». */
	invitation: ReactNode
	shape?: BlockShape
	className?: string
	/** Where the pen sits on the block (Tailwind positions). */
	penClassName?: string
	/** The editor drawn under the header when the block is open. */
	editor: ReactNode
	children: ReactNode
}) {
	const session = useEditSession()
	const buttonId = useId()
	const button = useRef<HTMLButtonElement>(null)
	const isOpen = session.openId === id
	const wasOpen = useRef(false)

	// The focus goes back to the block once its editor has closed.
	useEffect(() => {
		if (wasOpen.current && !isOpen) button.current?.focus()
		wasOpen.current = isOpen
	}, [isOpen])

	const dimmed = session.openId !== null && !isOpen
	const ring = isOpen
		? 'ring-2 ring-lipstick'
		: 'ring-2 ring-transparent hover:ring-lipstick focus-within:ring-lipstick'
	return (
		<div
			id={blockAnchor(id)}
			data-direct-edit={id}
			data-open={isOpen ? 'true' : undefined}
			className={`group relative scroll-mt-24 min-h-11 min-w-11 ${SHAPES[shape]} ${ring} transition-[box-shadow,opacity] duration-150 motion-reduce:transition-none ${dimmed ? 'opacity-50' : ''} ${className}`}
		>
			{empty ? (
				<span
					data-direct-edit-empty
					className={`flex min-h-14 items-center gap-3 border-2 border-nude-300 border-dashed bg-blush px-4 py-3 font-body font-medium text-mute text-sm [&_b]:font-display [&_b]:font-medium [&_b]:text-base ${shape === 'round' ? 'h-full w-full justify-center rounded-full text-center' : 'rounded-2xl'}`}
				>
					{invitation}
				</span>
			) : (
				children
			)}
			<button
				ref={button}
				id={buttonId}
				type="button"
				aria-label={penLabel}
				aria-expanded={isOpen}
				onClick={() => session.open(id)}
				// Held down, Enter repeats: it opens the block once.
				onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
					if (event.repeat) event.preventDefault()
				}}
				className={`absolute inset-0 ${SHAPES[shape]} focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2`}
			/>
			<span
				aria-hidden="true"
				className={`pointer-events-none absolute ${penClassName} flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-hairline bg-white px-3 font-body font-medium text-mute text-sm shadow-sm ${dimmed ? '' : 'group-focus-within:border-lipstick group-focus-within:bg-lipstick group-focus-within:text-white group-hover:border-lipstick group-hover:bg-lipstick group-hover:text-white'} ${isOpen ? 'border-lipstick bg-lipstick text-white' : ''}`}
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M4 20h4L19 9l-4-4L4 16z" />
				</svg>
				<span className={dimmed ? 'hidden' : 'hidden group-focus-within:inline group-hover:inline'}>Modifier</span>
			</span>
			{isOpen && session.slot !== null
				? createPortal(
						<EditorFrame title={title} buttonId={buttonId}>
							{editor}
						</EditorFrame>,
						session.slot
					)
				: null}
		</div>
	)
}
