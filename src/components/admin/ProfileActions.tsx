'use client'

import { Button, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'
import { REASON_MAX, REASON_MESSAGE, validReason } from '@/lib/profile/moderation'

type Asking = 'hide' | 'suspend' | 'restore'

/** What each action says to the admin: the title of its question, its consequence, the button that confirms. */
const WORDS: Record<Asking, { title: string; consequence: string; confirm: string; done: string }> = {
	hide: {
		title: 'Masquer ce profil',
		consequence:
			'La page publique répondra 404 dès que tu enregistreras la fiche, et le profil quittera la recherche et le plan du site. La maquilleuse lira le motif dans son espace.',
		confirm: 'Masquer le profil',
		done: 'Statut choisi : masqué. Enregistre la fiche pour que la page publique disparaisse.',
	},
	suspend: {
		title: 'Suspendre ce profil',
		consequence:
			'Même effet que masquer : la page publique répondra 404 dès que tu enregistreras la fiche. La maquilleuse lira « suspendu » et le motif dans son espace.',
		confirm: 'Suspendre le profil',
		done: 'Statut choisi : suspendu. Enregistre la fiche pour que la page publique disparaisse.',
	},
	restore: {
		title: 'Rétablir ce profil',
		consequence:
			'Le profil reprend le statut automatique à l’enregistrement et revient dans la recherche s’il est publiable. Le motif de la maquilleuse est vidé ; celui-ci reste dans le journal de modération.',
		confirm: 'Rétablir le profil',
		done: 'Profil rétabli. Enregistre la fiche pour le remettre en ligne, s’il est publiable.',
	},
}

/**
 * The buttons at the top of the sheet of a profile (ticket 308, issue 1005): « Voir la page publique »,
 * « Masquer… », « Suspendre… » and, for a hidden profile, « Rétablir… ».
 *
 * - The public page opens in a new tab, and only for a profile that is online: for the others the page answers
 *   404, so the sheet says why instead of offering a dead link.
 * - Each action asks for a reason first (10 to 500 characters), then sets the fields in the form. Nothing is
 *   written before the sheet is saved: the same save as ever takes the page down or back, the server refuses it
 *   without a reason and writes one line in the moderation journal.
 */
export function ProfileActions() {
	const { id } = useDocumentInfo()
	const slug = useFormFields(([fields]) => fields.slug?.value)
	const status = useFormFields(([fields]) => fields.status?.value)
	const { value: choice, setValue: setChoice } = useField<string>({ path: 'chosenStatus' })
	const { setValue: setReason } = useField<string | null>({ path: 'reason' })
	const { setValue: setWord } = useField<string | null>({ path: 'moderationAction' })
	const [asking, setAsking] = useState<Asking | null>(null)
	const [typed, setTyped] = useState('')
	const [invalid, setInvalid] = useState(false)
	const [said, setSaid] = useState('')

	if (id === undefined) return null
	const online = status === 'published' && typeof slug === 'string' && slug !== ''
	const hidden = choice === 'hidden'
	const words = asking === null ? null : WORDS[asking]

	const open = (action: Asking) => {
		setTyped('')
		setInvalid(false)
		setSaid('')
		setAsking(action)
	}
	const cancel = () => {
		setAsking(null)
		setSaid('')
	}
	const confirm = () => {
		if (asking === null) return
		if (!validReason(typed)) {
			setInvalid(true)
			return
		}
		setReason(typed.trim())
		setChoice(asking === 'restore' ? 'automatic' : 'hidden')
		setWord(asking === 'restore' ? null : asking)
		setSaid(WORDS[asking].done)
		setAsking(null)
	}

	return (
		<div data-testid="profile-actions" style={{ marginBottom: 'var(--base)' }}>
			<div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--base) / 2)' }}>
				{online ? (
					<Button buttonStyle="secondary" el="anchor" newTab url={`/profil/${slug}`}>
						Voir la page publique
					</Button>
				) : null}
				{hidden ? (
					<Button buttonStyle="secondary" onClick={() => open('restore')} type="button">
						Rétablir…
					</Button>
				) : (
					<>
						<Button buttonStyle="secondary" onClick={() => open('hide')} type="button">
							Masquer…
						</Button>
						<Button buttonStyle="secondary" onClick={() => open('suspend')} type="button">
							Suspendre…
						</Button>
					</>
				)}
			</div>
			{words ? (
				<fieldset style={{ border: 0, margin: 'calc(var(--base) / 2) 0 0', maxWidth: '40rem', padding: 0 }}>
					<legend style={{ fontWeight: 600, padding: 0 }}>{words.title}</legend>
					<p style={{ margin: '0 0 calc(var(--base) / 2)' }}>{words.consequence}</p>
					<label htmlFor="moderation-reason" style={{ display: 'block', fontWeight: 600 }}>
						Motif (obligatoire)
					</label>
					<textarea
						aria-describedby="moderation-reason-help"
						aria-invalid={invalid}
						id="moderation-reason"
						maxLength={REASON_MAX}
						onChange={event => {
							setTyped(event.target.value)
							setInvalid(false)
						}}
						rows={3}
						style={{ boxSizing: 'border-box', font: 'inherit', minHeight: 44, width: '100%' }}
						value={typed}
					/>
					<p id="moderation-reason-help" style={{ margin: '0 0 calc(var(--base) / 2)' }}>
						{invalid ? REASON_MESSAGE : 'N’y mets aucun nom ni coordonnée : le motif est gardé dans le journal.'} (
						{typed.trim().length}/{REASON_MAX})
					</p>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--base) / 2)' }}>
						<Button buttonStyle={asking === 'restore' ? 'primary' : 'error'} onClick={confirm} type="button">
							{words.confirm}
						</Button>
						<Button buttonStyle="secondary" onClick={cancel} type="button">
							Annuler
						</Button>
					</div>
				</fieldset>
			) : null}
			<p role="status" style={{ margin: 'calc(var(--base) / 2) 0 0' }}>
				{said}
			</p>
		</div>
	)
}
