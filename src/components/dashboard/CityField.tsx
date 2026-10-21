'use client'

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Country } from '@/lib/countries'
import { flag } from '@/lib/countries'
import { matchingCountries } from '@/lib/dashboard/country-search'
import { REFUSED_ADDRESS_MESSAGE, SEARCH_MIN, type SearchResult, type SuggestedCity } from '@/lib/dashboard/location'

export type CitiesSearch = (texte: string) => Promise<SearchResult>

/** The pause after the last key before the list is asked. */
export const SEARCH_PAUSE_MS = 250

const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/** What the list proposes: a commune (asked of the server) or a country (filtered here). */
type Item = { type: 'commune'; commune: SuggestedCity } | { type: 'pays'; country: Country }

/**
 * The field in which she chooses her commune (ticket 123): an ARIA combobox on the official list.
 * What she types is only a way to find a commune; the field is worth a commune only once she has
 * chosen one in the suggestions, and typing again takes it back.
 *
 * - A postal code (ticket 265): five digits that name one commune choose it without a tap, and the
 *   line `role="status"` says so (« Code postal 62200 : Cambrin, choisie. Tu peux en écrire une
 *   autre. »). A code several communes share chooses nothing: the list opens with « Ce code postal
 *   couvre 5 communes : choisis la tienne. », each commune followed by the code.
 * - Countries (ticket 266): with `onChoisirPays`, the countries of the embedded list that start like
 *   the text are proposed under « À l’étranger », filtered here with no request. Choosing one hands
 *   it to the parent, which turns the zone into countries.
 * - Keyboard: the arrows move in the suggestions (both groups), Enter chooses the one in focus (and
 *   does not send the form), Escape closes the list (and not the panel around it). A second Escape
 *   closes the panel.
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
	onChoisirPays,
	erreur,
	idErreur,
	id,
}: {
	/** « Annecy (74) », or '' when no commune is stored yet. */
	libelleInitial: string
	chercher: CitiesSearch
	onChoisir: (commune: SuggestedCity | null) => void
	/** Given, the countries are proposed too; it receives the code of the one she chooses. */
	onChoisirPays?: (code: string) => void
	erreur: string
	idErreur: string
	id: string
}) {
	const list = useId()
	const [text, setText] = useState(libelleInitial)
	const [suggestions, setSuggestions] = useState<SuggestedCity[]>([])
	const [postalCode, setPostalCode] = useState('')
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const [state, setState] = useState<'repos' | 'recherche' | 'rien' | 'panne' | 'adresse'>('repos')
	const [outageMessage, setOutageMessage] = useState('')
	const [announcement, setAnnouncement] = useState('')
	const question = useRef(0)
	const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	// What she typed since the last commune was chosen: a label written back by a choice proposes nothing.
	const [typed, setTyped] = useState(false)

	const countries = useMemo(
		() => (onChoisirPays !== undefined && typed ? matchingCountries(text) : []),
		[onChoisirPays, typed, text]
	)
	const items: Item[] = [
		...suggestions.map((commune): Item => ({ type: 'commune', commune })),
		...countries.map((country): Item => ({ type: 'pays', country })),
	]
	const isOpen = open && items.length > 0

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
		setTyped(true)
		setAnnouncement('')
		// Typing takes the commune back: free text is never one.
		onChoisir(null)
		clearTimeout(pause.current)
		const number = ++question.current
		setPostalCode('')
		if (valeur.trim().length < SEARCH_MIN) {
			setSuggestions([])
			setState('repos')
			close()
			return
		}
		setState('recherche')
		setActive(-1)
		setOpen(true)
		pause.current = setTimeout(() => {
			void chercher(valeur)
				.catch((): SearchResult => ({ ok: false, message: 'La recherche n’a pas abouti : réessaie dans un instant.' }))
				.then(resultat => {
					if (number !== question.current) return
					if (!resultat.ok) {
						setSuggestions([])
						setOutageMessage(resultat.message)
						setState('panne')
						return
					}
					const only = resultat.communes[0]
					if (resultat.codePostal !== undefined && resultat.communes.length === 1 && only !== undefined) {
						// A postal code of one commune chooses it, and says so.
						choose(only, `Code postal ${resultat.codePostal} : ${only.nom}, choisie. Tu peux en écrire une autre.`)
						return
					}
					setSuggestions(resultat.communes)
					setPostalCode(resultat.codePostal !== undefined && resultat.communes.length > 1 ? resultat.codePostal : '')
					setActive(-1)
					setState(resultat.motif === 'adresse' ? 'adresse' : resultat.communes.length === 0 ? 'rien' : 'repos')
					setOpen(true)
				})
		}, SEARCH_PAUSE_MS)
	}

	function choose(commune: SuggestedCity, annonce = '') {
		clearTimeout(pause.current)
		question.current += 1
		setText(commune.libelle)
		setTyped(false)
		setSuggestions([])
		setPostalCode('')
		setAnnouncement(annonce)
		setState('repos')
		close()
		onChoisir(commune)
	}

	function chooseCountry(country: Country) {
		clearTimeout(pause.current)
		question.current += 1
		close()
		onChoisirPays?.(country.code)
	}

	function pick(item: Item) {
		if (item.type === 'commune') choose(item.commune)
		else chooseCountry(item.country)
	}

	function onKey(evenement: KeyboardEvent<HTMLInputElement>) {
		const { key } = evenement
		if (key === 'ArrowDown' || key === 'ArrowUp') {
			if (items.length === 0) return
			evenement.preventDefault()
			const delta = key === 'ArrowDown' ? 1 : -1
			setOpen(true)
			setActive(courant => (courant + delta + items.length) % items.length)
		} else if (key === 'Enter' && isOpen && active >= 0) {
			// The suggestion in focus is chosen; the form is not sent by this Enter.
			evenement.preventDefault()
			const chosen = items[active]
			if (chosen) pick(chosen)
		} else if (key === 'Escape' && isOpen) {
			// The list closes; the panel stays.
			evenement.preventDefault()
			evenement.stopPropagation()
			close()
		}
	}

	const cityCount = suggestions.length
	const countriesCount = countries.length
	const proposed = [
		cityCount > 0
			? postalCode !== ''
				? `Ce code postal couvre ${cityCount} communes : choisis la tienne.`
				: `${cityCount} commune${cityCount > 1 ? 's' : ''} proposée${cityCount > 1 ? 's' : ''}.`
			: '',
		countriesCount > 0 ? `${countriesCount} pays proposé${countriesCount > 1 ? 's' : ''}.` : '',
	]
		.filter(Boolean)
		.join(' ')
	const status =
		announcement !== ''
			? announcement
			: state === 'recherche'
				? 'Recherche des communes…'
				: isOpen
					? proposed
					: state === 'rien'
						? 'Aucune commune ne correspond.'
						: ''

	const cityOption = (commune: SuggestedCity) =>
		postalCode !== '' ? `${commune.libelle} · ${postalCode}` : commune.libelle
	const optionClass = (position: number) =>
		`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-base ${
			position === active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
		}`

	return (
		<div className="flex flex-col gap-1">
			<input
				id={id}
				type="text"
				role="combobox"
				aria-expanded={isOpen}
				aria-controls={list}
				aria-autocomplete="list"
				aria-activedescendant={isOpen && active >= 0 ? `${list}-${active}` : undefined}
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
			<p role="status" className="text-neutral-700 text-sm">
				{status}
			</p>
			<div
				id={list}
				role="listbox"
				aria-label={onChoisirPays === undefined ? 'Communes proposées' : 'Communes et pays proposés'}
				hidden={!isOpen}
				className="flex flex-col overflow-hidden rounded-md border border-neutral-300 bg-white"
			>
				{suggestions.map((commune, position) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard works the options from the field (aria-activedescendant)
					<div
						key={commune.codeInsee}
						id={`${list}-${position}`}
						role="option"
						tabIndex={-1}
						aria-selected={position === active}
						// Pressing a suggestion must not take the focus from the field: its blur would close the list first.
						onMouseDown={evenement => evenement.preventDefault()}
						onClick={() => choose(commune)}
						className={optionClass(position)}
					>
						{cityOption(commune)}
					</div>
				))}
				{countriesCount > 0 ? (
					// biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox is a role, a fieldset is not allowed there
					<div role="group" aria-labelledby={`${list}-etranger`}>
						<div
							id={`${list}-etranger`}
							className="border-neutral-300 border-t bg-neutral-50 px-3 py-1 font-medium text-neutral-700 text-sm"
						>
							À l’étranger
						</div>
						{countries.map((country, indice) => {
							const position = cityCount + indice
							return (
								// biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard works the options from the field (aria-activedescendant)
								<div
									key={country.code}
									id={`${list}-${position}`}
									role="option"
									tabIndex={-1}
									aria-selected={position === active}
									onMouseDown={evenement => evenement.preventDefault()}
									onClick={() => chooseCountry(country)}
									className={optionClass(position)}
								>
									<span aria-hidden="true">{flag(country.code)}</span>
									{country.name}
								</div>
							)
						})}
					</div>
				) : null}
			</div>
			{state === 'adresse' ? (
				<p className="text-amber-900 text-sm">{REFUSED_ADDRESS_MESSAGE}</p>
			) : (
				<p className="text-neutral-700 text-sm">
					{onChoisirPays === undefined
						? 'Écris le nom de ta commune ou son code postal, puis choisis-la.'
						: 'Écris le nom de ta commune, son code postal ou un pays, puis choisis-le dans la liste.'}
				</p>
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
