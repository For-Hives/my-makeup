'use client'

import { useRef, useState } from 'react'
import { trackSave } from '@/lib/dashboard/analytics'
import type { AvailabilityValues } from '@/lib/dashboard/availability'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'

export type AvailabilityUpload = (valeurs: AvailabilityValues) => Promise<SaveResult<AvailabilityValues>>

/**
 * The switch of the card « Disponibilité » (ticket 124). It shows the stored state and changes it
 * only once the server has answered with what it stored (never before): a failure leaves the
 * switch where it was and says so. While a save is under way the switch is locked, so a double
 * click or a held key sends one request; a held Space or Enter does not toggle it again.
 *
 * The state is also written on the card (« Disponible » / « Pas disponible en ce moment »), read
 * again from the database after a save: the switch never relies on colour alone.
 */
export function AvailabilitySwitch({ disponible, envoyer }: { disponible: boolean; envoyer: AvailabilityUpload }) {
	const [state, setState] = useState(disponible)
	const [seen, setSeen] = useState(disponible)
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [announcement, setAnnouncement] = useState('')
	const lock = useRef(false)

	// The page was read again (another tab, a reload of the data): follow the stored value.
	if (seen !== disponible) {
		setSeen(disponible)
		setState(disponible)
	}

	async function toggle() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		setAnnouncement('')
		try {
			const result: SaveResult<AvailabilityValues> = await envoyer({ disponible: !state }).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('disponibilite', result)
			if (result.ok) {
				setState(result.valeurs.disponible)
				setAnnouncement(
					result.valeurs.disponible
						? 'Tu es disponible : ton profil apparaît dans la recherche.'
						: 'Tu es indisponible : ton profil n’apparaît plus dans la recherche.'
				)
			} else {
				setMessage(result.message)
			}
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
			<button
				type="button"
				role="switch"
				aria-checked={state}
				aria-busy={pending}
				disabled={pending}
				onClick={() => void toggle()}
				// Held down, Enter repeats: one press toggles once.
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className="flex min-h-11 items-center gap-3 rounded-md border border-neutral-400 bg-white px-4 py-2 font-medium disabled:cursor-wait disabled:opacity-60"
			>
				<span>Je suis disponible</span>
				<span
					aria-hidden="true"
					className={`flex h-6 w-11 items-center rounded-full p-0.5 ${state ? 'justify-end bg-indigo-700' : 'justify-start bg-neutral-500'}`}
				>
					<span className="h-5 w-5 rounded-full bg-white" />
				</span>
			</button>
			<p role="status" className="text-green-800 text-sm">
				{announcement}
			</p>
			<div role="alert">
				{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
			</div>
		</div>
	)
}
