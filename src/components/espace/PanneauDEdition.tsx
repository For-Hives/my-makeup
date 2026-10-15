'use client'

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'

const FOCALISABLES =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/** The elements the keyboard can reach in a node, in reading order. */
function focalisables(racine: HTMLElement): HTMLElement[] {
	return Array.from(racine.querySelectorAll<HTMLElement>(FOCALISABLES))
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
export function PanneauDEdition({
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
	const identifiant = useId()
	const racine = useRef<HTMLDivElement>(null)
	const corps = useRef<HTMLDivElement>(null)
	const continuer = useRef<HTMLButtonElement>(null)
	const [confirmation, setConfirmation] = useState(false)

	// In on opening; back to the opener on closing. The opener is read when the panel unmounts.
	useEffect(() => {
		const declencheur = retour.current
		const premier = corps.current ? focalisables(corps.current)[0] : undefined
		;(premier ?? racine.current)?.focus()
		const defilement = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = defilement
			declencheur?.focus()
		}
	}, [retour])

	useEffect(() => {
		if (confirmation) continuer.current?.focus()
	}, [confirmation])

	function demanderLaFermeture() {
		if (enCours) return
		if (modifie) setConfirmation(true)
		else onFermer()
	}

	function surTouche(evenement: KeyboardEvent<HTMLDivElement>) {
		// A key held down repeats: Enter would send the form again and again.
		if (evenement.key === 'Enter' && evenement.repeat) {
			evenement.preventDefault()
			return
		}
		if (evenement.key === 'Escape') {
			evenement.preventDefault()
			evenement.stopPropagation()
			if (confirmation) setConfirmation(false)
			else demanderLaFermeture()
			return
		}
		if (evenement.key !== 'Tab' || racine.current === null) return
		const elements = focalisables(racine.current)
		const premier = elements[0]
		const dernier = elements[elements.length - 1]
		if (premier === undefined || dernier === undefined) return
		const actif = document.activeElement
		if (evenement.shiftKey && (actif === premier || !racine.current.contains(actif))) {
			evenement.preventDefault()
			dernier.focus()
		} else if (!evenement.shiftKey && (actif === dernier || !racine.current.contains(actif))) {
			evenement.preventDefault()
			premier.focus()
		}
	}

	return (
		<div className="fixed inset-0 z-50 bg-black/50 sm:flex sm:items-center sm:justify-center sm:p-6">
			<div
				ref={racine}
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${identifiant}-titre`}
				tabIndex={-1}
				onKeyDown={surTouche}
				className="flex h-full w-full flex-col bg-white outline-none sm:h-auto sm:max-h-full sm:max-w-lg sm:rounded-lg"
			>
				<div className="flex items-center justify-between gap-3 border-neutral-200 border-b px-5 py-3">
					<h2 id={`${identifiant}-titre`} tabIndex={-1} className="font-bold text-lg outline-none">
						{titre}
					</h2>
					<button
						type="button"
						onClick={demanderLaFermeture}
						disabled={enCours}
						className={`${BOUTON} border border-neutral-300 bg-white disabled:opacity-60`}
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
								ref={continuer}
								type="button"
								onClick={() => setConfirmation(false)}
								className={`${BOUTON} bg-neutral-900 text-white`}
							>
								Continuer à modifier
							</button>
							<button type="button" onClick={onFermer} className={`${BOUTON} border border-neutral-400 bg-white`}>
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
