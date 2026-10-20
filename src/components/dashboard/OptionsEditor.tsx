'use client'

import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
	cleanRow,
	emptyRow,
	LIST_MESSAGES,
	type ListDefinition,
	OPTIONS_MAX,
	type RowField,
	type RowValues,
	rankAfterRemoval,
	rowErrors,
	sameRow,
} from '@/lib/dashboard/list'
import { BUTTON, type EditedRow, FIELD, ignoreRepeat, newKey, ROW_BUTTON } from './list-helpers'

/**
 * The options of the offer being edited (ticket 132): the options she already has, each with its three
 * fields to type in, then a small form that adds one. The rules of the lists edited in place
 * (docs/qualite.md §3) are held as in the list above:
 * - L1, L2 every option has a key made when it is created and never taken from what it says, so typing
 *   in its fields, right after a save too, never moves the focus;
 * - L4 after a removal the focus stays in the panel: on the option that takes its place, or the one
 *   above; an empty list sends it to the form that adds one, unless she clicked (the title then);
 * - L5 each removal is said, through `annoncer` (the zone `role="status"` of the panel);
 * - L6 an option identical to one of the list is refused, with a message;
 * - L7 Enter held down adds one option, or removes one.
 *
 * Controlled by the panel: it holds the options and the text of the small form, so that it knows
 * what would be lost when she validates the offer.
 */

/** The refusals of every option of the list, by key of option then by field (what is required, then the bounds). */
export function optionsErrors(
	definition: ListDefinition,
	options: readonly EditedRow[],
	maintenant: Date
): Readonly<Record<string, Readonly<Record<string, string>>>> {
	return Object.fromEntries(
		options.flatMap(option => {
			const errors = rowErrors(definition, cleanRow(definition, option.valeurs), {
				avecRequis: true,
				maintenant,
			})
			return Object.keys(errors).length > 0 ? [[option.cle, errors] as const] : []
		})
	)
}

type Target = { genre: 'retirer'; cle: string; n: number } | { genre: 'formulaire' | 'titre'; n: number }

function OptionField({
	identifiant,
	champ,
	libelle,
	requis,
	valeur,
	erreur,
	aide,
	onChange,
}: {
	identifiant: string
	champ: RowField
	libelle: string
	requis: boolean
	valeur: string
	erreur?: string
	aide?: string
	onChange: (valeur: string) => void
}) {
	const describes = [aide ? `${identifiant}-aide` : '', erreur ? `${identifiant}-erreur` : ''].filter(Boolean).join(' ')
	const shared = {
		id: identifiant,
		name: champ.nom,
		value: valeur,
		autoComplete: 'off',
		'aria-required': requis ? (true as const) : undefined,
		'aria-invalid': erreur ? (true as const) : undefined,
		'aria-describedby': describes || undefined,
		className: FIELD,
	}
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={identifiant} className="font-medium text-sm">
				{libelle}
			</label>
			{champ.genre === 'long' ? (
				<textarea {...shared} rows={3} onChange={evenement => onChange(evenement.target.value)} />
			) : (
				<input
					{...shared}
					type="text"
					placeholder={champ.exemple}
					onChange={evenement => onChange(evenement.target.value)}
				/>
			)}
			{aide ? (
				<p id={`${identifiant}-aide`} className="text-neutral-700 text-sm">
					{aide}
				</p>
			) : null}
			{erreur ? (
				<p id={`${identifiant}-erreur`} className="text-red-800 text-sm">
					{erreur}
				</p>
			) : null}
		</div>
	)
}

export function OptionsEditor({
	definition,
	options,
	onOptions,
	saisie,
	onSaisie,
	refus,
	onRefus,
	annoncer,
}: {
	definition: ListDefinition
	options: readonly EditedRow[]
	onOptions: (options: EditedRow[]) => void
	/** The text of the small form that adds an option. */
	saisie: RowValues
	onSaisie: (saisie: RowValues) => void
	/** The sentence under the small form when an option is refused as a copy (also set by the panel). */
	refus: string
	onRefus: (message: string) => void
	annoncer: (phrase: string) => void
}) {
	const root = useRef<HTMLFieldSetElement>(null)
	const pointer = useRef(false)
	const [additionErrors, setAdditionErrors] = useState<Readonly<Record<string, string>>>({})
	const [target, setTarget] = useState<Target | null>(null)
	const errors = optionsErrors(definition, options, new Date())
	const hint = definition.indice?.(cleanRow(definition, saisie)) ?? ''
	const { champs: fields } = definition

	// The focus, once the options have been drawn again.
	useEffect(() => {
		if (target === null) return
		if (target.genre === 'retirer') {
			root.current?.querySelector<HTMLElement>(`[data-retirer-option="${target.cle}"]`)?.focus()
		} else if (target.genre === 'formulaire') {
			root.current?.querySelector<HTMLElement>(`#options-${fields[0]?.nom}`)?.focus()
		} else {
			root.current?.querySelector<HTMLElement>('[data-titre-options]')?.focus()
		}
	}, [target, fields])

	function change(cle: string, nom: string, valeur: string) {
		onRefus('')
		onOptions(
			options.map(option =>
				option.cle === cle ? { ...option, valeurs: { ...option.valeurs, [nom]: valeur } } : option
			)
		)
	}

	function enter(nom: string, valeur: string) {
		onRefus('')
		onSaisie({ ...saisie, [nom]: valeur })
		setAdditionErrors(avant => Object.fromEntries(Object.entries(avant).filter(([cle]) => cle !== nom)))
	}

	function add() {
		const values = cleanRow(definition, saisie)
		const refused = rowErrors(definition, values, { avecRequis: true, maintenant: new Date() })
		if (Object.keys(refused).length > 0) {
			setAdditionErrors(refused)
			onRefus('')
			const first = fields.find(({ nom: name }) => refused[name] !== undefined)
			if (first) root.current?.querySelector<HTMLElement>(`#options-${first.nom}`)?.focus()
			return
		}
		if (options.some(option => sameRow(definition, option.valeurs, values))) {
			onRefus(definition.doublon)
			return
		}
		if (options.length >= OPTIONS_MAX) {
			onRefus(LIST_MESSAGES.tropDOptions)
			return
		}
		onRefus('')
		onOptions([...options, { cle: newKey(), id: null, valeurs: values }])
		onSaisie(emptyRow(definition))
		setAdditionErrors({})
	}

	function remove(option: EditedRow, rang: number) {
		const keyboard = !pointer.current
		pointer.current = false
		const remainingRows = options.filter(autre => autre.cle !== option.cle)
		onOptions(remainingRows)
		onRefus('')
		annoncer(definition.retrait(definition.nom(option.valeurs)))
		const next = rankAfterRemoval(remainingRows.length, rang)
		const remaining = next === null ? undefined : remainingRows[next]
		const n = (target?.n ?? 0) + 1
		if (remaining !== undefined) setTarget({ genre: 'retirer', cle: remaining.cle, n })
		else setTarget({ genre: keyboard ? 'formulaire' : 'titre', n })
	}

	// Enter in a one-line field never validates the offer: in the small form it adds the option (once, if held down).
	function onEntry(evenement: KeyboardEvent<HTMLFieldSetElement>) {
		const eventTarget = evenement.target as HTMLElement
		if (evenement.key !== 'Enter' || eventTarget.tagName !== 'INPUT') return
		evenement.preventDefault()
		if (!evenement.repeat && eventTarget.closest('[data-ajout-option]')) add()
	}

	return (
		<fieldset ref={root} onKeyDown={onEntry} className="flex flex-col gap-3 rounded-md border border-neutral-300 p-3">
			<legend className="px-1 font-semibold text-base">
				<span data-titre-options tabIndex={-1}>
					Options de cette prestation
				</span>
			</legend>
			{options.length === 0 ? (
				<p className="text-neutral-700 text-sm">{LIST_MESSAGES.aucune(definition.singulier)}</p>
			) : (
				<ul className="flex flex-col gap-3" aria-label={`Tes ${definition.pluriel}`}>
					{options.map((option, rang) => {
						const name = definition.nom(option.valeurs)
						return (
							<li key={option.cle} data-option className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
								{fields.map(champ => (
									<OptionField
										key={champ.nom}
										identifiant={`option-${option.cle}-${champ.nom}`}
										champ={champ}
										libelle={`${champ.libelle}, option ${rang + 1}`}
										requis={definition.requis[champ.nom] !== undefined}
										valeur={option.valeurs[champ.nom] ?? ''}
										erreur={errors[option.cle]?.[champ.nom]}
										onChange={valeur => change(option.cle, champ.nom, valeur)}
									/>
								))}
								<div>
									<button
										type="button"
										data-retirer-option={option.cle}
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
										onClick={() => remove(option, rang)}
										className={ROW_BUTTON}
									>
										Retirer
									</button>
								</div>
							</li>
						)
					})}
				</ul>
			)}
			<fieldset data-ajout-option className="flex flex-col gap-3 border-0 p-0">
				<legend className="font-semibold text-sm">Ajouter une option</legend>
				{fields.map(champ => (
					<div key={champ.nom} className="flex flex-col gap-1">
						<OptionField
							identifiant={`options-${champ.nom}`}
							champ={champ}
							libelle={champ.libelle}
							requis={definition.requis[champ.nom] !== undefined}
							valeur={saisie[champ.nom] ?? ''}
							erreur={additionErrors[champ.nom]}
							aide={champ.nom === 'price' ? champ.aide : undefined}
							onChange={valeur => enter(champ.nom, valeur)}
						/>
						{champ.nom === 'price' && hint ? <p className="text-neutral-700 text-sm">{hint}</p> : null}
					</div>
				))}
				{refus ? (
					<p id="options-doublon" role="alert" className="rounded-md bg-amber-50 p-3 text-amber-900 text-sm">
						{refus}
					</p>
				) : null}
				<div>
					<button
						type="button"
						onKeyDown={ignoreRepeat}
						onClick={add}
						className={`${BUTTON} border border-neutral-400 bg-white`}
					>
						Ajouter l’option
					</button>
				</div>
			</fieldset>
		</fieldset>
	)
}
