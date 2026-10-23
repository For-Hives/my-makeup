'use client'

import { useState } from 'react'
import { signOut, signOutEverywhere } from '@/app/(front)/(dashboard)/auth/actions'

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/**
 * The two ways out of the space (ticket 078): this device, at once; every device, after a
 * confirmation that says what it does. The confirmation is a step of the page, and the action
 * refuses to close every session without the field it sends.
 */
export function SignOutButtons() {
	const [confirmation, setConfirmation] = useState(false)

	return (
		<div className="flex w-full max-w-sm flex-col gap-3">
			<form action={signOut}>
				<button type="submit" className={`${BUTTON} w-full bg-neutral-900 text-white`}>
					Me déconnecter
				</button>
			</form>
			{confirmation ? (
				<form
					action={signOutEverywhere}
					className="flex flex-col gap-3 rounded-md border border-neutral-300 p-4 text-left"
				>
					<p id="texte-confirmation" className="text-sm">
						Tu seras déconnectée de tous tes appareils, celui-ci compris. Tu devras te reconnecter partout.
					</p>
					<input type="hidden" name="confirmation" value="oui" />
					<button type="submit" aria-describedby="texte-confirmation" className={`${BUTTON} bg-neutral-900 text-white`}>
						Oui, me déconnecter partout
					</button>
					<button
						type="button"
						onClick={() => setConfirmation(false)}
						className={`${BUTTON} border border-neutral-300 bg-white`}
					>
						Annuler
					</button>
				</form>
			) : (
				<button
					type="button"
					aria-expanded={false}
					onClick={() => setConfirmation(true)}
					className={`${BUTTON} border border-neutral-300 bg-white`}
				>
					Me déconnecter de tous les appareils
				</button>
			)}
		</div>
	)
}
