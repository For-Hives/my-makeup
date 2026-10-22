'use client'

import { useRef, useState } from 'react'
import { trackSave } from '@/lib/dashboard/analytics'
import type { AvailabilityValues } from '@/lib/dashboard/availability'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'

export type ResumeUpload = (valeurs: AvailabilityValues) => Promise<SaveResult<AvailabilityValues>>

/**
 * The button « Reprendre les demandes » of the progress block (ticket 292): it sets her available
 * again, through the same save as the switch of the card « Disponibilité ». The live region stays
 * mounted whether the button is shown or not, so the result is announced even after the page has
 * read the new state and dropped the button.
 */
export function ResumeRequests({ enPause, envoyer }: { enPause: boolean; envoyer: ResumeUpload }) {
	const [pending, setPending] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const [message, setMessage] = useState('')
	const lock = useRef(false)

	async function resume() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		setAnnouncement('')
		try {
			const result: SaveResult<AvailabilityValues> = await envoyer({ disponible: true }).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('disponibilite', result)
			if (result.ok) setAnnouncement('Tu as repris les demandes : ton profil apparaît de nouveau dans la recherche.')
			else setMessage(result.message)
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<div className="mt-2 flex flex-col items-start gap-2">
			{enPause && (
				<button
					type="button"
					aria-busy={pending}
					disabled={pending}
					onClick={() => void resume()}
					className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
				>
					Reprendre les demandes
				</button>
			)}
			<p role="status" className="text-green-800 text-sm">
				{announcement}
			</p>
			<div role="alert">
				{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
			</div>
		</div>
	)
}
