import React, { Fragment, forwardRef, useEffect, useState } from 'react'
import { Transition } from '@headlessui/react'
import { fermerSiLibre } from '@/lib/sauvegarde-profil'

/**
 * Pieces shared by the modals of the artist's space (UI-01, UI-02, UI-04).
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
export const BoutonFermer = forwardRef(function BoutonFermer(
	{ onClick, disabled = false },
	ref
) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			ref={ref}
			aria-label="Fermer"
			data-cy="close-modal"
			className={
				'absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-700 md:right-4 md:top-4 ' +
				'hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ' +
				'disabled:cursor-wait disabled:opacity-50'
			}
		>
			<span className="material-icons-round" aria-hidden="true">
				close
			</span>
		</button>
	)
})

/**
 * Save state of a modal (UI-01, UI-04): `envoi` while the request runs,
 * `erreurEnvoi` the message of a failed save, cleared each time the modal
 * opens or closes, and `fermer`, its close handler, which waits for the
 * save (fermerSiLibre).
 * @param {boolean} ouverte - props.isModalOpen
 * @param {() => void} fermerModale - props.handleIsModalOpen
 * @param {boolean} [autreTache] - something else running (picture compression)
 */
export function useEnvoi(ouverte, fermerModale, autreTache = false) {
	const [envoi, setEnvoi] = useState(false)
	const [erreurEnvoi, setErreurEnvoi] = useState(null)
	useEffect(() => {
		setErreurEnvoi(null)
	}, [ouverte])
	const fermer = fermerSiLibre(envoi || autreTache, fermerModale)
	return { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer }
}

/** What the API answered when it did not store the change */
export function ErreurSauvegarde({ message }) {
	if (!message) return null
	return (
		<p
			role="alert"
			data-cy="save-error"
			className="rounded-md bg-red-50 p-3 text-sm text-red-800"
		>
			{message}
		</p>
	)
}

/** Save button, disabled while the request runs */
export function BoutonSauvegarder({
	envoi,
	onClick,
	dataCy,
	children = 'Sauvegarder',
}) {
	return (
		<button
			data-cy={dataCy}
			type="button"
			className="btn-primary disabled:cursor-wait disabled:opacity-60"
			onClick={onClick}
			disabled={envoi}
			aria-busy={envoi}
		>
			{envoi ? 'Enregistrement…' : children}
		</button>
	)
}

/**
 * onChange of a controlled input that is also registered in react-hook-form:
 * the input's own onChange replaced the one of register(), so the form only
 * saw a value on blur (Enter in a field validated and sent the old one).
 * Both are called now (UI-01).
 * @param {Function} register - from useForm()
 * @returns {(nom: string, handler: Function) => Function}
 */
export const suivreChamp = register => (nom, handler) => event => {
	register(nom).onChange(event)
	handler(event)
}
