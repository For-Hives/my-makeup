import React, { Fragment, forwardRef } from 'react'
import { Transition } from '@headlessui/react'

/**
 * Pieces shared by the modals of the artist's space (UI-02, UI-04).
 * The Dialog of Headless UI already closes on Escape and on a click outside
 * the panel, locks the page scroll and keeps the focus inside.
 */

/** Grey backdrop at 75 %, faded in and out */
export function FondModale() {
	return (
		<Transition.Child
			as={Fragment}
			enter="ease-out duration-300"
			enterFrom="opacity-0"
			enterTo="opacity-100"
			leave="ease-in duration-200"
			leaveFrom="opacity-100"
			leaveTo="opacity-0"
		>
			<div
				data-cy="modal-backdrop"
				className="fixed inset-0 bg-gray-500/75 transition-opacity"
				aria-hidden="true"
			/>
		</Transition.Child>
	)
}

/** Close button (44 px), first focused element of the modal */
export const BoutonFermer = forwardRef(function BoutonFermer({ onClick }, ref) {
	return (
		<button
			type="button"
			onClick={onClick}
			ref={ref}
			aria-label="Fermer"
			data-cy="close-modal"
			className={
				'absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-700 md:right-4 md:top-4 ' +
				'hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
			}
		>
			<span className="material-icons-round" aria-hidden="true">
				close
			</span>
		</button>
	)
})
