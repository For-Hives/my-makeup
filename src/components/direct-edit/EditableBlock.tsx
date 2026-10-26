'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/art/Icon'
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
 * `shape` is the outline of the block, for the halo and for the button that covers it.
 */

/** What the blocks other than the open one keep of their opacity: dimmed, still readable (7:1 for the ink on the page, issue 1071). */
export const DIMMED_OPACITY = 0.8

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
	// The halo is drawn inside the block (an inset shadow on a layer that has the block's own radius): it cannot
	// stick out, move anything or change a border (issue 1070). Keyboard focus thickens it.
	const halo = isOpen
		? 'shadow-[inset_0_0_0_3px_var(--color-lipstick)]'
		: 'shadow-[inset_0_0_0_2px_transparent] group-hover:shadow-[inset_0_0_0_2px_var(--color-lipstick)] group-focus-within:shadow-[inset_0_0_0_2px_var(--color-lipstick)] group-has-[:focus-visible]:shadow-[inset_0_0_0_4px_var(--color-lipstick)]'
	return (
		<div
			id={blockAnchor(id)}
			data-direct-edit={id}
			data-open={isOpen ? 'true' : undefined}
			className={`group relative scroll-mt-24 min-h-11 min-w-11 ${SHAPES[shape]} transition-opacity duration-150 motion-reduce:transition-none ${className}`}
			style={dimmed ? { opacity: DIMMED_OPACITY } : undefined}
		>
			{empty ? (
				<span
					data-direct-edit-empty
					className={`flex min-h-14 items-center gap-3 border-2 border-nude-300 border-dashed bg-blush px-4 py-3 font-body font-medium text-ink text-sm [&_b]:font-display [&_b]:font-medium [&_b]:text-base ${shape === 'round' ? 'h-full w-full justify-center rounded-full text-center' : 'rounded-2xl'}`}
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
				className={`absolute inset-0 ${SHAPES[shape]} focus-visible:outline-none`}
			/>
			<span
				aria-hidden="true"
				data-direct-edit-halo
				className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-shadow duration-150 motion-reduce:transition-none ${halo}`}
			/>
			<span
				aria-hidden="true"
				className={`pointer-events-none absolute ${penClassName} flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-nude-300 bg-white px-3 font-body font-medium text-ink text-sm shadow-sm ${dimmed ? '' : 'group-focus-within:border-lipstick-800 group-focus-within:bg-lipstick-800 group-focus-within:text-white group-hover:border-lipstick-800 group-hover:bg-lipstick-800 group-hover:text-white'} ${isOpen ? 'border-lipstick-800 bg-lipstick-800 text-white' : ''}`}
			>
				<Icon name="pencil" className="h-[18px] w-[18px]" />
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
