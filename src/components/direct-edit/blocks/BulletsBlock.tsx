'use client'

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
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
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type BulletsSave = (input: { puces: { id?: string; nom: string }[] }) => Promise<SaveResult<BulletsValues>>

const KINDS: Record<BulletsField, BulletsKind> = { languages: LANGUAGES, skills: SKILLS }

/** The words of the block, by list. */
const WORDS: Record<BulletsField, { title: string; pen: string; invitation: ReactNode }> = {
	languages: {
		title: 'Langues',
		pen: 'Modifier mes langues',
		invitation: (
			<span className="pr-8">
				<b className="text-lipstick">Ajoute les langues que tu parles.</b> Une cliente étrangère te trouvera plus
				facilement.
			</span>
		),
	},
	skills: {
		title: 'Compétences',
		pen: 'Modifier mes compétences',
		invitation: (
			<span className="pr-8">
				<b className="text-lipstick">Ajoute tes compétences.</b> Par exemple : maquillage de mariée, teint lumineux,
				peaux matures.
			</span>
		),
	},
}

/** The prefix of the identifier of a chip added in the editor: never sent, never stored. */
const LOCAL = 'nouveau-'

const same = (a: readonly Bullet[], b: readonly Bullet[]): boolean =>
	a.length === b.length && a.every((bullet, rank) => bullet.id === b[rank]?.id && bullet.nom === b[rank]?.nom)

/**
 * Her skills or her languages as chips, edited in place (issue 1016). The names, the bound of 70
 * characters, the refused duplicate and the « ; » that ends a name are the rules of her space
 * (`src/lib/dashboard/bullets.ts`). The seven rules of the lists edited in place hold here:
 * L1 an identifier per chip, L2 typing keeps the focus, L4 the focus stays in the editor after a
 * removal, L5 each removal is announced, L6 a duplicate is refused and said, L7 Enter held acts once.
 * What she typed and did not add yet is added at « Enregistrer », not lost.
 */
export function BulletsBlock({
	list,
	bullets,
	save,
	children,
}: {
	list: BulletsField
	bullets: readonly Bullet[]
	save: BulletsSave
	/** The block as the visitor sees it, or `null` while there is nothing to show. */
	children: ReactNode | null
}) {
	const words = WORDS[list]
	return (
		<EditableBlock
			id={list}
			title={words.title}
			penLabel={words.pen}
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={words.invitation}
			editor={<BulletsForm kind={KINDS[list]} initial={bullets} save={save} />}
		>
			{children}
		</EditableBlock>
	)
}

function BulletsForm({ kind, initial, save }: { kind: BulletsKind; initial: readonly Bullet[]; save: BulletsSave }) {
	const [bullets, setBullets] = useState<readonly Bullet[]>(initial)
	const [input, setInput] = useState('')
	// The refusal of the name she is typing, said near the field (L6).
	const [refusal, setRefusal] = useState('')
	// What a screen reader hears when a chip leaves (L5). `rank` changes at every removal, so two removals
	// of the same name are two sentences.
	const [announcement, setAnnouncement] = useState({ phrase: '', rank: 0 })
	const counter = useRef(0)
	const zone = useRef<HTMLDivElement>(null)
	const field = useRef<HTMLInputElement>(null)
	const title = useRef<HTMLHeadingElement>(null)
	// Set by a removal, read once the chip is gone: where the focus goes (L4).
	const afterRemoval = useRef<{ rank: number; keyboard: boolean } | null>(null)

	useLayoutEffect(() => {
		const removal = afterRemoval.current
		if (removal === null) return
		afterRemoval.current = null
		const buttons = [...(zone.current?.querySelectorAll<HTMLElement>('[data-remove]') ?? [])]
		// The chip that takes the place of the one removed, else the one above it.
		const target = buttons[removal.rank] ?? buttons[removal.rank - 1]
		if (target !== undefined) target.focus()
		// Emptied: a key goes to the field to add; a click or a tap goes to the title, so that the keyboard of a phone stays closed.
		else if (removal.keyboard) field.current?.focus()
		else title.current?.focus()
	}, [bullets])

	/** Adds what the field holds. Gives the list after the addition, `null` when a name is refused. */
	function add(final: boolean): readonly Bullet[] | null {
		const reading = readNames(input, bullets, kind, final)
		const added = reading.noms.map(nom => ({ id: `${LOCAL}${++counter.current}`, nom }))
		const next = added.length > 0 ? [...bullets, ...added] : bullets
		if (added.length > 0) setBullets(next)
		setInput(reading.reste)
		setRefusal(reading.ok ? '' : reading.message)
		return reading.ok ? next : null
	}

	function remove(rank: number, bullet: Bullet, keyboard: boolean) {
		afterRemoval.current = { rank, keyboard }
		setAnnouncement(({ rank: last }) => ({
			phrase: kind.retiree(bullet.nom).replace(/\s+/g, ' ').trim(),
			rank: last + 1,
		}))
		setBullets(current => current.filter(other => other.id !== bullet.id))
		// The refusal of a name that was in the list is no longer true once the name is free.
		setRefusal('')
	}

	return (
		<BlockForm
			title={kind.titre}
			dirty={input.trim() !== '' || !same(bullets, initial)}
			keepsHint="ta liste est toujours là"
			onSend={async () => {
				// What she typed and did not add yet is added, not lost; a refused name stops the save.
				const list = input.trim() === '' ? bullets : add(true)
				if (list === null) return null
				const result = await save({
					puces: list.map(({ id, nom }) => (id.startsWith(LOCAL) ? { nom } : { id, nom })),
				}).catch((): SaveResult<BulletsValues> => ({ ok: false, message: FAILURE_MESSAGE }))
				trackSave(kind.mesure, result)
				return result
			}}
		>
			<div ref={zone} className="flex flex-col gap-4">
				<p className="text-mute text-sm">{kind.explication}</p>
				<div className="flex flex-col gap-1">
					<label htmlFor={`direct-${kind.champ}-field`} className="font-medium text-sm">
						{kind.libelle}
					</label>
					<div className="flex flex-wrap gap-2">
						<input
							ref={field}
							id={`direct-${kind.champ}-field`}
							type="text"
							autoComplete="off"
							enterKeyHint="enter"
							value={input}
							aria-invalid={refusal ? true : undefined}
							aria-describedby={refusal ? `direct-${kind.champ}-refusal` : undefined}
							className={`${FIELD_CLASS} min-w-0 flex-1`}
							onChange={event => {
								setInput(event.target.value)
								setRefusal('')
								// A « ; » ends a name: what is before it is added at once.
								if (event.target.value.includes(';')) {
									const reading = readNames(event.target.value, bullets, kind, false)
									const added = reading.noms.map(nom => ({ id: `${LOCAL}${++counter.current}`, nom }))
									if (added.length > 0) setBullets([...bullets, ...added])
									setInput(reading.reste)
									setRefusal(reading.ok ? '' : reading.message)
								}
							}}
							onKeyDown={event => {
								if (event.key !== 'Enter') return
								// Enter never saves the block from here, and held down it adds once.
								event.preventDefault()
								if (!event.repeat) add(true)
							}}
						/>
						<button
							type="button"
							onClick={() => {
								add(true)
								field.current?.focus()
							}}
							onKeyDown={event => {
								if (event.repeat) event.preventDefault()
							}}
							className="min-h-11 rounded-full border border-ink bg-white px-5 font-semibold text-ink text-sm"
						>
							Ajouter
						</button>
					</div>
					<div role="alert">
						{refusal ? (
							<p id={`direct-${kind.champ}-refusal`} className="text-lipstick-800 text-sm">
								{refusal}
							</p>
						) : null}
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<h3 ref={title} tabIndex={-1} className="font-medium text-sm outline-none">
						{kind.ajoutees}
					</h3>
					{bullets.length === 0 ? (
						<p className="text-mute text-sm italic">{kind.vide}</p>
					) : (
						<ul className="flex flex-wrap gap-2">
							{bullets.map((bullet, rank) => (
								<li key={bullet.id}>
									<button
										type="button"
										data-remove
										aria-label={`Retirer ${bullet.nom}`}
										onKeyDown={event => {
											if (event.repeat) event.preventDefault()
										}}
										// detail 0: Enter or Space. A click or a tap has a count of 1 or more.
										onClick={event => remove(rank, bullet, event.detail === 0)}
										className="flex min-h-11 items-center gap-2 rounded-full bg-nude-100 px-4 text-ink text-sm"
									>
										<span>{bullet.nom}</span>
										<span aria-hidden="true">×</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
				<div role="status" aria-live="polite" className="sr-only" data-testid="removal-announcement">
					<span key={announcement.rank}>{announcement.phrase}</span>
				</div>
			</div>
		</BlockForm>
	)
}
