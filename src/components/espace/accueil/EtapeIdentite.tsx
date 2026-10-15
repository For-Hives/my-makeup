'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { CHAMPS_DE_L_IDENTITE, LIBELLES_DE_L_IDENTITE, type ValeursDeLIdentite } from '@/lib/espace/identite'
import {
	LIBELLES_DES_ORIGINES,
	ORIGINES_DECLAREES,
	schemaDeLIdentiteDAccueil,
	TITRES_DES_ETAPES,
} from '@/lib/espace/onboarding'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import type { EnvoiDeLIdentite } from '../EditeurDIdentite'
import { BOUTON_PRINCIPAL, CadreDEtape, CHAMP, MessageDEchec } from './commun'

export type Origine = (typeof ORIGINES_DECLAREES)[number]

/**
 * « Comment as-tu connu My Makeup ? » (decision UI-05): one optional answer. It is kept out of the
 * form, of the schema and of every request: nothing about it is stored. The parent counts it (ticket 148) as the
 * `onboarding_source` event once the identity is stored, and nowhere else.
 */
function QuestionDOrigine({ origine, choisir }: { origine: Origine | null; choisir: (o: Origine | null) => void }) {
	const premiere = useRef<HTMLInputElement>(null)
	return (
		<fieldset aria-describedby="accueil-origine-aide" className="flex flex-col gap-1">
			<legend className="font-medium text-sm">
				Comment as-tu connu My&nbsp;Makeup&nbsp;? <span className="font-normal text-neutral-600">(facultatif)</span>
			</legend>
			<p id="accueil-origine-aide" className="text-neutral-700 text-sm">
				Ta réponse sert seulement à nos statistiques : elle n’est enregistrée ni dans ton compte ni dans ton profil.
			</p>
			<div className="mt-1 flex flex-col">
				{ORIGINES_DECLAREES.map((valeur, rang) => (
					<label
						key={valeur}
						htmlFor={`accueil-origine-${valeur}`}
						className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm"
					>
						<input
							ref={rang === 0 ? premiere : undefined}
							id={`accueil-origine-${valeur}`}
							type="radio"
							name="origine"
							value={valeur}
							checked={origine === valeur}
							onChange={() => choisir(valeur)}
							className="size-5 shrink-0 accent-neutral-900"
						/>
						{LIBELLES_DES_ORIGINES[valeur]}
					</label>
				))}
			</div>
			{origine !== null ? (
				<button
					type="button"
					onClick={() => {
						choisir(null)
						premiere.current?.focus()
					}}
					className="min-h-11 w-fit px-2 text-sm underline"
				>
					Effacer ma réponse
				</button>
			) : null}
		</fieldset>
	)
}

/**
 * The first step: her identity (ticket 140). The same fields as the card of her space, with the
 * speciality required. The next step opens only once the server has answered that it stored them; a
 * failure keeps what she typed and says so. Two clicks, or Enter held, send one request.
 */
export function EtapeIdentite({
	valeurs,
	envoyer,
	origine,
	choisirOrigine,
	titre,
	surFait,
}: {
	valeurs: ValeursDeLIdentite
	envoyer: EnvoiDeLIdentite
	origine: Origine | null
	choisirOrigine: (origine: Origine | null) => void
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: ValeursDeLIdentite) => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<ValeursDeLIdentite>({ resolver: zodResolver(schemaDeLIdentiteDAccueil), defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const verrou = useRef(false)

	async function enregistrer(saisie: ValeursDeLIdentite) {
		setEnCours(true)
		setMessage('')
		setSessionExpiree(false)
		try {
			const resultat: ResultatDEnregistrement<ValeursDeLIdentite> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			if (resultat.ok) {
				surFait(resultat.valeurs)
				return
			}
			setSessionExpiree(resultat.session === 'expiree')
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
		<CadreDEtape
			titre={TITRES_DES_ETAPES[1]}
			explication="Ton prénom, ton nom et ta spécialité seront visibles sur ta page."
			reference={titre}
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
					const facultatif = champ === 'nomArtiste'
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`accueil-${champ}`} className="font-medium text-sm">
								{LIBELLES_DE_L_IDENTITE[champ].libelle}
								{facultatif ? <span className="font-normal text-neutral-600"> (facultatif)</span> : null}
							</label>
							<input
								id={`accueil-${champ}`}
								type="text"
								autoComplete="off"
								aria-invalid={erreur ? true : undefined}
								aria-describedby={erreur ? `accueil-${champ}-erreur` : undefined}
								className={CHAMP}
								{...register(champ)}
							/>
							{erreur ? (
								<p id={`accueil-${champ}-erreur`} className="text-red-800 text-sm">
									{erreur}
								</p>
							) : null}
						</div>
					)
				})}
				<QuestionDOrigine origine={origine} choisir={choisirOrigine} />
				<MessageDEchec message={message} sessionExpiree={sessionExpiree} />
				<button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
					{enCours ? 'Enregistrement…' : 'Suivant'}
				</button>
			</form>
		</CadreDEtape>
	)
}
