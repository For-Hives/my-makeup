'use client'

import { type FormEvent, useLayoutEffect, useRef, useState } from 'react'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	type Bullet,
	type BulletsField,
	type BulletsKind,
	type BulletsValues,
	LANGUAGES,
	readNames,
	SKILLS,
} from '@/lib/dashboard/bullets'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { EditingPanel } from './EditingPanel'

export type BulletsUpload = (saisie: { puces: { id?: string; nom: string }[] }) => Promise<SaveResult<BulletsValues>>

const KINDS: Record<BulletsField, BulletsKind> = { languages: LANGUAGES, skills: SKILLS }

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'
/** The prefix of the identifier of a chip added in the panel: never sent, never stored. */
const LOCAL = 'nouveau-'

const sameBullets = (a: readonly Bullet[], b: readonly Bullet[]): boolean =>
	a.length === b.length && a.every((puce, rang) => puce.id === b[rang]?.id && puce.nom === b[rang]?.nom)

/**
 * The button « Modifier » of a card of chips (languages: ticket 127, skills: ticket 128) and the
 * panel it opens. Same contract as the identity (src/components/espace/EditeurDIdentite.tsx): the
 * card shows only what the database stored; a failure keeps the old list and what she did, and
 * says so (E31); one request for two clicks; the result is announced outside of the panel.
 *
 * The seven rules of the lists edited in place (docs/qualite.md §3) are kept in `FormulaireDePuces`.
 */
export function BulletsEditor({
	liste: list,
	puces: bullets,
	envoyer,
}: {
	/** The list, by name: the kinds hold functions, which a server page cannot hand to the browser. */
	liste: BulletsField
	puces: readonly Bullet[]
	envoyer: BulletsUpload
}) {
	const kind = KINDS[list]
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	// What the database stored last: the panel opens on it, whether or not the page was refreshed yet.
	const [storedRows, setStored] = useState(bullets)
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label={kind.bouton}
				onClick={() => {
					setAnnouncement('')
					setOpen(true)
				}}
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className={`${BUTTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{announcement}
			</p>
			{open ? (
				<BulletsForm
					sorte={kind}
					initiales={storedRows}
					envoyer={envoyer}
					retour={trigger}
					onEnregistre={enregistrees => {
						setStored(enregistrees)
						setAnnouncement(kind.enregistre)
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function BulletsForm({
	sorte: kind,
	initiales,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	sorte: BulletsKind
	initiales: readonly Bullet[]
	envoyer: BulletsUpload
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: (puces: readonly Bullet[]) => void
	onFermer: () => void
}) {
	const [bullets, setBullets] = useState<readonly Bullet[]>(initiales)
	const [input, setInput] = useState('')
	// The refusal of the name she is typing, said near the field (L6).
	const [refusal, setRefusal] = useState('')
	// What the screen readers hear when a chip leaves (L5). `rang` changes at every removal, so two
	// removals of the same name are two sentences.
	const [announcement, setAnnouncement] = useState({ phrase: '', rang: 0 })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)
	const counter = useRef(0)
	const zone = useRef<HTMLDivElement>(null)
	const field = useRef<HTMLInputElement>(null)
	// Set by a removal, read once the chip is gone: where the focus goes (L4).
	const afterRemoval = useRef<{ rang: number; clavier: boolean } | null>(null)

	useLayoutEffect(() => {
		const removal = afterRemoval.current
		if (removal === null) return
		afterRemoval.current = null
		const buttons = [...(zone.current?.querySelectorAll<HTMLElement>('[data-retirer]') ?? [])]
		// The chip that takes the place of the one removed, else the one above it.
		const target = buttons[removal.rang] ?? buttons[removal.rang - 1]
		if (target !== undefined) target.focus()
		// The list is empty. A key goes to the field to add; a click or a tap goes to the title, so
		// that the keyboard of the phone stays closed.
		else if (removal.clavier) field.current?.focus()
		else zone.current?.closest<HTMLElement>('[role="dialog"]')?.querySelector<HTMLElement>('h2')?.focus()
	}, [bullets])

	/** Adds what the field holds. Returns the list after the addition, `null` when a name is refused. */
	function add(finale: boolean): readonly Bullet[] | null {
		const parsedList = readNames(input, bullets, kind, finale)
		const added = parsedList.noms.map(nom => ({ id: `${LOCAL}${++counter.current}`, nom }))
		const suite = added.length > 0 ? [...bullets, ...added] : bullets
		if (added.length > 0) setBullets(suite)
		setInput(parsedList.reste)
		setRefusal(parsedList.ok ? '' : parsedList.message)
		return parsedList.ok ? suite : null
	}

	function remove(rang: number, puce: Bullet, clavier: boolean) {
		afterRemoval.current = { rang, clavier }
		setAnnouncement(({ rang: dernier }) => ({
			phrase: kind.retiree(puce.nom).replace(/\s+/g, ' ').trim(),
			rang: dernier + 1,
		}))
		setBullets(courantes => courantes.filter(autre => autre.id !== puce.id))
		// The refusal of a name that was in the list is no longer true once the name is free.
		setRefusal('')
	}

	async function save(evenement: FormEvent) {
		evenement.preventDefault()
		if (lock.current) return
		lock.current = true
		try {
			// What she typed and did not add yet is added, not lost; a refused name stops the save.
			const list = input.trim() === '' ? bullets : add(true)
			if (list === null) return
			setPending(true)
			setMessage('')
			const result: SaveResult<BulletsValues> = await envoyer({
				puces: list.map(({ id, nom }) => (id.startsWith(LOCAL) ? { nom } : { id, nom })),
			}).catch(() => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave(kind.mesure, result)
			if (result.ok) {
				onEnregistre(result.valeurs.puces)
				return
			}
			setMessage(result.message)
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<EditingPanel
			titre={kind.titre}
			enCours={pending}
			modifie={input.trim() !== '' || !sameBullets(bullets, initiales)}
			retour={retour}
			onFermer={onFermer}
		>
			<div ref={zone}>
				<form noValidate aria-busy={pending} onSubmit={save} className="flex flex-col gap-4">
					<p className="text-neutral-700 text-sm">{kind.explication}</p>
					<div className="flex flex-col gap-1">
						<label htmlFor="puces-champ" className="font-medium text-sm">
							{kind.libelle}
						</label>
						<div className="flex flex-wrap gap-2">
							<input
								ref={field}
								id="puces-champ"
								type="text"
								autoComplete="off"
								enterKeyHint="enter"
								value={input}
								aria-invalid={refusal ? true : undefined}
								aria-describedby={refusal ? 'puces-refus' : undefined}
								className={`${FIELD} min-w-0 flex-1`}
								onChange={evenement => {
									setInput(evenement.target.value)
									setRefusal('')
									// A « ; » ends a name: what is before it is added at once.
									if (evenement.target.value.includes(';')) {
										const parsedList = readNames(evenement.target.value, bullets, kind, false)
										const added = parsedList.noms.map(nom => ({ id: `${LOCAL}${++counter.current}`, nom }))
										if (added.length > 0) setBullets([...bullets, ...added])
										setInput(parsedList.reste)
										setRefusal(parsedList.ok ? '' : parsedList.message)
									}
								}}
								onKeyDown={evenement => {
									if (evenement.key !== 'Enter') return
									// Enter never sends the form from here, and held down it acts once.
									evenement.preventDefault()
									if (!evenement.repeat) add(true)
								}}
							/>
							<button
								type="button"
								onClick={() => {
									add(true)
									field.current?.focus()
								}}
								onKeyDown={evenement => {
									if (evenement.repeat) evenement.preventDefault()
								}}
								className={`${BUTTON} border border-neutral-400 bg-white`}
							>
								Ajouter
							</button>
						</div>
						<div role="alert">
							{refusal ? (
								<p id="puces-refus" className="text-red-800 text-sm">
									{refusal}
								</p>
							) : null}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-sm">{kind.ajoutees}</h3>
						{bullets.length === 0 ? (
							<p className="text-neutral-600 text-sm italic">{kind.vide}</p>
						) : (
							<ul className="flex flex-wrap gap-2">
								{bullets.map((puce, rang) => (
									<li key={puce.id}>
										<button
											type="button"
											data-retirer
											aria-label={`Retirer ${puce.nom}`}
											onKeyDown={evenement => {
												if (evenement.repeat) evenement.preventDefault()
											}}
											// detail 0: Enter or Space. A click or a tap has a count of 1 or more.
											onClick={evenement => remove(rang, puce, evenement.detail === 0)}
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
						<span key={announcement.rang}>{announcement.phrase}</span>
					</div>
					<div role="alert">
						{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
					</div>
					<button
						type="submit"
						disabled={pending}
						className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
					>
						{pending ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				</form>
			</div>
		</EditingPanel>
	)
}
