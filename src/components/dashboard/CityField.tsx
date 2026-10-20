'use client'

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { REFUSED_ADDRESS_MESSAGE, SEARCH_MIN, type SearchResult, type SuggestedCity } from '@/lib/dashboard/location'

export type CitiesSearch = (texte: string) => Promise<SearchResult>

/** The pause after the last key before the list is asked. */
export const SEARCH_PAUSE_MS = 250

const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The field in which she chooses her commune (ticket 123): an ARIA combobox on the official list.
 * What she types is only a way to find a commune; the field is worth a commune only once she has
 * chosen one in the suggestions, and typing again takes it back.
 *
 * - Keyboard: the arrows move in the suggestions, Enter chooses the one in focus (and does not send
 *   the form), Escape closes the list (and not the panel around it). A second Escape closes the panel.
 * - Finger: a suggestion is a button at least 44 px high; pressing it does not take the focus from
 *   the field, so the list is still there when the tap lands.
 * - The searches are paused while she types, and an answer that arrives after a newer question is
 *   dropped.
 * - If the list of communes does not answer, the field says so in French and keeps the commune she
 *   had chosen before; she can still save the rest.
 *
 * It holds no data of its own: `onChoisir` tells the form which commune is chosen, or `null`.
 */
export function CityField({
	libelleInitial,
	chercher,
	onChoisir,
	erreur,
	idErreur,
	id,
}: {
	/** « Annecy (74) », or '' when no commune is stored yet. */
	libelleInitial: string
	chercher: CitiesSearch
	onChoisir: (commune: SuggestedCity | null) => void
	erreur: string
	idErreur: string
	id: string
}) {
	const list = useId()
	const [text, setText] = useState(libelleInitial)
	const [suggestions, setSuggestions] = useState<SuggestedCity[]>([])
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const [state, setState] = useState<'repos' | 'recherche' | 'rien' | 'panne' | 'adresse'>('repos')
	const [outageMessage, setOutageMessage] = useState('')
	const question = useRef(0)
	const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(
		() => () => {
			clearTimeout(pause.current)
			question.current += 1
		},
		[]
	)

	function close() {
		setOpen(false)
		setActive(-1)
	}

	function enter(valeur: string) {
		setText(valeur)
		// Typing takes the commune back: free text is never one.
		onChoisir(null)
		clearTimeout(pause.current)
		const number = ++question.current
		if (valeur.trim().length < SEARCH_MIN) {
			setSuggestions([])
			setState('repos')
			close()
			return
		}
		setState('recherche')
		pause.current = setTimeout(() => {
			void chercher(valeur)
				.catch((): SearchResult => ({ ok: false, message: 'La recherche n’a pas abouti : réessaie dans un instant.' }))
				.then(resultat => {
					if (number !== question.current) return
					if (!resultat.ok) {
						setSuggestions([])
						setOutageMessage(resultat.message)
						setState('panne')
						close()
						return
					}
					setSuggestions(resultat.communes)
					setActive(-1)
					setState(resultat.motif === 'adresse' ? 'adresse' : resultat.communes.length === 0 ? 'rien' : 'repos')
					setOpen(resultat.communes.length > 0)
				})
		}, SEARCH_PAUSE_MS)
	}

	function choose(commune: SuggestedCity) {
		clearTimeout(pause.current)
		question.current += 1
		setText(commune.libelle)
		setState('repos')
		close()
		onChoisir(commune)
	}

	function onKey(evenement: KeyboardEvent<HTMLInputElement>) {
		const { key } = evenement
		if (key === 'ArrowDown' || key === 'ArrowUp') {
			if (suggestions.length === 0) return
			evenement.preventDefault()
			const delta = key === 'ArrowDown' ? 1 : -1
			setOpen(true)
			setActive(courant => (courant + delta + suggestions.length) % suggestions.length)
		} else if (key === 'Enter' && open && active >= 0) {
			// The suggestion in focus is chosen; the form is not sent by this Enter.
			evenement.preventDefault()
			const chosen = suggestions[active]
			if (chosen) choose(chosen)
		} else if (key === 'Escape' && open) {
			// The list closes; the panel stays.
			evenement.preventDefault()
			evenement.stopPropagation()
			close()
		}
	}

	const status =
		state === 'recherche'
			? 'Recherche des communes…'
			: open
				? `${suggestions.length} commune${suggestions.length > 1 ? 's' : ''} proposée${suggestions.length > 1 ? 's' : ''}.`
				: state === 'rien'
					? 'Aucune commune ne correspond.'
					: ''

	return (
		<div className="flex flex-col gap-1">
			<input
				id={id}
				type="text"
				role="combobox"
				aria-expanded={open}
				aria-controls={list}
				aria-autocomplete="list"
				aria-activedescendant={open && active >= 0 ? `${list}-${active}` : undefined}
				aria-invalid={erreur ? true : undefined}
				aria-describedby={erreur ? idErreur : undefined}
				autoComplete="off"
				autoCapitalize="off"
				spellCheck={false}
				value={text}
				onChange={evenement => enter(evenement.target.value)}
				onKeyDown={onKey}
				onBlur={close}
				className={FIELD}
			/>
			<div
				id={list}
				role="listbox"
				aria-label="Communes proposées"
				hidden={!open}
				className="flex flex-col overflow-hidden rounded-md border border-neutral-300 bg-white"
			>
				{suggestions.map((commune, rang) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard works the options from the field (aria-activedescendant)
					<div
						key={commune.codeInsee}
						id={`${list}-${rang}`}
						role="option"
						tabIndex={-1}
						aria-selected={rang === active}
						// Pressing a suggestion must not take the focus from the field: its blur would close the list first.
						onMouseDown={evenement => evenement.preventDefault()}
						onClick={() => choose(commune)}
						className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-base ${
							rang === active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
						}`}
					>
						{commune.libelle}
					</div>
				))}
			</div>
			<p role="status" className="text-neutral-700 text-sm">
				{status}
			</p>
			{state === 'adresse' ? (
				<p className="text-amber-900 text-sm">{REFUSED_ADDRESS_MESSAGE}</p>
			) : (
				<p className="text-neutral-700 text-sm">Écris le nom de ta commune ou son code postal, puis choisis-la.</p>
			)}
			{state === 'panne' ? (
				<p role="alert" className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
					{outageMessage}
				</p>
			) : null}
			{erreur ? (
				<p id={idErreur} className="text-red-800 text-sm">
					{erreur}
				</p>
			) : null}
		</div>
	)
}
