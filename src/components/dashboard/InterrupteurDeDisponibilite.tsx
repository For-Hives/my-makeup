'use client'

import { useRef, useState } from 'react'
import type { ValeursDeLaDisponibilite } from '@/lib/dashboard/disponibilite'
import { mesurerLEnregistrement } from '@/lib/dashboard/mesure'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/dashboard/resultat'

export type EnvoiDeLaDisponibilite = (
	valeurs: ValeursDeLaDisponibilite
) => Promise<ResultatDEnregistrement<ValeursDeLaDisponibilite>>

/**
 * The switch of the card « Disponibilité » (ticket 124). It shows the stored state and changes it
 * only once the server has answered with what it stored (never before): a failure leaves the
 * switch where it was and says so. While a save is under way the switch is locked, so a double
 * click or a held key sends one request; a held Space or Enter does not toggle it again.
 *
 * The state is also written on the card (« Disponible » / « Pas disponible en ce moment »), read
 * again from the database after a save: the switch never relies on colour alone.
 */
export function InterrupteurDeDisponibilite({
	disponible,
	envoyer,
}: {
	disponible: boolean
	envoyer: EnvoiDeLaDisponibilite
}) {
	const [etat, setEtat] = useState(disponible)
	const [vu, setVu] = useState(disponible)
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const [annonce, setAnnonce] = useState('')
	const verrou = useRef(false)

	// The page was read again (another tab, a reload of the data): follow the stored value.
	if (vu !== disponible) {
		setVu(disponible)
		setEtat(disponible)
	}

	async function basculer() {
		if (verrou.current) return
		verrou.current = true
		setEnCours(true)
		setMessage('')
		setAnnonce('')
		try {
			const resultat: ResultatDEnregistrement<ValeursDeLaDisponibilite> = await envoyer({ disponible: !etat }).catch(
				() => ({ ok: false, message: MESSAGE_ECHEC })
			)
			mesurerLEnregistrement('disponibilite', resultat)
			if (resultat.ok) {
				setEtat(resultat.valeurs.disponible)
				setAnnonce(
					resultat.valeurs.disponible
						? 'Tu es disponible : ton profil apparaît dans la recherche.'
						: 'Tu es indisponible : ton profil n’apparaît plus dans la recherche.'
				)
			} else {
				setMessage(resultat.message)
			}
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	return (
		<div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
			<button
				type="button"
				role="switch"
				aria-checked={etat}
				aria-busy={enCours}
				disabled={enCours}
				onClick={() => void basculer()}
				// Held down, Enter repeats: one press toggles once.
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className="flex min-h-11 items-center gap-3 rounded-md border border-neutral-400 bg-white px-4 py-2 font-medium disabled:cursor-wait disabled:opacity-60"
			>
				<span>Je suis disponible</span>
				<span
					aria-hidden="true"
					className={`flex h-6 w-11 items-center rounded-full p-0.5 ${etat ? 'justify-end bg-indigo-700' : 'justify-start bg-neutral-500'}`}
				>
					<span className="h-5 w-5 rounded-full bg-white" />
				</span>
			</button>
			<p role="status" className="text-green-800 text-sm">
				{annonce}
			</p>
			<div role="alert">
				{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
			</div>
		</div>
	)
}
