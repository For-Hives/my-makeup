'use client'

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/** The elements the keyboard can reach in a node, in reading order. */
function focusable(racine: HTMLElement): HTMLElement[] {
	return Array.from(racine.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/**
 * The panel in which a section of her profile is edited (tickets 119 and 120). Every section
 * reuses it. It is a dialog: it takes the whole screen under 640 px, and a card above that.
 *
 * - The focus goes in when it opens, stays in (Tab and Shift+Tab turn inside it), and goes back to
 *   the button that opened it when it closes. Escape closes it.
 * - Closing with changes not saved asks first, in the panel (E31): « Continuer à modifier » or
 *   « Abandonner mes modifications ». Closing while a save is in progress waits for its answer.
 * - A key held down acts once: the repeats of Enter are ignored in the panel (E68).
 *
 * It holds no data: the form is its child, and says through `modifie` whether it has unsaved changes.
 */
export function EditingPanel({
	titre,
	enCours,
	modifie,
	retour,
	onFermer,
	children,
}: {
	titre: string
	/** A save is in progress: the panel cannot be closed. */
	enCours: boolean
	/** The form holds changes that are not saved. */
	modifie: boolean
	/** The button that opened the panel: it gets the focus back. */
	retour: RefObject<HTMLElement | null>
	onFermer: () => void
	children: ReactNode
}) {
	const id = useId()
	const root = useRef<HTMLDivElement>(null)
	const corps = useRef<HTMLDivElement>(null)
	const continueButton = useRef<HTMLButtonElement>(null)
	const [confirmation, setConfirmation] = useState(false)

	// In on opening; back to the opener on closing. The opener is read when the panel unmounts.
	useEffect(() => {
		const trigger = retour.current
		const first = corps.current ? focusable(corps.current)[0] : undefined
		;(first ?? root.current)?.focus()
		const scroll = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = scroll
			trigger?.focus()
		}
	}, [retour])

	useEffect(() => {
		if (confirmation) continueButton.current?.focus()
	}, [confirmation])

	function requestClose() {
		if (enCours) return
		if (modifie) setConfirmation(true)
		else onFermer()
	}

	function onKey(evenement: KeyboardEvent<HTMLDivElement>) {
		// A key held down repeats: Enter would send the form again and again. A long text keeps its
		// effect: held down, Enter makes new lines.
		if (evenement.key === 'Enter' && evenement.repeat && (evenement.target as HTMLElement).tagName !== 'TEXTAREA') {
			evenement.preventDefault()
			return
		}
		if (evenement.key === 'Escape') {
			evenement.preventDefault()
			evenement.stopPropagation()
			if (confirmation) setConfirmation(false)
			else requestClose()
			return
		}
		if (evenement.key !== 'Tab' || root.current === null) return
		const elements = focusable(root.current)
		const first = elements[0]
		const last = elements[elements.length - 1]
		if (first === undefined || last === undefined) return
		const active = document.activeElement
		if (evenement.shiftKey && (active === first || !root.current.contains(active))) {
			evenement.preventDefault()
			last.focus()
		} else if (!evenement.shiftKey && (active === last || !root.current.contains(active))) {
			evenement.preventDefault()
			first.focus()
		}
	}

	return (
		<div className="fixed inset-0 z-50 bg-black/50 sm:flex sm:items-center sm:justify-center sm:p-6">
			<div
				ref={root}
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${id}-titre`}
				tabIndex={-1}
				onKeyDown={onKey}
				className="flex h-full w-full flex-col bg-white outline-none sm:h-auto sm:max-h-full sm:max-w-lg sm:rounded-lg"
			>
				<div className="flex items-center justify-between gap-3 border-neutral-200 border-b px-5 py-3">
					<h2 id={`${id}-titre`} tabIndex={-1} className="font-bold text-lg outline-none">
						{titre}
					</h2>
					<button
						type="button"
						onClick={requestClose}
						disabled={enCours}
						className={`${BUTTON} border border-neutral-300 bg-white disabled:opacity-60`}
					>
						Fermer
					</button>
				</div>
				{confirmation ? (
					<div
						role="alert"
						className="flex flex-col gap-3 border-amber-200 border-b bg-amber-50 px-5 py-3 text-amber-900"
					>
						<p className="text-sm">Tu as des modifications non enregistrées. Si tu fermes, elles seront perdues.</p>
						<div className="flex flex-wrap gap-3">
							<button
								ref={continueButton}
								type="button"
								onClick={() => setConfirmation(false)}
								className={`${BUTTON} bg-neutral-900 text-white`}
							>
								Continuer à modifier
							</button>
							<button type="button" onClick={onFermer} className={`${BUTTON} border border-neutral-400 bg-white`}>
								Abandonner mes modifications
							</button>
						</div>
					</div>
				) : null}
				<div ref={corps} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{children}
				</div>
			</div>
		</div>
	)
}
