'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
	CHAMPS_DES_COORDONNEES,
	type CoordonneesEnregistrees,
	schemaDesCoordonnees,
	type ValeursDesCoordonnees,
} from '@/lib/dashboard/contact-details'
import { mesurerLEnregistrement } from '@/lib/dashboard/analytics'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/dashboard/result'
import { PanneauDEdition } from './EditingPanel'

export type EnvoiDesCoordonnees = (
	valeurs: ValeursDesCoordonnees
) => Promise<ResultatDEnregistrement<CoordonneesEnregistrees>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The button « Modifier » of the card of her contact details, and the panel it opens (ticket 126).
 * Same contract as the identity: bounds under the field with nothing sent (U28, E30), a failure
 * that keeps the old value and what she typed (E31), one request for two clicks, a result
 * announced outside of the panel.
 *
 * The choice « afficher sur mon profil » is hers: the panel says what it means, and the server
 * dates it. The card shows the date once the page is read again.
 */
export function EditeurDeCoordonnees({
	valeurs,
	envoyer,
}: {
	valeurs: ValeursDesCoordonnees
	envoyer: EnvoiDesCoordonnees
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
				aria-label="Modifier mes coordonnées"
				onClick={() => {
					setAnnonce('')
					setOuvert(true)
				}}
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
				<FormulaireDeCoordonnees
					valeurs={valeurs}
					envoyer={envoyer}
					retour={declencheur}
					onEnregistre={affichees => {
						setAnnonce(
							affichees
								? 'Tes coordonnées sont enregistrées : elles s’affichent sur ton profil.'
								: 'Tes coordonnées sont enregistrées : elles ne s’affichent pas sur ton profil.'
						)
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDeCoordonnees({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDesCoordonnees
	envoyer: EnvoiDesCoordonnees
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: (affichees: boolean) => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<ValeursDesCoordonnees>({ resolver: zodResolver(schemaDesCoordonnees), defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)

	async function enregistrer(saisie: ValeursDesCoordonnees) {
		setEnCours(true)
		setMessage('')
		try {
			const resultat: ResultatDEnregistrement<CoordonneesEnregistrees> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			mesurerLEnregistrement('coordonnees', resultat)
			if (resultat.ok) {
				onEnregistre(resultat.valeurs.contactPublic)
				return
			}
			setMessage(resultat.message)
			for (const champ of CHAMPS_DES_COORDONNEES) {
				const texte = resultat.champs?.[champ]
				if (texte) setError(champ, { message: texte })
			}
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	const erreurTelephone = errors.telephone?.message
	const erreurEmail = errors.email?.message
	const erreurChoix = errors.contactPublic?.message

	return (
		<PanneauDEdition
			titre="Modifier mes coordonnées"
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
					<label htmlFor="coordonnees-telephone" className="font-medium text-sm">
						Téléphone
					</label>
					<input
						id="coordonnees-telephone"
						type="tel"
						autoComplete="off"
						aria-invalid={erreurTelephone ? true : undefined}
						aria-describedby={erreurTelephone ? 'coordonnees-telephone-erreur' : undefined}
						className={CHAMP}
						{...register('telephone')}
					/>
					{erreurTelephone ? (
						<p id="coordonnees-telephone-erreur" className="text-red-800 text-sm">
							{erreurTelephone}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="coordonnees-email" className="font-medium text-sm">
						Email de contact
					</label>
					<input
						id="coordonnees-email"
						type="email"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						aria-invalid={erreurEmail ? true : undefined}
						aria-describedby={erreurEmail ? 'coordonnees-email-erreur' : undefined}
						className={CHAMP}
						{...register('email')}
					/>
					{erreurEmail ? (
						<p id="coordonnees-email-erreur" className="text-red-800 text-sm">
							{erreurEmail}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="coordonnees-affichage" className="flex min-h-11 items-start gap-3 text-sm">
						<input
							id="coordonnees-affichage"
							type="checkbox"
							aria-describedby="coordonnees-affichage-aide"
							className="mt-1 size-5 shrink-0"
							{...register('contactPublic')}
						/>
						<span className="font-medium">Afficher mon téléphone et mon email sur mon profil</span>
					</label>
					<p id="coordonnees-affichage-aide" className="text-neutral-700 text-sm">
						Décoché, personne ne les voit : ils restent à toi. Coché, tout le monde peut les lire sur ta page. La date
						de ton choix est gardée, et tu peux le changer quand tu veux.
					</p>
					{erreurChoix ? <p className="text-red-800 text-sm">{erreurChoix}</p> : null}
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
