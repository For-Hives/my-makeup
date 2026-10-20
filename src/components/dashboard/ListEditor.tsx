'use client'

import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { trackedListSection, trackSave } from '@/lib/dashboard/analytics'
import {
	cleanRow,
	emptyRow,
	LIST_MESSAGES,
	type ListDefinition,
	type RowValues,
	rankAfterRemoval,
	rowErrors,
	rowIsEmpty,
	type SavedList,
	type SavedRow,
	type SentList,
	sameRow,
	sameRows,
} from '@/lib/dashboard/list'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { EditingPanel } from './EditingPanel'
import { BUTTON, FIELD, ignoreRepeat, newKey, type EditedRow as OptionEditee, ROW_BUTTON } from './list-helpers'
import { OptionsEditor, optionsErrors } from './OptionsEditor'

export type ListUpload = (liste: SentList) => Promise<SaveResult<SavedList>>

/** A row in the panel. `cle` is the key of its display: it belongs to the row, never to what it says (L1, L2). */
interface EditedRow extends OptionEditee {
	/** Its own list, for a section that has one (the options of an offer, ticket 132). */
	readonly options: readonly OptionEditee[]
}

type FocusTarget =
	| { genre: 'retirer'; cle: string; n: number }
	| { genre: 'formulaire'; n: number }
	| { genre: 'titre'; n: number }

/**
 * The button « Modifier » of the card of a list, and the panel it opens (tickets 129 to 131): the
 * rows of the list, and a form that adds a row or changes the one she chose. « Enregistrer » sends
 * the whole list. The section is described by a `ListDefinition`; this component knows nothing of
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
export function ListEditor({
	definition,
	lignes: rows,
	envoyer,
	libelleDuBouton,
	titre,
	annonceEnregistre,
}: {
	definition: ListDefinition
	lignes: readonly SavedRow[]
	envoyer: ListUpload
	/** The name of the button that opens the panel. */
	libelleDuBouton: string
	titre: string
	annonceEnregistre: string
}) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label={libelleDuBouton}
				onClick={() => {
					setAnnouncement('')
					setOpen(true)
				}}
				onKeyDown={ignoreRepeat}
				className={`${BUTTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{announcement}
			</p>
			{open ? (
				<ListPanel
					definition={definition}
					lignes={rows}
					envoyer={envoyer}
					titre={titre}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement(annonceEnregistre)
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function ListPanel({
	definition,
	lignes: start,
	envoyer,
	titre,
	retour,
	onEnregistre,
	onFermer,
}: {
	definition: ListDefinition
	lignes: readonly SavedRow[]
	envoyer: ListUpload
	titre: string
	retour: RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const { section, champs: fields, singulier } = definition
	const empty = emptyRow(definition)
	const [rows, setRows] = useState<EditedRow[]>(() =>
		start.map(ligne => ({
			cle: newKey(),
			id: ligne.id,
			valeurs: ligne.valeurs,
			options: (ligne.options ?? []).map(option => ({ cle: newKey(), id: option.id, valeurs: option.valeurs })),
		}))
	)
	const [initiales] = useState(start)
	const optionsDefinition = definition.options
	const [form, setForm] = useState<RowValues>(empty)
	// The options of the row in the form, and the text of the small form that adds one (ticket 132).
	const [formOptions, setFormOptions] = useState<OptionEditee[]>([])
	const [optionInput, setOptionInput] = useState<RowValues>(
		optionsDefinition === undefined ? {} : emptyRow(optionsDefinition)
	)
	const [optionsRefusal, setOptionsRefusal] = useState('')
	const [editing, setEditing] = useState<string | null>(null)
	const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
	const [duplicate, setDuplicate] = useState('')
	const [announcement, setAnnouncement] = useState({ phrase: '', rang: 0 })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [target, setTarget] = useState<FocusTarget | null>(null)
	const root = useRef<HTMLDivElement>(null)
	const lock = useRef(false)
	const pointer = useRef(false)

	// What the form holds, compared with what it started from: the row being edited, or an empty row.
	const editedRow = rows.find(ligne => ligne.cle === editing)
	const fromForm = cleanRow(definition, form)
	const cleanedOptions = formOptions.map(option => ({
		...option,
		valeurs: optionsDefinition ? cleanRow(optionsDefinition, option.valeurs) : option.valeurs,
	}))
	/** True when two lists of options say the same; a section without options has none to compare. */
	const sameOptions = (a: readonly { valeurs: RowValues }[], b: readonly { valeurs: RowValues }[]) =>
		optionsDefinition === undefined || sameRows(optionsDefinition, a, b)
	const pendingOption =
		optionsDefinition !== undefined && !rowIsEmpty(optionsDefinition, cleanRow(optionsDefinition, optionInput))
	const pendingForm =
		pendingOption ||
		(editedRow === undefined
			? !rowIsEmpty(definition, fromForm) || formOptions.length > 0
			: !sameRow(definition, editedRow.valeurs, fromForm) || !sameOptions(cleanedOptions, editedRow.options))
	const changedList =
		rows.length !== initiales.length ||
		rows.some((ligne, rang) => {
			const start = initiales[rang]
			return (
				ligne.id !== start?.id ||
				(start !== undefined &&
					(!sameRow(definition, ligne.valeurs, start.valeurs) ||
						!sameOptions(ligne.options, start.options ?? []) ||
						ligne.options.map(option => option.id).join() !== (start.options ?? []).map(option => option.id).join()))
			)
		})

	// The focus, once the rows have been drawn again.
	useEffect(() => {
		if (target === null) return
		const dialogue = root.current?.closest('[role="dialog"]')
		if (target.genre === 'retirer') {
			root.current?.querySelector<HTMLElement>(`[data-retirer="${target.cle}"]`)?.focus()
		} else if (target.genre === 'formulaire') {
			root.current?.querySelector<HTMLElement>(`#${section}-${fields[0]?.nom}`)?.focus()
		} else {
			const header = dialogue?.querySelector<HTMLElement>('h2')
			header?.setAttribute('tabindex', '-1')
			header?.focus()
		}
	}, [target, section, fields])

	function onField(nom: string, valeur: string) {
		setForm(avant => ({ ...avant, [nom]: valeur }))
		setDuplicate('')
		setMessage('')
		setErrors(avant =>
			avant[nom] === undefined ? avant : Object.fromEntries(Object.entries(avant).filter(([cle]) => cle !== nom))
		)
	}

	function restoreForm() {
		setForm(empty)
		setFormOptions([])
		if (optionsDefinition) setOptionInput(emptyRow(optionsDefinition))
		setOptionsRefusal('')
		setEditing(null)
		setErrors({})
		setDuplicate('')
	}

	function validateRow(evenement: FormEvent<HTMLFormElement>) {
		evenement.preventDefault()
		const values = cleanRow(definition, form)
		const refusal = rowErrors(definition, values, { avecRequis: true, maintenant: new Date() })
		if (Object.keys(refusal).length > 0) {
			setErrors(refusal)
			setDuplicate('')
			const first = fields.find(({ nom: name }) => refusal[name] !== undefined)
			if (first) root.current?.querySelector<HTMLElement>(`#${section}-${first.nom}`)?.focus()
			return
		}
		if (optionsDefinition !== undefined && !optionsAreValid(optionsDefinition)) return
		// Validated as it was loaded, a row changes nothing; any other copy of a listed row is refused (L6).
		const isSameAs = (ligne: EditedRow) =>
			sameRow(definition, ligne.valeurs, values) && sameOptions(ligne.options, cleanedOptions)
		const unchanged = editedRow !== undefined && isSameAs(editedRow)
		if (!unchanged && rows.some(ligne => ligne.cle !== editing && isSameAs(ligne))) {
			setDuplicate(definition.doublon)
			return
		}
		setMessage('')
		setRows(avant =>
			editedRow === undefined
				? [...avant, { cle: newKey(), id: null, valeurs: values, options: cleanedOptions }]
				: avant.map(ligne => (ligne.cle === editing ? { ...ligne, valeurs: values, options: cleanedOptions } : ligne))
		)
		restoreForm()
	}

	/**
	 * The options of the row in the form, before the row is validated (ticket 132): nothing left typed in the
	 * small form that adds one, every option within its bounds, no two alike. Says why, and puts the focus
	 * where it is wrong.
	 */
	function optionsAreValid(options: ListDefinition): boolean {
		if (pendingOption) {
			setOptionsRefusal(LIST_MESSAGES.optionEnCours)
			root.current?.querySelector<HTMLElement>(`#options-${options.champs[0]?.nom}`)?.focus()
			return false
		}
		const errors = optionsErrors(options, formOptions, new Date())
		const faulty = formOptions.find(option => errors[option.cle] !== undefined)
		if (faulty) {
			const field = options.champs.find(({ nom: name }) => errors[faulty.cle]?.[name] !== undefined)
			root.current?.querySelector<HTMLElement>(`#option-${faulty.cle}-${field?.nom}`)?.focus()
			return false
		}
		if (
			cleanedOptions.some((option, rang) =>
				cleanedOptions.slice(0, rang).some(autre => sameRow(options, autre.valeurs, option.valeurs))
			)
		) {
			setOptionsRefusal(options.doublon)
			root.current?.querySelector<HTMLElement>(`#options-${options.champs[0]?.nom}`)?.focus()
			return false
		}
		return true
	}

	function change(ligne: EditedRow) {
		setFormOptions(ligne.options.map(option => ({ ...option })))
		if (optionsDefinition) setOptionInput(emptyRow(optionsDefinition))
		setOptionsRefusal('')
		setForm(ligne.valeurs)
		setEditing(ligne.cle)
		setErrors({})
		setDuplicate('')
		setMessage('')
		setTarget({ genre: 'formulaire', n: (target?.n ?? 0) + 1 })
	}

	function remove(ligne: EditedRow, rang: number) {
		const keyboard = !pointer.current
		pointer.current = false
		const remainingRows = rows.filter(autre => autre.cle !== ligne.cle)
		setRows(remainingRows)
		setMessage('')
		setAnnouncement(({ rang: n }) => ({ phrase: definition.retrait(definition.nom(ligne.valeurs)), rang: n + 1 }))
		if (ligne.cle === editing) {
			// The row being edited is gone: back to « Ajouter ». What was typed over it stays, to be added as a
			// new row; a form left as it was loaded is emptied, or a reflex click would put the row back (L3).
			if (sameRow(definition, ligne.valeurs, fromForm) && sameOptions(ligne.options, cleanedOptions)) restoreForm()
			else {
				setEditing(null)
				setErrors({})
				setDuplicate('')
			}
		}
		const next = rankAfterRemoval(remainingRows.length, rang)
		const n = (target?.n ?? 0) + 1
		const remaining = next === null ? undefined : remainingRows[next]
		if (remaining !== undefined) setTarget({ genre: 'retirer', cle: remaining.cle, n })
		// Emptied, the list sends the focus to the form, unless she clicked or tapped: a field would open the keyboard.
		else setTarget(keyboard ? { genre: 'formulaire', n } : { genre: 'titre', n })
	}

	async function save() {
		if (lock.current) return
		if (pendingForm) {
			setMessage(LIST_MESSAGES.enCours)
			return
		}
		lock.current = true
		setPending(true)
		setMessage('')
		try {
			const result: SaveResult<SavedList> = await envoyer({
				lignes: rows.map(ligne => ({
					...(ligne.id === null ? {} : { id: ligne.id }),
					valeurs: ligne.valeurs,
					// A section with options always sends them, so that removing the last one is saved too.
					...(optionsDefinition === undefined
						? {}
						: {
								options: ligne.options.map(option => ({
									...(option.id === null ? {} : { id: option.id }),
									valeurs: option.valeurs,
								})),
							}),
				})),
			}).catch(() => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave(trackedListSection(section), result)
			if (result.ok) {
				onEnregistre()
				return
			}
			setMessage(result.champs?.lignes ? `${result.message} ${result.champs.lignes}` : result.message)
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const hint = definition.indice?.(fromForm) ?? ''

	return (
		<EditingPanel
			titre={titre}
			enCours={pending}
			modifie={changedList || pendingForm}
			retour={retour}
			onFermer={onFermer}
		>
			<div ref={root} className="flex flex-col gap-4" aria-busy={pending}>
				{/* Said to a screen reader; there, and empty, when the panel opens (L5). Each sentence is a new node. */}
				<div role="status" aria-live="polite" className="sr-only">
					<span key={announcement.rang}>{announcement.phrase}</span>
				</div>
				{rows.length === 0 ? (
					<p className="text-neutral-700 text-sm">{LIST_MESSAGES.aucune(singulier)}</p>
				) : (
					<ul className="flex flex-col gap-2" aria-label={`Tes ${definition.pluriel}`}>
						{rows.map((ligne, rang) => {
							const name = definition.nom(ligne.valeurs)
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
											aria-label={`Modifier ${definition.designation} ${name}`.trim()}
											onKeyDown={ignoreRepeat}
											onClick={() => change(ligne)}
											className={ROW_BUTTON}
										>
											Modifier
										</button>
										<button
											type="button"
											data-retirer={ligne.cle}
											aria-label={`Retirer ${definition.designation} ${name}`.trim()}
											onKeyDown={evenement => {
												pointer.current = false
												ignoreRepeat(evenement)
											}}
											onMouseDown={() => {
												pointer.current = true
											}}
											onPointerDown={() => {
												pointer.current = true
											}}
											onClick={() => remove(ligne, rang)}
											className={ROW_BUTTON}
										>
											Retirer
										</button>
									</span>
								</li>
							)
						})}
					</ul>
				)}
				<form noValidate id={`${section}-ligne`} onSubmit={validateRow} className="flex flex-col gap-4">
					<h3 className="font-semibold text-base">
						{editing === null ? `Ajouter une ${singulier}` : `Modifier cette ${singulier}`}
					</h3>
					<p className="text-neutral-700 text-sm">
						Obligatoire :{' '}
						{fields
							.filter(({ nom: name }) => definition.requis[name])
							.map(({ libelle }) => libelle.toLowerCase())
							.join(', ')}
						.
					</p>
					{fields.map(champ => {
						const id = `${section}-${champ.nom}`
						const error = errors[champ.nom]
						const describes = [champ.aide ? `${id}-aide` : '', error ? `${id}-erreur` : '']
							.concat(champ.nom === 'price' && hint ? [`${id}-indice`] : [])
							.filter(Boolean)
							.join(' ')
						const shared = {
							id: id,
							name: champ.nom,
							value: form[champ.nom] ?? '',
							autoComplete: 'off',
							'aria-required': definition.requis[champ.nom] ? (true as const) : undefined,
							'aria-invalid': error ? (true as const) : undefined,
							'aria-describedby': describes || undefined,
							className: FIELD,
						}
						return (
							<div key={champ.nom} className="flex flex-col gap-1">
								<label htmlFor={id} className="font-medium text-sm">
									{champ.libelle}
								</label>
								{champ.genre === 'long' ? (
									<textarea {...shared} rows={4} onChange={evenement => onField(champ.nom, evenement.target.value)} />
								) : (
									<input
										{...shared}
										type={champ.genre === 'date' ? 'date' : 'text'}
										placeholder={champ.exemple}
										onChange={evenement => onField(champ.nom, evenement.target.value)}
									/>
								)}
								{champ.aide ? (
									<p id={`${id}-aide`} className="text-neutral-700 text-sm">
										{champ.aide}
									</p>
								) : null}
								{champ.nom === 'price' && hint ? (
									<p id={`${id}-indice`} className="text-neutral-700 text-sm">
										{hint}
									</p>
								) : null}
								{error ? (
									<p id={`${id}-erreur`} className="text-red-800 text-sm">
										{error}
									</p>
								) : null}
							</div>
						)
					})}
					{optionsDefinition ? (
						<OptionsEditor
							definition={optionsDefinition}
							options={formOptions}
							onOptions={setFormOptions}
							saisie={optionInput}
							onSaisie={setOptionInput}
							refus={optionsRefusal}
							onRefus={setOptionsRefusal}
							annoncer={phrase => setAnnouncement(({ rang }) => ({ phrase, rang: rang + 1 }))}
						/>
					) : null}
					{duplicate ? (
						<p id={`${section}-doublon`} role="alert" className="rounded-md bg-amber-50 p-3 text-amber-900 text-sm">
							{duplicate}
						</p>
					) : null}
					<div className="flex flex-wrap gap-3">
						<button type="submit" onKeyDown={ignoreRepeat} className={`${BUTTON} border border-neutral-400 bg-white`}>
							{editing === null ? 'Ajouter' : 'Valider la modification'}
						</button>
						{editing === null ? null : (
							<button
								type="button"
								onKeyDown={ignoreRepeat}
								onClick={restoreForm}
								className={`${BUTTON} border border-neutral-400 bg-white`}
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
					disabled={pending}
					onKeyDown={ignoreRepeat}
					onClick={() => void save()}
					className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
				>
					{pending ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</div>
		</EditingPanel>
	)
}
