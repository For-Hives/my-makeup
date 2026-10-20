'use client'

import { useRef, useState } from 'react'
import { trackAccountDeletion } from '@/lib/dashboard/analytics'
import {
	type ConfirmationMode,
	DELETION_MESSAGES,
	type DeletionResult,
	type DeletionValues,
} from '@/lib/dashboard/deletion-confirmation'
import { EditingPanel } from './EditingPanel'

export type DeletionUpload = (valeurs: DeletionValues) => Promise<DeletionResult>

const DELETION_FAILURE_MESSAGE = DELETION_MESSAGES.echec
const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/** Where the browser goes once the account is deleted: the home page, as after a sign-out. */
const PAGE_AFTER_DELETION = '/'

/**
 * « Supprimer mon compte » at the bottom of her space (ticket 141). The button opens a dialog that
 * says what goes with the account, asks her to retype her password (or her address when her
 * account holds no password she knows) and deletes only then. While the request is under way
 * nothing can be sent again: a double click or a held Enter sends one request. A refusal keeps the
 * dialog open with its message; nothing was deleted. The send function is a property: the page gives
 * the Server Action, a test gives a fake. On success `aller` takes the browser away (a full
 * navigation, so that nothing of the old session stays in the router cache).
 */
export function AccountDeletion({
	mode,
	envoyer,
	aller = adresse => window.location.assign(adresse),
}: {
	mode: ConfirmationMode
	envoyer: DeletionUpload
	aller?: (adresse: string) => void
}) {
	const [open, setOpen] = useState(false)
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<section
			aria-labelledby="supprimer-mon-compte"
			data-testid="zone-suppression"
			className="w-full min-w-0 rounded border border-red-300 bg-white p-5 sm:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id="supprimer-mon-compte" className="font-bold text-neutral-800 text-xl">
						Supprimer mon compte
					</h2>
					<p className="text-neutral-700 text-sm">
						Ton compte, ton profil et toutes tes photos sont supprimés pour toujours.
					</p>
				</div>
				<button
					ref={trigger}
					type="button"
					aria-haspopup="dialog"
					onClick={() => setOpen(true)}
					// Held down, Enter repeats: it opens the dialog once.
					onKeyDown={evenement => {
						if (evenement.repeat) evenement.preventDefault()
					}}
					className={`${BUTTON} border border-red-700 bg-white text-red-800`}
				>
					Supprimer mon compte
				</button>
			</div>
			{open ? (
				<DeletionForm mode={mode} envoyer={envoyer} aller={aller} retour={trigger} onFermer={() => setOpen(false)} />
			) : null}
		</section>
	)
}

function DeletionForm({
	mode,
	envoyer,
	aller,
	retour,
	onFermer,
}: {
	mode: ConfirmationMode
	envoyer: DeletionUpload
	aller: (adresse: string) => void
	retour: React.RefObject<HTMLButtonElement | null>
	onFermer: () => void
}) {
	const [confirmation, setConfirmation] = useState('')
	const [pending, setPending] = useState(false)
	const [fait, setFait] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)
	const byEmail = mode === 'email'

	async function deleteAccount() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		try {
			const result: DeletionResult = await envoyer({ confirmation }).catch(() => ({
				ok: false as const,
				message: DELETION_FAILURE_MESSAGE,
			}))
			if (result.ok) {
				// Counted once the server has deleted the account, and only then.
				trackAccountDeletion()
				// The lock stays on: nothing more can be sent, the browser leaves.
				setFait(true)
				aller(PAGE_AFTER_DELETION)
				return
			}
			setMessage(result.message)
		} catch {
			setMessage(DELETION_FAILURE_MESSAGE)
		}
		lock.current = false
		setPending(false)
	}

	return (
		<EditingPanel titre="Supprimer mon compte" enCours={pending} modifie={false} retour={retour} onFermer={onFermer}>
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					void deleteAccount()
				}}
				className="flex flex-col gap-4"
			>
				<p className="text-sm">
					Ton compte, ton profil et toutes tes photos seront supprimés pour toujours. Ta page publique disparaît tout de
					suite. Cette action est irréversible.
				</p>
				<div className="flex flex-col gap-1">
					<label htmlFor="suppression-confirmation" className="font-medium text-sm">
						{byEmail ? 'Retape l’adresse email de ton compte pour confirmer' : 'Retape ton mot de passe pour confirmer'}
					</label>
					<input
						id="suppression-confirmation"
						name="confirmation"
						type={byEmail ? 'email' : 'password'}
						autoComplete={byEmail ? 'off' : 'current-password'}
						value={confirmation}
						disabled={pending}
						onChange={evenement => setConfirmation(evenement.target.value)}
						className="min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base"
					/>
				</div>
				<div role="alert">
					{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
				</div>
				<p role="status" className="text-sm">
					{fait ? 'Ton compte est supprimé.' : ''}
				</p>
				<div className="flex flex-wrap gap-3">
					<button
						type="submit"
						disabled={pending || confirmation === ''}
						aria-busy={pending}
						className={`${BUTTON} bg-red-700 text-white disabled:cursor-not-allowed disabled:opacity-60`}
					>
						{pending ? 'Suppression…' : 'Supprimer définitivement mon compte'}
					</button>
				</div>
			</form>
		</EditingPanel>
	)
}
