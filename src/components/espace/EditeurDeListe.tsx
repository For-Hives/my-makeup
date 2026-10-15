'use client'

import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react'
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
	memesLignes,
	nettoyerLaLigne,
	rangApresRetrait,
	type ValeursDeLigne,
} from '@/lib/espace/liste'
import { mesurerLEnregistrement, sectionMesureeDeLaListe } from '@/lib/espace/mesure'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import {
	BOUTON,
	BOUTON_DE_LIGNE,
	CHAMP,
	ignorerLaRepetition,
	nouvelleCle,
	type LigneEditee as OptionEditee,
} from './aides-de-liste'
import { EditeurDOptions, erreursDesOptions } from './EditeurDOptions'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDeLaListe = (liste: ListeEnvoyee) => Promise<ResultatDEnregistrement<ListeEnregistree>>

/** A row in the panel. `cle` is the key of its display: it belongs to the row, never to what it says (L1, L2). */
interface LigneEditee extends OptionEditee {
	/** Its own list, for a section that has one (the options of an offer, ticket 132). */
	readonly options: readonly OptionEditee[]
}

type CibleDuFocus =
	| { genre: 'retirer'; cle: string; n: number }
	| { genre: 'formulaire'; n: number }
	| { genre: 'titre'; n: number }

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
		depart.map(ligne => ({
			cle: nouvelleCle(),
			id: ligne.id,
			valeurs: ligne.valeurs,
			options: (ligne.options ?? []).map(option => ({ cle: nouvelleCle(), id: option.id, valeurs: option.valeurs })),
		}))
	)
	const [initiales] = useState(depart)
	const definitionDesOptions = definition.options
	const [formulaire, setFormulaire] = useState<ValeursDeLigne>(vide)
	// The options of the row in the form, and the text of the small form that adds one (ticket 132).
	const [optionsDuFormulaire, setOptionsDuFormulaire] = useState<OptionEditee[]>([])
	const [saisieDOption, setSaisieDOption] = useState<ValeursDeLigne>(
		definitionDesOptions === undefined ? {} : ligneVide(definitionDesOptions)
	)
	const [refusDesOptions, setRefusDesOptions] = useState('')
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
	const optionsNettoyees = optionsDuFormulaire.map(option => ({
		...option,
		valeurs: definitionDesOptions ? nettoyerLaLigne(definitionDesOptions, option.valeurs) : option.valeurs,
	}))
	/** True when two lists of options say the same; a section without options has none to compare. */
	const memesOptions = (a: readonly { valeurs: ValeursDeLigne }[], b: readonly { valeurs: ValeursDeLigne }[]) =>
		definitionDesOptions === undefined || memesLignes(definitionDesOptions, a, b)
	const optionEnCours =
		definitionDesOptions !== undefined &&
		!ligneEstVide(definitionDesOptions, nettoyerLaLigne(definitionDesOptions, saisieDOption))
	const formulaireEnCours =
		optionEnCours ||
		(ligneEditee === undefined
			? !ligneEstVide(definition, depuisLeFormulaire) || optionsDuFormulaire.length > 0
			: !memeLigne(definition, ligneEditee.valeurs, depuisLeFormulaire) ||
				!memesOptions(optionsNettoyees, ligneEditee.options))
	const listeModifiee =
		lignes.length !== initiales.length ||
		lignes.some((ligne, rang) => {
			const depart = initiales[rang]
			return (
				ligne.id !== depart?.id ||
				(depart !== undefined &&
					(!memeLigne(definition, ligne.valeurs, depart.valeurs) ||
						!memesOptions(ligne.options, depart.options ?? []) ||
						ligne.options.map(option => option.id).join() !== (depart.options ?? []).map(option => option.id).join()))
			)
		})

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
		setOptionsDuFormulaire([])
		if (definitionDesOptions) setSaisieDOption(ligneVide(definitionDesOptions))
		setRefusDesOptions('')
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
		if (definitionDesOptions !== undefined && !optionsSontValides(definitionDesOptions)) return
		// Validated as it was loaded, a row changes nothing; any other copy of a listed row is refused (L6).
		const memeQue = (ligne: LigneEditee) =>
			memeLigne(definition, ligne.valeurs, valeurs) && memesOptions(ligne.options, optionsNettoyees)
		const inchangee = ligneEditee !== undefined && memeQue(ligneEditee)
		if (!inchangee && lignes.some(ligne => ligne.cle !== enEdition && memeQue(ligne))) {
			setDoublon(definition.doublon)
			return
		}
		setMessage('')
		setLignes(avant =>
			ligneEditee === undefined
				? [...avant, { cle: nouvelleCle(), id: null, valeurs, options: optionsNettoyees }]
				: avant.map(ligne => (ligne.cle === enEdition ? { ...ligne, valeurs, options: optionsNettoyees } : ligne))
		)
		remettreLeFormulaire()
	}

	/**
	 * The options of the row in the form, before the row is validated (ticket 132): nothing left typed in the
	 * small form that adds one, every option within its bounds, no two alike. Says why, and puts the focus
	 * where it is wrong.
	 */
	function optionsSontValides(options: DefinitionDeListe): boolean {
		if (optionEnCours) {
			setRefusDesOptions(MESSAGES_DE_LISTE.optionEnCours)
			racine.current?.querySelector<HTMLElement>(`#options-${options.champs[0]?.nom}`)?.focus()
			return false
		}
		const erreurs = erreursDesOptions(options, optionsDuFormulaire, new Date())
		const fautive = optionsDuFormulaire.find(option => erreurs[option.cle] !== undefined)
		if (fautive) {
			const champ = options.champs.find(({ nom }) => erreurs[fautive.cle]?.[nom] !== undefined)
			racine.current?.querySelector<HTMLElement>(`#option-${fautive.cle}-${champ?.nom}`)?.focus()
			return false
		}
		if (
			optionsNettoyees.some((option, rang) =>
				optionsNettoyees.slice(0, rang).some(autre => memeLigne(options, autre.valeurs, option.valeurs))
			)
		) {
			setRefusDesOptions(options.doublon)
			racine.current?.querySelector<HTMLElement>(`#options-${options.champs[0]?.nom}`)?.focus()
			return false
		}
		return true
	}

	function modifier(ligne: LigneEditee) {
		setOptionsDuFormulaire(ligne.options.map(option => ({ ...option })))
		if (definitionDesOptions) setSaisieDOption(ligneVide(definitionDesOptions))
		setRefusDesOptions('')
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
			if (memeLigne(definition, ligne.valeurs, depuisLeFormulaire) && memesOptions(ligne.options, optionsNettoyees))
				remettreLeFormulaire()
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
				lignes: lignes.map(ligne => ({
					...(ligne.id === null ? {} : { id: ligne.id }),
					valeurs: ligne.valeurs,
					// A section with options always sends them, so that removing the last one is saved too.
					...(definitionDesOptions === undefined
						? {}
						: {
								options: ligne.options.map(option => ({
									...(option.id === null ? {} : { id: option.id }),
									valeurs: option.valeurs,
								})),
							}),
				})),
			}).catch(() => ({ ok: false, message: MESSAGE_ECHEC }))
			mesurerLEnregistrement(sectionMesureeDeLaListe(section), resultat)
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
										{ligne.options.length > 0
											? ` (${ligne.options.length} option${ligne.options.length > 1 ? 's' : ''})`
											: ''}
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
					{definitionDesOptions ? (
						<EditeurDOptions
							definition={definitionDesOptions}
							options={optionsDuFormulaire}
							onOptions={setOptionsDuFormulaire}
							saisie={saisieDOption}
							onSaisie={setSaisieDOption}
							refus={refusDesOptions}
							onRefus={setRefusDesOptions}
							annoncer={phrase => setAnnonce(({ rang }) => ({ phrase, rang: rang + 1 }))}
						/>
					) : null}
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
