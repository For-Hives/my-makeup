'use client'

import { useRef, useState } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	NETWORKS,
	NETWORKS_FIELDS,
	type NetworkField,
	type NetworksValues,
	readNetworks,
} from '@/lib/dashboard/networks'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { EditingPanel } from './EditingPanel'

export type NetworksUpload = (valeurs: NetworksValues) => Promise<SaveResult<NetworksValues>>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The form reads what she typed by the rule of the server (`readNetworks`): « @pseudo » becomes
 * the address, an address of another site is refused under its field, and nothing is sent while a
 * field is refused (E30). The values the form sends are the normalised ones.
 */
const resolver: Resolver<NetworksValues> = values => {
	const parsed = readNetworks(values)
	if (parsed.ok) return { values: parsed.valeurs, errors: {} }
	return {
		values: {},
		errors: Object.fromEntries(
			NETWORKS_FIELDS.flatMap(champ => {
				const message = parsed.champs[champ]
				return message === undefined ? [] : [[champ, { type: 'validate', message }]]
			})
		),
	}
}

/**
 * The button « Modifier » of the card of her networks, and the panel it opens (ticket 125). Same
 * contract as the identity (src/components/dashboard/IdentityEditor.tsx): the card shows only what
 * the database stored; a failure keeps the old value and what she typed, and says so (E31); one
 * request for two clicks; the result is announced outside of the panel.
 *
 * Emptying a field removes the network. A network is a channel of contact: the panel says so.
 */
export function NetworksEditor({ valeurs, envoyer }: { valeurs: NetworksValues; envoyer: NetworksUpload }) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mes réseaux"
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
				<NetworksForm
					valeurs={valeurs}
					envoyer={envoyer}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Tes réseaux sont enregistrés.')
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function NetworksForm({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: NetworksValues
	envoyer: NetworksUpload
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<NetworksValues>({ resolver: resolver, defaultValues: valeurs })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)

	async function save(saisie: NetworksValues) {
		setPending(true)
		setMessage('')
		try {
			const result: SaveResult<NetworksValues> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('reseaux', result)
			if (result.ok) {
				onEnregistre()
				return
			}
			setMessage(result.message)
			for (const field of NETWORKS_FIELDS) {
				const text = result.champs?.[field]
				if (text) setError(field, { message: text })
			}
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<EditingPanel titre="Modifier mes réseaux" enCours={pending} modifie={isDirty} retour={retour} onFermer={onFermer}>
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
				<p className="text-neutral-700 text-sm">
					Écris ton @pseudo ou colle l’adresse de ta page. Un champ vide retire le réseau. Un réseau ou un site compte
					comme un moyen de te contacter.
				</p>
				{NETWORKS_FIELDS.map((champ: NetworkField) => {
					const error = errors[champ]?.message
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`reseaux-${champ}`} className="font-medium text-sm">
								{NETWORKS[champ].libelle}
							</label>
							<input
								id={`reseaux-${champ}`}
								type="text"
								inputMode={champ === 'siteWeb' ? 'url' : 'text'}
								autoComplete="off"
								autoCapitalize="none"
								spellCheck={false}
								placeholder={NETWORKS[champ].exemple}
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `reseaux-${champ}-erreur` : undefined}
								className={FIELD}
								{...register(champ)}
							/>
							{error ? (
								<p id={`reseaux-${champ}-erreur`} className="text-red-800 text-sm">
									{error}
								</p>
							) : null}
						</div>
					)
				})}
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
		</EditingPanel>
	)
}
