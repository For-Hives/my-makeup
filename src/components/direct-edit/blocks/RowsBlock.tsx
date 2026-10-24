'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ignoreRepeat, newKey } from '@/components/dashboard/list-helpers'
import { trackedListSection, trackSave } from '@/lib/dashboard/analytics'
import { COURSES } from '@/lib/dashboard/courses'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import {
	cleanRow,
	emptyRow,
	LIST_MESSAGES,
	type ListDefinition,
	type RowErrors,
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
import { inputPrice, SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { parsePrice, priceRows } from '@/lib/price'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type RowsSave = (list: SentList) => Promise<SaveResult<SavedList>>

/** What a block of rows says and offers beyond its definition (courses, offers). */
export interface RowsWords {
	id: string
	/** The block in a few words, for the heading of the editor: « Prestations et tarifs ». */
	title: string
	/** « Modifier mes prestations ». */
	pen: string
	invitation: ReactNode
	/** « Ajouter une prestation ». */
	add: string
	/** The button that saves while a row is being written: « Enregistrer cette prestation ». */
	saveRow: string
	/** One line of the list: « Maquillage de la mariée · dès 150 € ». */
	line: (values: RowValues) => string
	/** Fields folded under a link until she needs them: the description. */
	folded: readonly string[]
	/** « Ajouter une option (ex. essai, retouches) », for a section that has options. */
	addOption?: string
	/** Names proposed in the field of the name (a `datalist`). */
	suggestions?: readonly string[]
	/** Models that prefill the name in one press. */
	templates?: readonly { label: string; name: string }[]
	/** What is said under the field of the price, instead of the definition's own help. */
	priceHelp?: string
	/** The field the focus goes to when a model is chosen. */
	afterTemplate?: string
}

interface EditedRow {
	readonly cle: string
	readonly id: string | null
	readonly valeurs: RowValues
	readonly options: readonly EditedRow[]
}

interface Draft {
	/** The key of the row being changed; `null` for a new row. */
	editing: string | null
	values: RowValues
	options: EditedRow[]
}

type Errors = {
	row: RowErrors
	options: Readonly<Record<string, RowErrors>>
	duplicate: string
}
const NO_ERRORS: Errors = { row: {}, options: {}, duplicate: '' }

const toRows = (rows: readonly SavedRow[]): EditedRow[] =>
	rows.map(row => ({
		cle: newKey(),
		id: row.id,
		valeurs: row.valeurs,
		options: toRows(row.options ?? []),
	}))

/**
 * A list of rows edited in place (issues 1016 and 1017): her courses, her offers with their options. The
 * fields, the bounds, the price reading and the server are those of her space (`ListDefinition`). One
 * button saves: while a row is being written, « Enregistrer cette prestation » adds it to the list
 * **and** saves the list, so that nothing she typed is lost or refused.
 *
 * The seven rules of the lists edited in place hold here: L1 a key per row, made when it is created;
 * L2 typing never changes a key, so the focus stays in the field; L3 removing the row being changed
 * keeps what she typed as a new row; L4 the focus stays in the editor after a removal; L5 each removal
 * is announced; L6 a row identical to another is refused and said, one validated unchanged is not;
 * L7 a button acts once when Enter is held. The block has no inner `<form>`: it lives in the form of
 * the block, so Enter in a field is « save ».
 */
/**
 * The lists, by name: the definitions and the words hold functions, which a server page cannot hand to
 * the browser. The page names the list; this file, loaded in the browser, knows it.
 */
const COURSES_WORDS: RowsWords = {
	id: 'courses',
	title: 'Formations et diplômes',
	pen: 'Modifier mes formations',
	invitation: (
		<span className="pr-8">
			<b className="text-lipstick">Ajoute tes formations et tes diplômes.</b> Par exemple : CAP esthétique, école de
			maquillage.
		</span>
	),
	add: 'Ajouter une formation',
	saveRow: 'Enregistrer cette formation',
	line: values => COURSES.resume(values),
	folded: ['description'],
}

const EXPERIENCES_WORDS: RowsWords = {
	id: 'experiences',
	title: 'Expériences professionnelles',
	pen: 'Modifier mes expériences',
	invitation: (
		<span className="pr-8">
			<b className="text-lipstick">Ajoute tes expériences.</b> Par exemple : maquilleuse mariage, Studio Fictif, depuis
			2019.
		</span>
	),
	add: 'Ajouter une expérience',
	saveRow: 'Enregistrer cette expérience',
	line: values => EXPERIENCES.resume(values),
	folded: ['description'],
}

/** « Maquillage de la mariée · dès 150 € »: the name, then the first line of the price as the page shows it. */
function serviceLine(values: RowValues): string {
	const price = priceRows(parsePrice(inputPrice(values.price ?? '')))
		.join(', ')
		.replace(/^À partir de /, 'dès ')
	return [values.name, price].filter(Boolean).join(' · ')
}

const SERVICES_WORDS: RowsWords = {
	id: 'services',
	title: 'Prestations et tarifs',
	pen: 'Modifier mes prestations',
	invitation: (
		<span className="pr-8">
			<b className="text-lipstick">Ajoute tes prestations et tes tarifs.</b> Par exemple : maquillage de la mariée, dès
			150 €.
		</span>
	),
	add: 'Ajouter une prestation',
	saveRow: 'Enregistrer cette prestation',
	line: serviceLine,
	folded: ['description'],
	addOption: 'Ajouter une option (ex. essai, retouches)',
	suggestions: [
		'Maquillage de la mariée',
		'Maquillage de soirée',
		'Maquillage de jour',
		'Maquillage invitée',
		'Essai maquillage',
		'Cours d’auto-maquillage',
	],
	templates: [
		{ label: 'Mariée', name: 'Maquillage de la mariée' },
		{ label: 'Soirée', name: 'Maquillage de soirée' },
		{ label: 'Essai', name: 'Essai maquillage' },
	],
	priceHelp: 'Exemples : 150, à partir de 150, sur devis',
	afterTemplate: 'price',
}

const KINDS = {
	courses: { words: COURSES_WORDS, definition: COURSES },
	experiences: { words: EXPERIENCES_WORDS, definition: EXPERIENCES },
	services: { words: SERVICES_WORDS, definition: SERVICE_OFFERS },
} satisfies Record<string, { words: RowsWords; definition: ListDefinition }>

export type RowsKind = keyof typeof KINDS

export function RowsBlock({
	kind,
	rows,
	save,
	children,
}: {
	kind: RowsKind
	rows: readonly SavedRow[]
	save: RowsSave
	/** The block as the visitor sees it, or `null` while there is nothing to show. */
	children: ReactNode | null
}) {
	const { words, definition } = KINDS[kind]
	return (
		<EditableBlock
			id={words.id}
			title={words.title}
			penLabel={words.pen}
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={words.invitation}
			editor={<RowsForm words={words} definition={definition} start={rows} save={save} />}
		>
			{children}
		</EditableBlock>
	)
}

function RowsForm({
	words,
	definition,
	start,
	save,
}: {
	words: RowsWords
	definition: ListDefinition
	start: readonly SavedRow[]
	save: RowsSave
}) {
	const { section, champs: fields } = definition
	const optionsDefinition = definition.options
	const [initial] = useState(start)
	const [rows, setRows] = useState<EditedRow[]>(() => toRows(start))
	const [draft, setDraft] = useState<Draft | null>(null)
	const [errors, setErrors] = useState<Errors>(NO_ERRORS)
	const [announcement, setAnnouncement] = useState({ phrase: '', rank: 0 })
	const root = useRef<HTMLDivElement>(null)
	const title = useRef<HTMLHeadingElement>(null)
	const pointer = useRef(false)
	// Where the focus goes once the rows are drawn again (L4), or once the draft opens.
	const [target, setTarget] = useState<{ what: 'remove' | 'draft' | 'add' | 'title'; cle?: string; n: number } | null>(
		null
	)
	const edited = draft?.editing === null || draft === null ? undefined : rows.find(row => row.cle === draft.editing)
	const draftValues = draft ? cleanRow(definition, draft.values) : emptyRow(definition)
	const cleanOptions = (options: readonly EditedRow[]) =>
		options.map(option => ({
			...option,
			valeurs: optionsDefinition ? cleanRow(optionsDefinition, option.valeurs) : option.valeurs,
		}))
	// An option left empty says nothing: it is dropped, not refused.
	const filledOptions = (options: readonly EditedRow[]) =>
		cleanOptions(options).filter(option => !optionsDefinition || !rowIsEmpty(optionsDefinition, option.valeurs))
	const sameOptions = (a: readonly { valeurs: RowValues }[], b: readonly { valeurs: RowValues }[]) =>
		optionsDefinition === undefined || sameRows(optionsDefinition, a, b)
	const draftChanged =
		draft !== null &&
		(edited === undefined
			? !rowIsEmpty(definition, draftValues) || filledOptions(draft.options).length > 0
			: !sameRow(definition, edited.valeurs, draftValues) || !sameOptions(filledOptions(draft.options), edited.options))
	const listChanged =
		rows.length !== initial.length ||
		rows.some((row, rank) => {
			const first = initial[rank]
			return (
				row.id !== first?.id ||
				(first !== undefined &&
					(!sameRow(definition, row.valeurs, first.valeurs) ||
						!sameOptions(row.options, first.options ?? []) ||
						row.options.map(option => option.id).join() !== (first.options ?? []).map(option => option.id).join()))
			)
		})

	useEffect(() => {
		if (target === null) return
		const scope = root.current
		if (target.what === 'remove') scope?.querySelector<HTMLElement>(`[data-remove="${target.cle}"]`)?.focus()
		else if (target.what === 'draft')
			scope?.querySelector<HTMLElement>(`#${target.cle ?? `${section}-draft-${fields[0]?.nom}`}`)?.focus()
		else if (target.what === 'add') scope?.querySelector<HTMLElement>('[data-add-row]')?.focus()
		else title.current?.focus()
	}, [target, section, fields])

	const focusIn = (what: 'remove' | 'draft' | 'add' | 'title', cle?: string) =>
		setTarget(previous => ({ what, ...(cle === undefined ? {} : { cle }), n: (previous?.n ?? 0) + 1 }))

	function openDraft(row?: EditedRow) {
		setDraft(
			row === undefined
				? { editing: null, values: emptyRow(definition), options: [] }
				: { editing: row.cle, values: row.valeurs, options: row.options.map(option => ({ ...option })) }
		)
		setErrors(NO_ERRORS)
		focusIn('draft')
	}

	function closeDraft() {
		setDraft(null)
		setErrors(NO_ERRORS)
		focusIn('add')
	}

	function setField(name: string, value: string) {
		setDraft(current => (current ? { ...current, values: { ...current.values, [name]: value } } : current))
		setErrors(current =>
			current.row[name] === undefined && current.duplicate === ''
				? current
				: { ...current, row: withoutKey(current.row, name), duplicate: '' }
		)
	}

	function setOptionField(cle: string, name: string, value: string) {
		setDraft(current =>
			current
				? {
						...current,
						options: current.options.map(option =>
							option.cle === cle ? { ...option, valeurs: { ...option.valeurs, [name]: value } } : option
						),
					}
				: current
		)
		setErrors(current => {
			const mine = current.options[cle]
			return mine?.[name] === undefined
				? current
				: { ...current, options: { ...current.options, [cle]: withoutKey(mine, name) } }
		})
	}

	/**
	 * The list with the row being written in it, or `null` when the row is refused (and why, under its
	 * field). A draft left empty says nothing and changes nothing.
	 */
	function withDraft(): EditedRow[] | null {
		if (draft === null || !draftChanged) return rows
		const found: Errors = { row: {}, options: {}, duplicate: '' }
		const rowRefusal = rowErrors(definition, draftValues, { avecRequis: true, maintenant: new Date() })
		const options = filledOptions(draft.options)
		const optionRefusals: Record<string, RowErrors> = {}
		if (optionsDefinition)
			for (const option of options) {
				const refusal = rowErrors(optionsDefinition, option.valeurs, { avecRequis: true, maintenant: new Date() })
				if (Object.keys(refusal).length > 0) optionRefusals[option.cle] = refusal
			}
		let duplicate = ''
		const isSame = (row: { valeurs: RowValues; options: readonly { valeurs: RowValues }[] }) =>
			sameRow(definition, row.valeurs, draftValues) && sameOptions(row.options, options)
		if (Object.keys(rowRefusal).length === 0 && Object.keys(optionRefusals).length === 0) {
			const unchanged = edited !== undefined && isSame(edited)
			if (!unchanged && rows.some(row => row.cle !== draft.editing && isSame(row))) duplicate = definition.doublon
			if (
				optionsDefinition &&
				options.some((option, rank) =>
					options.slice(0, rank).some(other => sameRow(optionsDefinition, other.valeurs, option.valeurs))
				)
			)
				duplicate = optionsDefinition.doublon
		}
		if (Object.keys(rowRefusal).length > 0 || Object.keys(optionRefusals).length > 0 || duplicate !== '') {
			setErrors({ ...found, row: rowRefusal, options: optionRefusals, duplicate })
			const first = fields.find(({ nom }) => rowRefusal[nom] !== undefined)
			if (first) focusIn('draft', `${section}-draft-${first.nom}`)
			else {
				const faulty = options.find(option => optionRefusals[option.cle] !== undefined)
				const name = optionsDefinition?.champs.find(({ nom }) => optionRefusals[faulty?.cle ?? '']?.[nom] !== undefined)
				if (faulty && name) focusIn('draft', `${section}-option-${faulty.cle}-${name.nom}`)
			}
			return null
		}
		const merged: EditedRow = {
			cle: edited?.cle ?? newKey(),
			id: edited?.id ?? null,
			valeurs: draftValues,
			options,
		}
		return edited === undefined ? [...rows, merged] : rows.map(row => (row.cle === edited.cle ? merged : row))
	}

	function remove(row: EditedRow, rank: number) {
		const keyboard = !pointer.current
		pointer.current = false
		const remaining = rows.filter(other => other.cle !== row.cle)
		setRows(remaining)
		setAnnouncement(({ rank: last }) => ({
			phrase: definition.retrait(definition.nom(row.valeurs)),
			rank: last + 1,
		}))
		// L3: the row being changed is gone; what she typed stays, to be added as a new row.
		if (draft?.editing === row.cle) setDraft({ ...draft, editing: null })
		const next = rankAfterRemoval(remaining.length, rank)
		const following = next === null ? undefined : remaining[next]
		if (following !== undefined) focusIn('remove', following.cle)
		// Emptied: the button to add after a key; the title after a click or a tap, so that no keyboard opens.
		else focusIn(keyboard ? 'add' : 'title')
	}

	function addOption() {
		setDraft(current =>
			current
				? {
						...current,
						options: [
							...current.options,
							{ cle: newKey(), id: null, valeurs: emptyRow(optionsDefinition ?? definition), options: [] },
						],
					}
				: current
		)
	}

	function removeOption(option: EditedRow) {
		// L4: after a key, the focus goes to the first field of the row; after a click or a tap, to the title, so that no keyboard opens.
		const keyboard = !pointer.current
		pointer.current = false
		setDraft(current =>
			current ? { ...current, options: current.options.filter(other => other.cle !== option.cle) } : current
		)
		setAnnouncement(({ rank }) => ({
			phrase: optionsDefinition?.retrait(optionsDefinition.nom(option.valeurs)) ?? '',
			rank: rank + 1,
		}))
		focusIn(keyboard ? 'draft' : 'title')
	}

	const hint = definition.indice?.(draftValues) ?? ''
	const optionName = (option: EditedRow) => optionsDefinition?.nom(option.valeurs) ?? ''

	return (
		<BlockForm
			title={words.pen}
			dirty={listChanged || draftChanged}
			keepsHint="ta liste est toujours là"
			submitLabel={draft !== null ? words.saveRow : 'Enregistrer'}
			onSend={async () => {
				const list = withDraft()
				if (list === null) return null
				const result = await save({
					lignes: list.map(row => ({
						...(row.id === null ? {} : { id: row.id }),
						valeurs: row.valeurs,
						// A section with options always sends them, so that removing the last one is saved too.
						...(optionsDefinition === undefined
							? {}
							: {
									options: row.options.map(option => ({
										...(option.id === null ? {} : { id: option.id }),
										valeurs: option.valeurs,
									})),
								}),
					})),
				}).catch((): SaveResult<SavedList> => ({ ok: false, message: FAILURE_MESSAGE }))
				trackSave(trackedListSection(section), result)
				// The row is in the list now, whatever the server said: a second try does not add it twice.
				if (!result.ok) {
					setRows(list)
					setDraft(null)
				}
				return result.ok || !result.champs?.lignes
					? result
					: { ...result, message: `${result.message} ${result.champs.lignes}` }
			}}
		>
			<div ref={root} className="flex flex-col gap-4">
				<h3 ref={title} tabIndex={-1} className="font-display font-medium text-xl outline-none">
					Tes {definition.pluriel}
				</h3>
				{/* Said to a screen reader; there, and empty, when the editor opens (L5). Each sentence is a new node. */}
				<div role="status" aria-live="polite" className="sr-only" data-testid="removal-announcement">
					<span key={announcement.rank}>{announcement.phrase}</span>
				</div>
				{rows.length === 0 ? (
					<p className="text-mute text-sm">{LIST_MESSAGES.aucune(definition.singulier)}</p>
				) : (
					<ul className="flex flex-col gap-2" aria-label={`Tes ${definition.pluriel}`}>
						{rows.map((row, rank) => {
							const name = definition.nom(row.valeurs)
							return (
								<li
									key={row.cle}
									data-row
									className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline bg-blush p-3"
								>
									<span className="min-w-0 break-words text-sm">
										{words.line(row.valeurs) || '(sans nom)'}
										{row.options.length > 0
											? ` · ${row.options.length} option${row.options.length > 1 ? 's' : ''}`
											: ''}
									</span>
									<span className="flex gap-2">
										<button
											type="button"
											aria-label={`Modifier ${definition.designation} ${name}`.trim()}
											onKeyDown={ignoreRepeat}
											onClick={() => openDraft(row)}
											className="min-h-11 rounded-full border border-ink bg-white px-4 font-semibold text-sm"
										>
											Modifier
										</button>
										<button
											type="button"
											data-remove={row.cle}
											aria-label={`Retirer ${definition.designation} ${name}`.trim()}
											onKeyDown={event => {
												pointer.current = false
												ignoreRepeat(event)
											}}
											onMouseDown={() => {
												pointer.current = true
											}}
											onPointerDown={() => {
												pointer.current = true
											}}
											onClick={() => remove(row, rank)}
											className="min-h-11 rounded-full border border-hairline bg-white px-4 font-semibold text-sm"
										>
											Retirer
										</button>
									</span>
								</li>
							)
						})}
					</ul>
				)}
				{draft === null ? (
					<button
						type="button"
						data-add-row
						onKeyDown={ignoreRepeat}
						onClick={() => openDraft()}
						className="min-h-11 w-fit rounded-full border border-lipstick bg-white px-5 font-semibold text-lipstick text-sm"
					>
						{words.add}
					</button>
				) : (
					<fieldset className="m-0 flex min-w-0 flex-col gap-4 rounded-2xl border border-hairline bg-blush p-4">
						<legend className="px-1 font-semibold text-sm">
							{draft.editing === null
								? words.add
								: `Modifier ${definition.designation} ${definition.nom(edited?.valeurs ?? {})}`.trim()}
						</legend>
						{words.templates && draft.editing === null && draftValues[fields[0]?.nom ?? ''] === '' ? (
							<div className="flex flex-col gap-2">
								<p className="text-mute text-sm">Pour démarrer, touche un modèle :</p>
								<div className="flex flex-wrap gap-2">
									{words.templates.map(({ label, name }) => (
										<button
											key={label}
											type="button"
											aria-label={`Modèle ${label}`}
											onKeyDown={ignoreRepeat}
											onClick={() => {
												setField(fields[0]?.nom ?? 'name', name)
												focusIn('draft', `${section}-draft-${words.afterTemplate ?? fields[0]?.nom}`)
											}}
											className="min-h-11 rounded-full border border-hairline bg-white px-4 text-sm"
										>
											{label}
										</button>
									))}
								</div>
							</div>
						) : null}
						{fields.map(field => {
							const id = `${section}-draft-${field.nom}`
							const error = errors.row[field.nom]
							if (words.folded.includes(field.nom))
								return (
									<details key={field.nom} open={(draft.values[field.nom] ?? '') !== ''} className="group">
										<summary className="flex min-h-11 w-fit cursor-pointer items-center font-medium text-lipstick text-sm underline">
											{(draft.values[field.nom] ?? '') !== ''
												? field.libelle
												: `Ajouter une ${field.libelle.toLowerCase()}`}
										</summary>
										<div className="flex flex-col gap-1 pt-2">
											<label htmlFor={id} className="font-medium text-sm">
												{field.libelle}
											</label>
											<textarea
												id={id}
												rows={3}
												autoComplete="off"
												value={draft.values[field.nom] ?? ''}
												aria-invalid={error ? true : undefined}
												aria-describedby={error ? `${id}-error` : undefined}
												className={`${FIELD_CLASS} py-2`}
												onChange={event => setField(field.nom, event.target.value)}
											/>
											{error ? (
												<p id={`${id}-error`} className="text-lipstick-800 text-sm">
													{error}
												</p>
											) : null}
										</div>
									</details>
								)
							return (
								<RowField
									key={field.nom}
									id={id}
									field={field}
									required={definition.requis[field.nom] !== undefined}
									value={draft.values[field.nom] ?? ''}
									error={error}
									help={field.nom === 'price' ? words.priceHelp : field.aide}
									hint={field.nom === 'price' ? hint : ''}
									listId={field === fields[0] && words.suggestions ? `${section}-suggestions` : undefined}
									onChange={value => setField(field.nom, value)}
								/>
							)
						})}
						{words.suggestions ? (
							<datalist id={`${section}-suggestions`}>
								{words.suggestions.map(suggestion => (
									<option key={suggestion} value={suggestion} />
								))}
							</datalist>
						) : null}
						{optionsDefinition ? (
							<div className="flex flex-col gap-3">
								{draft.options.map((option, rank) => (
									<fieldset
										key={option.cle}
										className="m-0 flex min-w-0 flex-col gap-3 rounded-2xl border border-hairline bg-white p-3"
									>
										<legend className="px-1 font-semibold text-sm">Option {rank + 1}</legend>
										{optionsDefinition.champs.map(field => {
											const id = `${section}-option-${option.cle}-${field.nom}`
											const error = errors.options[option.cle]?.[field.nom]
											return field.genre === 'long' ? (
												<details key={field.nom} open={(option.valeurs[field.nom] ?? '') !== ''}>
													<summary className="flex min-h-11 w-fit cursor-pointer items-center font-medium text-lipstick text-sm underline">
														Ajouter une description à l’option
													</summary>
													<div className="flex flex-col gap-1 pt-2">
														<label htmlFor={id} className="font-medium text-sm">
															{field.libelle} de l’option {rank + 1}
														</label>
														<textarea
															id={id}
															rows={2}
															autoComplete="off"
															value={option.valeurs[field.nom] ?? ''}
															className={`${FIELD_CLASS} py-2`}
															onChange={event => setOptionField(option.cle, field.nom, event.target.value)}
														/>
													</div>
												</details>
											) : (
												<RowField
													key={field.nom}
													id={id}
													field={{
														...field,
														libelle: `${field.libelle.replace(/ de l’option$/, '')}${field.nom === 'name' ? '' : ' de l’option'}`,
													}}
													required={optionsDefinition.requis[field.nom] !== undefined}
													value={option.valeurs[field.nom] ?? ''}
													error={error}
													help={field.nom === 'price' ? words.priceHelp : undefined}
													hint=""
													onChange={value => setOptionField(option.cle, field.nom, value)}
												/>
											)
										})}
										<button
											type="button"
											onKeyDown={event => {
												pointer.current = false
												ignoreRepeat(event)
											}}
											onMouseDown={() => {
												pointer.current = true
											}}
											onPointerDown={() => {
												pointer.current = true
											}}
											onClick={() => removeOption(option)}
											aria-label={`Retirer l’option ${optionName(option) || rank + 1}`}
											className="min-h-11 w-fit rounded-full border border-hairline bg-white px-4 font-semibold text-sm"
										>
											Retirer cette option
										</button>
									</fieldset>
								))}
								<button
									type="button"
									onKeyDown={ignoreRepeat}
									onClick={() => {
										addOption()
									}}
									className="min-h-11 w-fit rounded-full border border-ink bg-white px-5 font-semibold text-ink text-sm"
								>
									{words.addOption}
								</button>
							</div>
						) : null}
						{errors.duplicate ? (
							<p role="alert" className="rounded-2xl bg-lipstick-50 p-3 text-lipstick-800 text-sm">
								{errors.duplicate}
							</p>
						) : null}
						<button
							type="button"
							onKeyDown={ignoreRepeat}
							onClick={closeDraft}
							className="min-h-11 w-fit rounded-full border border-hairline bg-white px-5 font-semibold text-sm"
						>
							{draft.editing === null ? 'Ne pas ajouter' : 'Annuler la modification'}
						</button>
					</fieldset>
				)}
			</div>
		</BlockForm>
	)
}

const withoutKey = (record: RowErrors, key: string): RowErrors =>
	Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))

function RowField({
	id,
	field,
	required,
	value,
	error,
	help,
	hint,
	listId,
	onChange,
}: {
	id: string
	field: { nom: string; libelle: string; genre: string; exemple?: string | undefined; aide?: string | undefined }
	required: boolean
	value: string
	error: string | undefined
	help: string | undefined
	hint: string
	listId?: string | undefined
	onChange: (value: string) => void
}) {
	const describes = [help ? `${id}-help` : '', hint ? `${id}-hint` : '', error ? `${id}-error` : '']
		.filter(Boolean)
		.join(' ')
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="font-medium text-sm">
				{field.libelle}
			</label>
			<input
				id={id}
				type={field.genre === 'date' ? 'date' : 'text'}
				autoComplete="off"
				list={listId}
				placeholder={field.exemple}
				value={value}
				aria-required={required ? true : undefined}
				aria-invalid={error ? true : undefined}
				aria-describedby={describes || undefined}
				className={FIELD_CLASS}
				onChange={event => onChange(event.target.value)}
			/>
			{help ? (
				<p id={`${id}-help`} className="text-mute text-sm">
					{help}
				</p>
			) : null}
			{hint ? (
				<p id={`${id}-hint`} className="text-mute text-sm">
					{hint}
				</p>
			) : null}
			{error ? (
				<p id={`${id}-error`} className="text-lipstick-800 text-sm">
					{error}
				</p>
			) : null}
		</div>
	)
}
