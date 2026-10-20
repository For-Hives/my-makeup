'use client'

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import {
	type CommuneProposee,
	MESSAGE_ADRESSE_REFUSEE,
	RECHERCHE_MIN,
	type ResultatDeRecherche,
} from '@/lib/dashboard/location'

export type RechercheDeCommunes = (texte: string) => Promise<ResultatDeRecherche>

/** The pause after the last key before the list is asked. */
export const PAUSE_DE_LA_RECHERCHE_MS = 250

const CHAMP = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

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
export function ChampDeCommune({
	libelleInitial,
	chercher,
	onChoisir,
	erreur,
	idErreur,
	id,
}: {
	/** « Annecy (74) », or '' when no commune is stored yet. */
	libelleInitial: string
	chercher: RechercheDeCommunes
	onChoisir: (commune: CommuneProposee | null) => void
	erreur: string
	idErreur: string
	id: string
}) {
	const liste = useId()
	const [texte, setTexte] = useState(libelleInitial)
	const [propositions, setPropositions] = useState<CommuneProposee[]>([])
	const [ouvert, setOuvert] = useState(false)
	const [actif, setActif] = useState(-1)
	const [etat, setEtat] = useState<'repos' | 'recherche' | 'rien' | 'panne' | 'adresse'>('repos')
	const [messagePanne, setMessagePanne] = useState('')
	const question = useRef(0)
	const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(
		() => () => {
			clearTimeout(pause.current)
			question.current += 1
		},
		[]
	)

	function fermer() {
		setOuvert(false)
		setActif(-1)
	}

	function saisir(valeur: string) {
		setTexte(valeur)
		// Typing takes the commune back: free text is never one.
		onChoisir(null)
		clearTimeout(pause.current)
		const numero = ++question.current
		if (valeur.trim().length < RECHERCHE_MIN) {
			setPropositions([])
			setEtat('repos')
			fermer()
			return
		}
		setEtat('recherche')
		pause.current = setTimeout(() => {
			void chercher(valeur)
				.catch(
					(): ResultatDeRecherche => ({ ok: false, message: 'La recherche n’a pas abouti : réessaie dans un instant.' })
				)
				.then(resultat => {
					if (numero !== question.current) return
					if (!resultat.ok) {
						setPropositions([])
						setMessagePanne(resultat.message)
						setEtat('panne')
						fermer()
						return
					}
					setPropositions(resultat.communes)
					setActif(-1)
					setEtat(resultat.motif === 'adresse' ? 'adresse' : resultat.communes.length === 0 ? 'rien' : 'repos')
					setOuvert(resultat.communes.length > 0)
				})
		}, PAUSE_DE_LA_RECHERCHE_MS)
	}

	function choisir(commune: CommuneProposee) {
		clearTimeout(pause.current)
		question.current += 1
		setTexte(commune.libelle)
		setEtat('repos')
		fermer()
		onChoisir(commune)
	}

	function surTouche(evenement: KeyboardEvent<HTMLInputElement>) {
		const { key } = evenement
		if (key === 'ArrowDown' || key === 'ArrowUp') {
			if (propositions.length === 0) return
			evenement.preventDefault()
			const pas = key === 'ArrowDown' ? 1 : -1
			setOuvert(true)
			setActif(courant => (courant + pas + propositions.length) % propositions.length)
		} else if (key === 'Enter' && ouvert && actif >= 0) {
			// The suggestion in focus is chosen; the form is not sent by this Enter.
			evenement.preventDefault()
			const choisie = propositions[actif]
			if (choisie) choisir(choisie)
		} else if (key === 'Escape' && ouvert) {
			// The list closes; the panel stays.
			evenement.preventDefault()
			evenement.stopPropagation()
			fermer()
		}
	}

	const statut =
		etat === 'recherche'
			? 'Recherche des communes…'
			: ouvert
				? `${propositions.length} commune${propositions.length > 1 ? 's' : ''} proposée${propositions.length > 1 ? 's' : ''}.`
				: etat === 'rien'
					? 'Aucune commune ne correspond.'
					: ''

	return (
		<div className="flex flex-col gap-1">
			<input
				id={id}
				type="text"
				role="combobox"
				aria-expanded={ouvert}
				aria-controls={liste}
				aria-autocomplete="list"
				aria-activedescendant={ouvert && actif >= 0 ? `${liste}-${actif}` : undefined}
				aria-invalid={erreur ? true : undefined}
				aria-describedby={erreur ? idErreur : undefined}
				autoComplete="off"
				autoCapitalize="off"
				spellCheck={false}
				value={texte}
				onChange={evenement => saisir(evenement.target.value)}
				onKeyDown={surTouche}
				onBlur={fermer}
				className={CHAMP}
			/>
			<div
				id={liste}
				role="listbox"
				aria-label="Communes proposées"
				hidden={!ouvert}
				className="flex flex-col overflow-hidden rounded-md border border-neutral-300 bg-white"
			>
				{propositions.map((commune, rang) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard works the options from the field (aria-activedescendant)
					<div
						key={commune.codeInsee}
						id={`${liste}-${rang}`}
						role="option"
						tabIndex={-1}
						aria-selected={rang === actif}
						// Pressing a suggestion must not take the focus from the field: its blur would close the list first.
						onMouseDown={evenement => evenement.preventDefault()}
						onClick={() => choisir(commune)}
						className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-base ${
							rang === actif ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
						}`}
					>
						{commune.libelle}
					</div>
				))}
			</div>
			<p role="status" className="text-neutral-700 text-sm">
				{statut}
			</p>
			{etat === 'adresse' ? (
				<p className="text-amber-900 text-sm">{MESSAGE_ADRESSE_REFUSEE}</p>
			) : (
				<p className="text-neutral-700 text-sm">Écris le nom de ta commune ou son code postal, puis choisis-la.</p>
			)}
			{etat === 'panne' ? (
				<p role="alert" className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
					{messagePanne}
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
