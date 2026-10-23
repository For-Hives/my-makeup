'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { SpecialtyChoice } from '@/components/dashboard/SpecialtyChoice'
import { expiredSessionUrl } from '@/lib/auth/return-to'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	canRedirect,
	type DraftStorage,
	forgetInput,
	type GuardedInput,
	guardInput,
	readInput,
	tabStorage,
} from '@/lib/dashboard/guarded-input'
import { IDENTITY_FIELDS, IDENTITY_LABELS, type IdentityValues, identitySchema } from '@/lib/dashboard/identity'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { EditingPanel } from './EditingPanel'

export type IdentityUpload = (valeurs: IdentityValues) => Promise<SaveResult<IdentityValues>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const DASHBOARD_PAGE = '/auth/profil'

const go = (url: string): void => window.location.assign(url)

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The button « Modifier » of the card of her identity, and the panel it opens (ticket 119). The
 * card shows only what the database stored: the form starts from `valeurs`, the stored ones, and a
 * save changes the card once the server has answered (the page is read again), never before.
 *
 * - Out of bounds, the message is under the field and nothing is sent (U25, E30).
 * - A failure leaves the old value on the card, keeps what she typed, and says so (E31).
 * - Two clicks, or Enter held, send one request: the form refuses the next one until the first has
 *   answered (the same lock as the sign-in form).
 * - The result is announced in a `role="status"` that is outside the panel, so it is still there
 *   once the panel has closed.
 *
 * - The session ends while she types (ticket 121, E32): the save fails with nothing stored, what she
 *   typed is kept in the tab (`guarded-input.ts`), she is sent once to the sign-in page, and back
 *   on her space the same panel opens again with her typing. The draft is forgotten after a save
 *   or when she abandons. A second « expired » right after the redirection does not send her
 *   away again: the message stays in the panel.
 *
 * The send function is a property: the page gives the server action, a test gives a fake. So are
 * `proprietaire` (whose draft it is: another account on this browser never sees it), and the
 * storage and the navigation, which a test replaces.
 */
export function IdentityEditor({
	valeurs,
	envoyer,
	proprietaire,
	stockage = tabStorage,
	naviguer = go,
}: {
	valeurs: IdentityValues
	envoyer: IdentityUpload
	proprietaire: string
	stockage?: () => DraftStorage | null
	naviguer?: (url: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const [retrouvee, setRetrouvee] = useState<Record<keyof IdentityValues, string> | null>(null)
	const trigger = useRef<HTMLButtonElement>(null)

	// Back from the sign-in page: the typing kept before the redirection opens the panel again.
	useEffect(() => {
		const guarded = readInput(stockage(), 'identite', proprietaire, IDENTITY_FIELDS, Date.now())
		if (guarded === null) return
		if (IDENTITY_FIELDS.every(champ => guarded.valeurs[champ] === valeurs[champ])) {
			forgetInput(stockage(), 'identite', proprietaire)
			return
		}
		setRetrouvee(guarded.valeurs)
		setOpen(true)
	}, [proprietaire, stockage, valeurs])

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mon identité"
				onClick={() => {
					setAnnouncement('')
					setRetrouvee(null)
					setOpen(true)
				}}
				// Held down, Enter repeats: it opens the panel once.
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
				<IdentityForm
					valeurs={valeurs}
					retrouvee={retrouvee}
					envoyer={envoyer}
					proprietaire={proprietaire}
					stockage={stockage}
					naviguer={naviguer}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ton identité est enregistrée.')
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function IdentityForm({
	valeurs,
	retrouvee,
	envoyer,
	proprietaire,
	stockage,
	naviguer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: IdentityValues
	retrouvee: IdentityValues | null
	envoyer: IdentityUpload
	proprietaire: string
	stockage: () => DraftStorage | null
	naviguer: (url: string) => void
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		watch,
		setError,
		setValue,
		getValues,
		formState: { errors, isDirty },
	} = useForm<IdentityValues>({ resolver: zodResolver(identitySchema), defaultValues: valeurs })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const lock = useRef(false)

	// The typing kept before the redirection comes back into the fields, as changes still to save.
	useEffect(() => {
		if (retrouvee === null) return
		for (const field of IDENTITY_FIELDS) setValue(field, retrouvee[field], { shouldDirty: true })
	}, [retrouvee, setValue])

	const close = () => {
		forgetInput(stockage(), 'identite', proprietaire)
		onFermer()
	}

	async function save(saisie: IdentityValues) {
		setPending(true)
		setMessage('')
		setExpiredSession(false)
		let part = false
		try {
			const result: SaveResult<IdentityValues> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('identite', result)
			if (result.ok) {
				forgetInput(stockage(), 'identite', proprietaire)
				onEnregistre()
				return
			}
			if (result.session === 'expiree') {
				// Nothing was stored. Keep the typing, then send her to sign in: once, never in a loop.
				const now = Date.now()
				const before = readInput(stockage(), 'identite', proprietaire, IDENTITY_FIELDS, now)
				const redirects = canRedirect(before, now)
				const guarded: GuardedInput<IdentityValues> = {
					valeurs: getValues(),
					le: now,
					redirigeLe: redirects ? now : (before?.redirigeLe ?? null),
				}
				const guardedSuccessfully = guardInput(stockage(), 'identite', proprietaire, guarded)
				if (redirects && guardedSuccessfully) {
					part = true
					naviguer(expiredSessionUrl(DASHBOARD_PAGE))
					return
				}
				setExpiredSession(true)
				setMessage(MESSAGE_SESSION)
				return
			}
			setMessage(result.message)
			for (const field of IDENTITY_FIELDS) {
				const text = result.champs?.[field]
				if (text) setError(field, { message: text })
			}
		} finally {
			// Leaving for the sign-in page: the form stays locked until the page goes.
			if (!part) {
				lock.current = false
				setPending(false)
			}
		}
	}

	return (
		<EditingPanel titre="Modifier mon identité" enCours={pending} modifie={isDirty} retour={retour} onFermer={close}>
			{retrouvee !== null ? (
				<p role="status" className="mb-4 rounded-md bg-neutral-100 p-3 text-sm">
					Tu t’es reconnectée : on a retrouvé ce que tu avais saisi. Vérifie-le, puis enregistre.
				</p>
			) : null}
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					if (lock.current) return
					lock.current = true
					void handleSubmit(save, () => {
						lock.current = false
					})(evenement)
				}}
				className="flex flex-col gap-4"
			>
				{IDENTITY_FIELDS.filter(champ => !champ.startsWith('specialty')).map(champ => {
					const error = errors[champ]?.message
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`identite-${champ}`} className="font-medium text-sm">
								{IDENTITY_LABELS[champ].libelle}
							</label>
							<input
								id={`identite-${champ}`}
								type="text"
								autoComplete="off"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `identite-${champ}-erreur` : undefined}
								className={FIELD}
								{...register(champ)}
							/>
							{error ? (
								<p id={`identite-${champ}-erreur`} className="text-red-800 text-sm">
									{error}
								</p>
							) : null}
						</div>
					)
				})}
				<SpecialtyChoice
					idPrefix="identite"
					bullets={watch('specialtyBullets')}
					other={watch('specialtyOther')}
					onChange={(bullets, other) => {
						setValue('specialtyBullets', bullets, { shouldDirty: true })
						setValue('specialtyOther', other, { shouldDirty: true })
					}}
					error={errors.specialtyBullets?.message}
					otherError={errors.specialtyOther?.message}
				/>
				<div role="alert">
					{message ? (
						<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
							{message}
							{expiredSession ? (
								<>
									{' '}
									<a
										className="font-medium underline"
										href={expiredSessionUrl(DASHBOARD_PAGE)}
										target="_blank"
										rel="noopener"
									>
										Te reconnecter (nouvel onglet)
									</a>
									, puis reviens ici et enregistre à nouveau : ta saisie est toujours là.
								</>
							) : null}
						</p>
					) : null}
				</div>
				<button
					type="submit"
					disabled={pending}
					className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
				>
					{pending ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</EditingPanel>
	)
}
