'use client'

import { type FormEvent, useLayoutEffect, useRef, useState } from 'react'
import { mesurerLEnregistrement } from '@/lib/espace/mesure'
import {
	type ChampDePuces,
	COMPETENCES,
	LANGUES,
	lireLesNoms,
	type Puce,
	type SorteDePuces,
	type ValeursDesPuces,
} from '@/lib/espace/puces'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDesPuces = (saisie: {
	puces: { id?: string; nom: string }[]
}) => Promise<ResultatDEnregistrement<ValeursDesPuces>>

const SORTES: Record<ChampDePuces, SorteDePuces> = { langues: LANGUES, competences: COMPETENCES }

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'
/** The prefix of the identifier of a chip added in the panel: never sent, never stored. */
const LOCAL = 'nouveau-'

const memesPuces = (a: readonly Puce[], b: readonly Puce[]): boolean =>
	a.length === b.length && a.every((puce, rang) => puce.id === b[rang]?.id && puce.nom === b[rang]?.nom)

/**
 * The button « Modifier » of a card of chips (languages: ticket 127, skills: ticket 128) and the
 * panel it opens. Same contract as the identity (src/components/espace/EditeurDIdentite.tsx): the
 * card shows only what the database stored; a failure keeps the old list and what she did, and
 * says so (E31); one request for two clicks; the result is announced outside of the panel.
 *
 * The seven rules of the lists edited in place (docs/qualite.md §3) are kept in `FormulaireDePuces`.
 */
export function EditeurDePuces({
	liste,
	puces,
	envoyer,
}: {
	/** The list, by name: the kinds hold functions, which a server page cannot hand to the browser. */
	liste: ChampDePuces
	puces: readonly Puce[]
	envoyer: EnvoiDesPuces
}) {
	const sorte = SORTES[liste]
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	// What the database stored last: the panel opens on it, whether or not the page was refreshed yet.
	const [stockees, setStockees] = useState(puces)
	const declencheur = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label={sorte.bouton}
				onClick={() => {
					setAnnonce('')
					setOuvert(true)
				}}
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className={`${BOUTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{annonce}
			</p>
			{ouvert ? (
				<FormulaireDePuces
					sorte={sorte}
					initiales={stockees}
					envoyer={envoyer}
					retour={declencheur}
					onEnregistre={enregistrees => {
						setStockees(enregistrees)
						setAnnonce(sorte.enregistre)
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDePuces({
	sorte,
	initiales,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	sorte: SorteDePuces
	initiales: readonly Puce[]
	envoyer: EnvoiDesPuces
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: (puces: readonly Puce[]) => void
	onFermer: () => void
}) {
	const [puces, setPuces] = useState<readonly Puce[]>(initiales)
	const [saisie, setSaisie] = useState('')
	// The refusal of the name she is typing, said near the field (L6).
	const [refus, setRefus] = useState('')
	// What the screen readers hear when a chip leaves (L5). `rang` changes at every removal, so two
	// removals of the same name are two sentences.
	const [annonce, setAnnonce] = useState({ phrase: '', rang: 0 })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)
	const compteur = useRef(0)
	const zone = useRef<HTMLDivElement>(null)
	const champ = useRef<HTMLInputElement>(null)
	// Set by a removal, read once the chip is gone: where the focus goes (L4).
	const apresRetrait = useRef<{ rang: number; clavier: boolean } | null>(null)

	useLayoutEffect(() => {
		const retrait = apresRetrait.current
		if (retrait === null) return
		apresRetrait.current = null
		const boutons = [...(zone.current?.querySelectorAll<HTMLElement>('[data-retirer]') ?? [])]
		// The chip that takes the place of the one removed, else the one above it.
		const cible = boutons[retrait.rang] ?? boutons[retrait.rang - 1]
		if (cible !== undefined) cible.focus()
		// The list is empty. A key goes to the field to add; a click or a tap goes to the title, so
		// that the keyboard of the phone stays closed.
		else if (retrait.clavier) champ.current?.focus()
		else zone.current?.closest<HTMLElement>('[role="dialog"]')?.querySelector<HTMLElement>('h2')?.focus()
	}, [puces])

	/** Adds what the field holds. Returns the list after the addition, `null` when a name is refused. */
	function ajouter(finale: boolean): readonly Puce[] | null {
		const lues = lireLesNoms(saisie, puces, sorte, finale)
		const ajoutees = lues.noms.map(nom => ({ id: `${LOCAL}${++compteur.current}`, nom }))
		const suite = ajoutees.length > 0 ? [...puces, ...ajoutees] : puces
		if (ajoutees.length > 0) setPuces(suite)
		setSaisie(lues.reste)
		setRefus(lues.ok ? '' : lues.message)
		return lues.ok ? suite : null
	}

	function retirer(rang: number, puce: Puce, clavier: boolean) {
		apresRetrait.current = { rang, clavier }
		setAnnonce(({ rang: dernier }) => ({
			phrase: sorte.retiree(puce.nom).replace(/\s+/g, ' ').trim(),
			rang: dernier + 1,
		}))
		setPuces(courantes => courantes.filter(autre => autre.id !== puce.id))
		// The refusal of a name that was in the list is no longer true once the name is free.
		setRefus('')
	}

	async function enregistrer(evenement: FormEvent) {
		evenement.preventDefault()
		if (verrou.current) return
		verrou.current = true
		try {
			// What she typed and did not add yet is added, not lost; a refused name stops the save.
			const liste = saisie.trim() === '' ? puces : ajouter(true)
			if (liste === null) return
			setEnCours(true)
			setMessage('')
			const resultat: ResultatDEnregistrement<ValeursDesPuces> = await envoyer({
				puces: liste.map(({ id, nom }) => (id.startsWith(LOCAL) ? { nom } : { id, nom })),
			}).catch(() => ({ ok: false, message: MESSAGE_ECHEC }))
			mesurerLEnregistrement(sorte.champ, resultat)
			if (resultat.ok) {
				onEnregistre(resultat.valeurs.puces)
				return
			}
			setMessage(resultat.message)
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	return (
		<PanneauDEdition
			titre={sorte.titre}
			enCours={enCours}
			modifie={saisie.trim() !== '' || !memesPuces(puces, initiales)}
			retour={retour}
			onFermer={onFermer}
		>
			<div ref={zone}>
				<form noValidate aria-busy={enCours} onSubmit={enregistrer} className="flex flex-col gap-4">
					<p className="text-neutral-700 text-sm">{sorte.explication}</p>
					<div className="flex flex-col gap-1">
						<label htmlFor="puces-champ" className="font-medium text-sm">
							{sorte.libelle}
						</label>
						<div className="flex flex-wrap gap-2">
							<input
								ref={champ}
								id="puces-champ"
								type="text"
								autoComplete="off"
								enterKeyHint="enter"
								value={saisie}
								aria-invalid={refus ? true : undefined}
								aria-describedby={refus ? 'puces-refus' : undefined}
								className={`${CHAMP} min-w-0 flex-1`}
								onChange={evenement => {
									setSaisie(evenement.target.value)
									setRefus('')
									// A « ; » ends a name: what is before it is added at once.
									if (evenement.target.value.includes(';')) {
										const lues = lireLesNoms(evenement.target.value, puces, sorte, false)
										const ajoutees = lues.noms.map(nom => ({ id: `${LOCAL}${++compteur.current}`, nom }))
										if (ajoutees.length > 0) setPuces([...puces, ...ajoutees])
										setSaisie(lues.reste)
										setRefus(lues.ok ? '' : lues.message)
									}
								}}
								onKeyDown={evenement => {
									if (evenement.key !== 'Enter') return
									// Enter never sends the form from here, and held down it acts once.
									evenement.preventDefault()
									if (!evenement.repeat) ajouter(true)
								}}
							/>
							<button
								type="button"
								onClick={() => {
									ajouter(true)
									champ.current?.focus()
								}}
								onKeyDown={evenement => {
									if (evenement.repeat) evenement.preventDefault()
								}}
								className={`${BOUTON} border border-neutral-400 bg-white`}
							>
								Ajouter
							</button>
						</div>
						<div role="alert">
							{refus ? (
								<p id="puces-refus" className="text-red-800 text-sm">
									{refus}
								</p>
							) : null}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-sm">{sorte.ajoutees}</h3>
						{puces.length === 0 ? (
							<p className="text-neutral-600 text-sm italic">{sorte.vide}</p>
						) : (
							<ul className="flex flex-wrap gap-2">
								{puces.map((puce, rang) => (
									<li key={puce.id}>
										<button
											type="button"
											data-retirer
											aria-label={`Retirer ${puce.nom}`}
											onKeyDown={evenement => {
												if (evenement.repeat) evenement.preventDefault()
											}}
											// detail 0: Enter or Space. A click or a tap has a count of 1 or more.
											onClick={evenement => retirer(rang, puce, evenement.detail === 0)}
											className="flex min-h-11 items-center gap-2 rounded-full bg-neutral-100 px-4 text-sm"
										>
											<span>{puce.nom}</span>
											<span aria-hidden="true">×</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
					<div role="status" aria-live="polite" className="sr-only" data-testid="annonce-de-retrait">
						<span key={annonce.rang}>{annonce.phrase}</span>
					</div>
					<div role="alert">
						{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
					</div>
					<button
						type="submit"
						disabled={enCours}
						className={`${BOUTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
					>
						{enCours ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				</form>
			</div>
		</PanneauDEdition>
	)
}
