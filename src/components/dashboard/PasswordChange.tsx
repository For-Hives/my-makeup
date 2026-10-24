'use client'

import { useRef, useState } from 'react'
import {
	CHANGE_MESSAGES,
	type PasswordChangeMode,
	type PasswordChangeResult,
	type PasswordChangeValues,
} from '@/lib/dashboard/change-password'
import { EditingPanel } from './EditingPanel'

export type PasswordChangeSend = (valeurs: PasswordChangeValues) => Promise<PasswordChangeResult>
export type SetPasswordLinkSend = () => Promise<{ ok: boolean; message: string; session?: 'expiree' }>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const INPUT = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * « Mon mot de passe » in her space (ticket 999). With a password she knows, a button opens a dialog with three
 * fields: the current password, the new one and the new one again. A refusal keeps the dialog open with its
 * message; nothing was changed. Without one (an account that came from Google or Facebook), a button asks for the
 * link by email instead: nothing is typed. While a request is under way nothing can be sent again. The send
 * functions are properties: the page gives the Server Actions, a test gives fakes. Nothing typed is ever kept after
 * the dialog closes, shown in a message or sent anywhere but to the action.
 */
export function PasswordChange({
	mode,
	envoyer,
	demanderLien,
	reconnecter = adresse => window.location.assign(adresse),
}: {
	mode: PasswordChangeMode
	envoyer: PasswordChangeSend
	demanderLien: SetPasswordLinkSend
	reconnecter?: (adresse: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [notice, setNotice] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)
	const [pending, setPending] = useState(false)
	const lock = useRef(false)
	const byLink = mode === 'lien'

	async function askLink() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setNotice('')
		try {
			const result: Awaited<ReturnType<SetPasswordLinkSend>> = await demanderLien().catch(() => ({
				ok: false,
				message: CHANGE_MESSAGES.echec,
			}))
			if (result.session === 'expiree') reconnecter('/auth/signin')
			setNotice(result.message)
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<section
			aria-labelledby="mon-mot-de-passe"
			data-testid="zone-mot-de-passe"
			className="reveal w-full min-w-0 rounded-[22px] border border-[#E6DCD5] bg-white p-5 text-[#1A1417] sm:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id="mon-mot-de-passe" className="font-bold text-neutral-800 text-xl">
						Mon mot de passe
					</h2>
					<p className="text-neutral-700 text-sm">
						{byLink
							? 'Ton compte n’a pas de mot de passe que tu connaisses. Définis-en un avec un lien envoyé par email : tu pourras te connecter avec ton adresse et ce mot de passe.'
							: 'Change ton mot de passe sans passer par ta boîte mail. Tes autres appareils seront déconnectés.'}
					</p>
				</div>
				{byLink ? (
					<button
						type="button"
						disabled={pending}
						aria-busy={pending}
						onClick={() => void askLink()}
						className={`${BUTTON} border border-indigo-900 bg-white text-indigo-900 disabled:opacity-60`}
					>
						{pending ? 'Envoi…' : 'Définir un mot de passe'}
					</button>
				) : (
					<button
						ref={trigger}
						type="button"
						aria-haspopup="dialog"
						onClick={() => {
							setNotice('')
							setOpen(true)
						}}
						onKeyDown={evenement => {
							if (evenement.repeat) evenement.preventDefault()
						}}
						className={`${BUTTON} border border-indigo-900 bg-white text-indigo-900`}
					>
						Changer mon mot de passe
					</button>
				)}
			</div>
			<p role="status" className="mt-3 text-neutral-800 text-sm" data-testid="mot-de-passe-statut">
				{notice}
			</p>
			{open ? (
				<PasswordForm
					envoyer={envoyer}
					retour={trigger}
					reconnecter={reconnecter}
					onFermer={() => setOpen(false)}
					onFait={message => {
						setOpen(false)
						setNotice(message)
					}}
				/>
			) : null}
		</section>
	)
}

function PasswordForm({
	envoyer,
	retour,
	reconnecter,
	onFermer,
	onFait,
}: {
	envoyer: PasswordChangeSend
	retour: React.RefObject<HTMLButtonElement | null>
	reconnecter: (adresse: string) => void
	onFermer: () => void
	onFait: (message: string) => void
}) {
	const [current, setCurrent] = useState('')
	const [password, setPassword] = useState('')
	const [confirmation, setConfirmation] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)

	async function change() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		try {
			const result: PasswordChangeResult = await envoyer({ current, password, confirmation }).catch(() => ({
				ok: false as const,
				code: 'echec' as const,
				message: CHANGE_MESSAGES.echec,
			}))
			if (result.ok) {
				// What she typed goes with the dialog.
				onFait(result.message)
				return
			}
			if (result.session === 'expiree') reconnecter('/auth/signin')
			setMessage(result.message)
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const complete = current !== '' && password !== '' && confirmation !== ''
	return (
		<EditingPanel
			titre="Changer mon mot de passe"
			enCours={pending}
			modifie={complete}
			retour={retour}
			onFermer={onFermer}
		>
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					void change()
				}}
				className="flex flex-col gap-4"
			>
				<Field
					id="mdp-actuel"
					label="Ton mot de passe actuel"
					autoComplete="current-password"
					valeur={current}
					onChange={setCurrent}
					disabled={pending}
				/>
				<Field
					id="mdp-nouveau"
					label="Ton nouveau mot de passe"
					autoComplete="new-password"
					valeur={password}
					onChange={setPassword}
					disabled={pending}
				/>
				<Field
					id="mdp-confirmation"
					label="Retape ton nouveau mot de passe"
					autoComplete="new-password"
					valeur={confirmation}
					onChange={setConfirmation}
					disabled={pending}
				/>
				<p className="text-neutral-700 text-sm">8 caractères au moins.</p>
				<div role="alert">
					{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
				</div>
				<div className="flex flex-wrap gap-3">
					<button
						type="submit"
						disabled={pending || !complete}
						aria-busy={pending}
						className={`${BUTTON} bg-indigo-900 text-white disabled:cursor-not-allowed disabled:opacity-60`}
					>
						{pending ? 'Enregistrement…' : 'Changer mon mot de passe'}
					</button>
				</div>
			</form>
		</EditingPanel>
	)
}

function Field({
	id,
	label,
	autoComplete,
	valeur,
	onChange,
	disabled,
}: {
	id: string
	label: string
	autoComplete: string
	valeur: string
	onChange: (valeur: string) => void
	disabled: boolean
}) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="font-medium text-sm">
				{label}
			</label>
			<input
				id={id}
				name={id}
				type="password"
				autoComplete={autoComplete}
				value={valeur}
				disabled={disabled}
				onChange={evenement => onChange(evenement.target.value)}
				className={INPUT}
			/>
		</div>
	)
}
