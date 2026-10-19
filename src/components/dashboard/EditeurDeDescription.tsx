'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
	compteurDeLaDescription,
	DESCRIPTION_MAX,
	DESCRIPTION_MIN,
	schemaDeLaDescription,
	type ValeursDeLaDescription,
} from '@/lib/dashboard/description'
import { mesurerLEnregistrement } from '@/lib/dashboard/mesure'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/dashboard/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDeLaDescription = (
	valeurs: ValeursDeLaDescription
) => Promise<ResultatDEnregistrement<ValeursDeLaDescription>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-64 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The button « Modifier » of the card of her description, and the panel it opens (ticket 122). Same
 * contract as her identity (ticket 119): the card changes only once the server has stored the text,
 * a failure keeps the old text and what she typed and says so (E31), two clicks send one request.
 *
 * Under the field, a counter shows how many characters count towards a publishable profile (200,
 * counted by the single definition of the profile, U05) and the room left of the 2 000 allowed. The
 * counter is read by the screen reader as the description of the field; the moment the threshold is
 * reached is announced once, not at every key.
 *
 * The send function is a property: the page gives the server action, a test gives a fake.
 */
export function EditeurDeDescription({
	valeurs,
	envoyer,
}: {
	valeurs: ValeursDeLaDescription
	envoyer: EnvoiDeLaDescription
}) {
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	const declencheur = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier ma description"
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
				<FormulaireDeDescription
					valeurs={valeurs}
					envoyer={envoyer}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Ta description est enregistrée.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDeDescription({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDeLaDescription
	envoyer: EnvoiDeLaDescription
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<ValeursDeLaDescription>({ resolver: zodResolver(schemaDeLaDescription), defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)
	const compteur = compteurDeLaDescription(watch('description') ?? '')
	const erreur = errors.description?.message

	async function enregistrer(saisie: ValeursDeLaDescription) {
		setEnCours(true)
		setMessage('')
		try {
			const resultat: ResultatDEnregistrement<ValeursDeLaDescription> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			mesurerLEnregistrement('description', resultat)
			if (resultat.ok) {
				onEnregistre()
				return
			}
			setMessage(resultat.message)
			if (resultat.champs?.description) setError('description', { message: resultat.champs.description })
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	return (
		<PanneauDEdition
			titre="Modifier ma description"
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
				<div className="flex flex-col gap-1">
					<label htmlFor="description-texte" className="font-medium text-sm">
						Ta description
					</label>
					<textarea
						id="description-texte"
						autoComplete="off"
						aria-invalid={erreur ? true : undefined}
						aria-describedby={`description-compteur${erreur ? ' description-erreur' : ''}`}
						className={CHAMP}
						{...register('description')}
					/>
					<p id="description-compteur" data-testid="compteur-description" className="text-neutral-700 text-sm">
						{compteur.compte} / {DESCRIPTION_MIN} caractères pour que ton profil soit publiable ({compteur.total} /{' '}
						{DESCRIPTION_MAX} au plus{compteur.total > DESCRIPTION_MAX ? ' : c’est trop long' : ''})
					</p>
					<p role="status" className="text-green-800 text-sm">
						{compteur.assez ? 'Ta description a la longueur qu’il faut pour être publiable.' : ''}
					</p>
					{erreur ? (
						<p id="description-erreur" className="text-red-800 text-sm">
							{erreur}
						</p>
					) : null}
				</div>
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
