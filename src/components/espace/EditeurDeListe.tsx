'use client'

import { type FormEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import {
	type DefinitionDeListe,
	erreursDeLaLigne,
	type LigneEnregistree,
	type ListeEnregistree,
	type ListeEnvoyee,
	ligneEstVide,
	ligneVide,
	MESSAGES_DE_LISTE,
	memeLigne,
	nettoyerLaLigne,
	rangApresRetrait,
	type ValeursDeLigne,
} from '@/lib/espace/liste'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDeLaListe = (liste: ListeEnvoyee) => Promise<ResultatDEnregistrement<ListeEnregistree>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const BOUTON_DE_LIGNE = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-sm'
const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/** A row in the panel. `cle` is the key of its display: it belongs to the row, never to what it says (L1, L2). */
interface LigneEditee {
	readonly cle: string
	/** The identifier the server gave to the row; none for a row just added. */
	readonly id: string | null
	readonly valeurs: ValeursDeLigne
}

type CibleDuFocus =
	| { genre: 'retirer'; cle: string; n: number }
	| { genre: 'formulaire'; n: number }
	| { genre: 'titre'; n: number }

let compteurDeCles = 0
const nouvelleCle = (): string => `ligne-${++compteurDeCles}`

/** Held down, Enter repeats: a button acts once (L7). */
function ignorerLaRepetition(evenement: KeyboardEvent<HTMLElement>): void {
	if (evenement.key === 'Enter' && evenement.repeat) evenement.preventDefault()
}

/**
 * The button « Modifier » of the card of a list, and the panel it opens (tickets 129 to 131): the
 * rows of the list, and a form that adds a row or changes the one she chose. « Enregistrer » sends
 * the whole list. The section is described by a `DefinitionDeListe`; this component knows nothing of
 * experiences, courses or offers.
 *
 * The seven rules of the lists edited in place (docs/qualite.md §3) are held here:
 * - L1 every row has a key of its own, made when it is created; it never comes from its content;
 * - L2 the key of a row does not change when she types, so typing never moves the focus;
 * - L3 removing the row being edited puts the form back to « Ajouter » and keeps what was typed;
 * - L4 after a removal the focus stays in the panel;
 * - L5 each removal is said in a zone `role="status"` that is there, empty, when the panel opens;
 * - L6 a row identical to one of the list is refused, with a message; a row validated unchanged is not;
 * - L7 a button acts once when Enter is held down.
 *
 * The card changes only once the server has stored the list; a failure keeps the old list and what she
 * typed, and says so (E31).
 */
export function EditeurDeListe({
	definition,
	lignes,
	envoyer,
	libelleDuBouton,
	titre,
	annonceEnregistre,
}: {
	definition: DefinitionDeListe
	lignes: readonly LigneEnregistree[]
	envoyer: EnvoiDeLaListe
	/** The name of the button that opens the panel. */
	libelleDuBouton: string
	titre: string
	annonceEnregistre: string
}) {
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	const declencheur = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label={libelleDuBouton}
				onClick={() => {
					setAnnonce('')
					setOuvert(true)
				}}
				onKeyDown={ignorerLaRepetition}
				className={`${BOUTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{annonce}
			</p>
			{ouvert ? (
				<PanneauDeListe
					definition={definition}
					lignes={lignes}
					envoyer={envoyer}
					titre={titre}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce(annonceEnregistre)
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function PanneauDeListe({
	definition,
	lignes: depart,
	envoyer,
	titre,
	retour,
	onEnregistre,
	onFermer,
}: {
	definition: DefinitionDeListe
	lignes: readonly LigneEnregistree[]
	envoyer: EnvoiDeLaListe
	titre: string
	retour: RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const { section, champs, singulier } = definition
	const vide = ligneVide(definition)
	const [lignes, setLignes] = useState<LigneEditee[]>(() =>
		depart.map(ligne => ({ cle: nouvelleCle(), id: ligne.id, valeurs: ligne.valeurs }))
	)
	const [initiales] = useState(depart)
	const [formulaire, setFormulaire] = useState<ValeursDeLigne>(vide)
	const [enEdition, setEnEdition] = useState<string | null>(null)
	const [erreurs, setErreurs] = useState<Readonly<Record<string, string>>>({})
	const [doublon, setDoublon] = useState('')
	const [annonce, setAnnonce] = useState({ phrase: '', rang: 0 })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const [cible, setCible] = useState<CibleDuFocus | null>(null)
	const racine = useRef<HTMLDivElement>(null)
	const verrou = useRef(false)
	const pointeur = useRef(false)

	// What the form holds, compared with what it started from: the row being edited, or an empty row.
	const ligneEditee = lignes.find(ligne => ligne.cle === enEdition)
	const depuisLeFormulaire = nettoyerLaLigne(definition, formulaire)
	const formulaireEnCours =
		ligneEditee === undefined
			? !ligneEstVide(definition, depuisLeFormulaire)
			: !memeLigne(definition, ligneEditee.valeurs, depuisLeFormulaire)
	const listeModifiee =
		lignes.length !== initiales.length ||
		lignes.some(
			(ligne, rang) =>
				ligne.id !== initiales[rang]?.id ||
				(initiales[rang] !== undefined && !memeLigne(definition, ligne.valeurs, initiales[rang].valeurs))
		)

	// The focus, once the rows have been drawn again.
	useEffect(() => {
		if (cible === null) return
		const dialogue = racine.current?.closest('[role="dialog"]')
		if (cible.genre === 'retirer') {
			racine.current?.querySelector<HTMLElement>(`[data-retirer="${cible.cle}"]`)?.focus()
		} else if (cible.genre === 'formulaire') {
			racine.current?.querySelector<HTMLElement>(`#${section}-${champs[0]?.nom}`)?.focus()
		} else {
			const entete = dialogue?.querySelector<HTMLElement>('h2')
			entete?.setAttribute('tabindex', '-1')
			entete?.focus()
		}
	}, [cible, section, champs])

	function surChamp(nom: string, valeur: string) {
		setFormulaire(avant => ({ ...avant, [nom]: valeur }))
		setDoublon('')
		setMessage('')
		setErreurs(avant =>
			avant[nom] === undefined ? avant : Object.fromEntries(Object.entries(avant).filter(([cle]) => cle !== nom))
		)
	}

	function remettreLeFormulaire() {
		setFormulaire(vide)
		setEnEdition(null)
		setErreurs({})
		setDoublon('')
	}

	function validerLaLigne(evenement: FormEvent<HTMLFormElement>) {
		evenement.preventDefault()
		const valeurs = nettoyerLaLigne(definition, formulaire)
		const refus = erreursDeLaLigne(definition, valeurs, { avecRequis: true, maintenant: new Date() })
		if (Object.keys(refus).length > 0) {
			setErreurs(refus)
			setDoublon('')
			const premier = champs.find(({ nom }) => refus[nom] !== undefined)
			if (premier) racine.current?.querySelector<HTMLElement>(`#${section}-${premier.nom}`)?.focus()
			return
		}
		// Validated as it was loaded, a row changes nothing; any other copy of a listed row is refused (L6).
		const inchangee = ligneEditee !== undefined && memeLigne(definition, ligneEditee.valeurs, valeurs)
		if (!inchangee && lignes.some(ligne => ligne.cle !== enEdition && memeLigne(definition, ligne.valeurs, valeurs))) {
			setDoublon(definition.doublon)
			return
		}
		setMessage('')
		setLignes(avant =>
			ligneEditee === undefined
				? [...avant, { cle: nouvelleCle(), id: null, valeurs }]
				: avant.map(ligne => (ligne.cle === enEdition ? { ...ligne, valeurs } : ligne))
		)
		remettreLeFormulaire()
	}

	function modifier(ligne: LigneEditee) {
		setFormulaire(ligne.valeurs)
		setEnEdition(ligne.cle)
		setErreurs({})
		setDoublon('')
		setMessage('')
		setCible({ genre: 'formulaire', n: (cible?.n ?? 0) + 1 })
	}

	function retirer(ligne: LigneEditee, rang: number) {
		const clavier = !pointeur.current
		pointeur.current = false
		const restantes = lignes.filter(autre => autre.cle !== ligne.cle)
		setLignes(restantes)
		setMessage('')
		setAnnonce(({ rang: n }) => ({ phrase: definition.retrait(definition.nom(ligne.valeurs)), rang: n + 1 }))
		if (ligne.cle === enEdition) {
			// The row being edited is gone: back to « Ajouter ». What was typed over it stays, to be added as a
			// new row; a form left as it was loaded is emptied, or a reflex click would put the row back (L3).
			if (memeLigne(definition, ligne.valeurs, nettoyerLaLigne(definition, formulaire))) remettreLeFormulaire()
			else {
				setEnEdition(null)
				setErreurs({})
				setDoublon('')
			}
		}
		const suivant = rangApresRetrait(restantes.length, rang)
		const n = (cible?.n ?? 0) + 1
		const restante = suivant === null ? undefined : restantes[suivant]
		if (restante !== undefined) setCible({ genre: 'retirer', cle: restante.cle, n })
		// Emptied, the list sends the focus to the form, unless she clicked or tapped: a field would open the keyboard.
		else setCible(clavier ? { genre: 'formulaire', n } : { genre: 'titre', n })
	}

	async function enregistrer() {
		if (verrou.current) return
		if (formulaireEnCours) {
			setMessage(MESSAGES_DE_LISTE.enCours)
			return
		}
		verrou.current = true
		setEnCours(true)
		setMessage('')
		try {
			const resultat: ResultatDEnregistrement<ListeEnregistree> = await envoyer({
				lignes: lignes.map(ligne =>
					ligne.id === null ? { valeurs: ligne.valeurs } : { id: ligne.id, valeurs: ligne.valeurs }
				),
			}).catch(() => ({ ok: false, message: MESSAGE_ECHEC }))
			if (resultat.ok) {
				onEnregistre()
				return
			}
			setMessage(resultat.champs?.lignes ? `${resultat.message} ${resultat.champs.lignes}` : resultat.message)
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	const indice = definition.indice?.(depuisLeFormulaire) ?? ''

	return (
		<PanneauDEdition
			titre={titre}
			enCours={enCours}
			modifie={listeModifiee || formulaireEnCours}
			retour={retour}
			onFermer={onFermer}
		>
			<div ref={racine} className="flex flex-col gap-4" aria-busy={enCours}>
				{/* Said to a screen reader; there, and empty, when the panel opens (L5). Each sentence is a new node. */}
				<div role="status" aria-live="polite" className="sr-only">
					<span key={annonce.rang}>{annonce.phrase}</span>
				</div>
				{lignes.length === 0 ? (
					<p className="text-neutral-700 text-sm">{MESSAGES_DE_LISTE.aucune(singulier)}</p>
				) : (
					<ul className="flex flex-col gap-2" aria-label={`Tes ${definition.pluriel}`}>
						{lignes.map((ligne, rang) => {
							const nom = definition.nom(ligne.valeurs)
							return (
								<li
									key={ligne.cle}
									data-ligne
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-300 p-3"
								>
									<span className="min-w-0 break-words text-sm">
										{definition.resume(ligne.valeurs) || '(sans nom)'}
									</span>
									<span className="flex gap-2">
										<button
											type="button"
											aria-label={`Modifier ${definition.designation} ${nom}`.trim()}
											onKeyDown={ignorerLaRepetition}
											onClick={() => modifier(ligne)}
											className={BOUTON_DE_LIGNE}
										>
											Modifier
										</button>
										<button
											type="button"
											data-retirer={ligne.cle}
											aria-label={`Retirer ${definition.designation} ${nom}`.trim()}
											onKeyDown={evenement => {
												pointeur.current = false
												ignorerLaRepetition(evenement)
											}}
											onMouseDown={() => {
												pointeur.current = true
											}}
											onPointerDown={() => {
												pointeur.current = true
											}}
											onClick={() => retirer(ligne, rang)}
											className={BOUTON_DE_LIGNE}
										>
											Retirer
										</button>
									</span>
								</li>
							)
						})}
					</ul>
				)}
				<form noValidate id={`${section}-ligne`} onSubmit={validerLaLigne} className="flex flex-col gap-4">
					<h3 className="font-semibold text-base">
						{enEdition === null ? `Ajouter une ${singulier}` : `Modifier cette ${singulier}`}
					</h3>
					<p className="text-neutral-700 text-sm">
						Obligatoire :{' '}
						{champs
							.filter(({ nom }) => definition.requis[nom])
							.map(({ libelle }) => libelle.toLowerCase())
							.join(', ')}
						.
					</p>
					{champs.map(champ => {
						const identifiant = `${section}-${champ.nom}`
						const erreur = erreurs[champ.nom]
						const decrit = [champ.aide ? `${identifiant}-aide` : '', erreur ? `${identifiant}-erreur` : '']
							.concat(champ.nom === 'prix' && indice ? [`${identifiant}-indice`] : [])
							.filter(Boolean)
							.join(' ')
						const commun = {
							id: identifiant,
							name: champ.nom,
							value: formulaire[champ.nom] ?? '',
							autoComplete: 'off',
							'aria-required': definition.requis[champ.nom] ? (true as const) : undefined,
							'aria-invalid': erreur ? (true as const) : undefined,
							'aria-describedby': decrit || undefined,
							className: CHAMP,
						}
						return (
							<div key={champ.nom} className="flex flex-col gap-1">
								<label htmlFor={identifiant} className="font-medium text-sm">
									{champ.libelle}
								</label>
								{champ.genre === 'long' ? (
									<textarea {...commun} rows={4} onChange={evenement => surChamp(champ.nom, evenement.target.value)} />
								) : (
									<input
										{...commun}
										type={champ.genre === 'date' ? 'date' : 'text'}
										placeholder={champ.exemple}
										onChange={evenement => surChamp(champ.nom, evenement.target.value)}
									/>
								)}
								{champ.aide ? (
									<p id={`${identifiant}-aide`} className="text-neutral-700 text-sm">
										{champ.aide}
									</p>
								) : null}
								{champ.nom === 'prix' && indice ? (
									<p id={`${identifiant}-indice`} className="text-neutral-700 text-sm">
										{indice}
									</p>
								) : null}
								{erreur ? (
									<p id={`${identifiant}-erreur`} className="text-red-800 text-sm">
										{erreur}
									</p>
								) : null}
							</div>
						)
					})}
					{doublon ? (
						<p id={`${section}-doublon`} role="alert" className="rounded-md bg-amber-50 p-3 text-amber-900 text-sm">
							{doublon}
						</p>
					) : null}
					<div className="flex flex-wrap gap-3">
						<button
							type="submit"
							onKeyDown={ignorerLaRepetition}
							className={`${BOUTON} border border-neutral-400 bg-white`}
						>
							{enEdition === null ? 'Ajouter' : 'Valider la modification'}
						</button>
						{enEdition === null ? null : (
							<button
								type="button"
								onKeyDown={ignorerLaRepetition}
								onClick={remettreLeFormulaire}
								className={`${BOUTON} border border-neutral-400 bg-white`}
							>
								Annuler la modification
							</button>
						)}
					</div>
				</form>
				<div role="alert">
					{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
				</div>
				<button
					type="button"
					disabled={enCours}
					onKeyDown={ignorerLaRepetition}
					onClick={() => void enregistrer()}
					className={`${BOUTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
				>
					{enCours ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</div>
		</PanneauDEdition>
	)
}
