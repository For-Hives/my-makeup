'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
	CHAMPS_DE_L_IDENTITE,
	LIBELLES_DE_L_IDENTITE,
	schemaDeLIdentite,
	type ValeursDeLIdentite,
} from '@/lib/espace/identite'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDeLIdentite = (valeurs: ValeursDeLIdentite) => Promise<ResultatDEnregistrement<ValeursDeLIdentite>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

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
 * The send function is a property: the page gives the server action, a test gives a fake.
 */
export function EditeurDIdentite({ valeurs, envoyer }: { valeurs: ValeursDeLIdentite; envoyer: EnvoiDeLIdentite }) {
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	const declencheur = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mon identité"
				onClick={() => {
					setAnnonce('')
					setOuvert(true)
				}}
				// Held down, Enter repeats: it opens the panel once.
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className={`${BOUTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{annonce}
			</p>
			{ouvert ? (
				<FormulaireDIdentite
					valeurs={valeurs}
					envoyer={envoyer}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Ton identité est enregistrée.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDIdentite({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDeLIdentite
	envoyer: EnvoiDeLIdentite
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<ValeursDeLIdentite>({ resolver: zodResolver(schemaDeLIdentite), defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)

	async function enregistrer(saisie: ValeursDeLIdentite) {
		setEnCours(true)
		setMessage('')
		try {
			const resultat: ResultatDEnregistrement<ValeursDeLIdentite> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			if (resultat.ok) {
				onEnregistre()
				return
			}
			setMessage(resultat.message)
			for (const champ of CHAMPS_DE_L_IDENTITE) {
				const texte = resultat.champs?.[champ]
				if (texte) setError(champ, { message: texte })
			}
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	return (
		<PanneauDEdition
			titre="Modifier mon identité"
			enCours={enCours}
			modifie={isDirty}
			retour={retour}
			onFermer={onFermer}
		>
			<form
				noValidate
				aria-busy={enCours}
				onSubmit={evenement => {
					evenement.preventDefault()
					if (verrou.current) return
					verrou.current = true
					void handleSubmit(enregistrer, () => {
						verrou.current = false
					})(evenement)
				}}
				className="flex flex-col gap-4"
			>
				{CHAMPS_DE_L_IDENTITE.map(champ => {
					const erreur = errors[champ]?.message
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`identite-${champ}`} className="font-medium text-sm">
								{LIBELLES_DE_L_IDENTITE[champ].libelle}
							</label>
							<input
								id={`identite-${champ}`}
								type="text"
								autoComplete="off"
								aria-invalid={erreur ? true : undefined}
								aria-describedby={erreur ? `identite-${champ}-erreur` : undefined}
								className={CHAMP}
								{...register(champ)}
							/>
							{erreur ? (
								<p id={`identite-${champ}-erreur`} className="text-red-800 text-sm">
									{erreur}
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
					disabled={enCours}
					className={`${BOUTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
				>
					{enCours ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</PanneauDEdition>
	)
}
