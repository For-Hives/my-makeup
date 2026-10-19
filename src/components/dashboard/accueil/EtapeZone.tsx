'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
	type CommuneProposee,
	MESSAGE_COMMUNE_A_CHOISIR,
	rayonDuTexte,
	schemaDuRayonSaisi,
	type ValeursDeLaLocalisation,
} from '@/lib/dashboard/localisation'
import { TITRES_DES_ETAPES } from '@/lib/dashboard/onboarding'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/dashboard/resultat'
import { BORNES_DU_RAYON_KM } from '@/lib/profil/zone'
import { ChampDeCommune, type RechercheDeCommunes } from '../ChampDeCommune'
import type { EnvoiDeLaLocalisation } from '../EditeurDeLocalisation'
import { BOUTON, BOUTON_PRINCIPAL, CadreDEtape, CHAMP, MessageDEchec } from './commun'

const schemaDuFormulaire = z.object({ rayon: schemaDuRayonSaisi, aDomicile: z.boolean() })
type ValeursDuFormulaire = z.infer<typeof schemaDuFormulaire>

/**
 * The second step: her zone (ticket 140). Her commune, chosen in the official list and sent as its
 * code only, her radius and « à domicile », as in the card of her space. « Précédent » goes back to
 * the identity, whose values are not lost. The next step opens once the server has stored the zone.
 */
export function EtapeZone({
	valeurs,
	envoyer,
	chercher,
	titre,
	surFait,
	retour,
}: {
	valeurs: ValeursDeLaLocalisation
	envoyer: EnvoiDeLaLocalisation
	chercher: RechercheDeCommunes
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: ValeursDeLaLocalisation) => void
	retour: () => void
}) {
	const identifiant = useId()
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<ValeursDuFormulaire>({
		resolver: zodResolver(schemaDuFormulaire),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	const [choisie, setChoisie] = useState<CommuneProposee | null>(
		valeurs.codeInsee === '' ? null : { codeInsee: valeurs.codeInsee, libelle: valeurs.libelle }
	)
	const [erreurCommune, setErreurCommune] = useState('')
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const verrou = useRef(false)

	async function enregistrer(saisie: ValeursDuFormulaire, commune: CommuneProposee) {
		setEnCours(true)
		setMessage('')
		setSessionExpiree(false)
		try {
			const resultat = await envoyer({
				codeInsee: commune.codeInsee,
				rayonKm: rayonDuTexte(saisie.rayon),
				aDomicile: saisie.aDomicile,
			}).catch((): ResultatDEnregistrement<ValeursDeLaLocalisation> => ({ ok: false, message: MESSAGE_ECHEC }))
			if (resultat.ok) {
				surFait(resultat.valeurs)
				return
			}
			setSessionExpiree(resultat.session === 'expiree')
			setMessage(resultat.message)
			if (resultat.champs?.codeInsee) setErreurCommune(resultat.champs.codeInsee)
			if (resultat.champs?.rayonKm) setError('rayon', { message: resultat.champs.rayonKm })
			if (resultat.champs?.aDomicile) setError('aDomicile', { message: resultat.champs.aDomicile })
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	const erreurRayon = errors.rayon?.message
	return (
		<CadreDEtape
			titre={TITRES_DES_ETAPES[2]}
			explication="Dis-nous où tu travailles : seule ta commune apparaît sur ta page, jamais ton adresse."
			reference={titre}
		>
			<form
				noValidate
				aria-busy={enCours}
				onSubmit={evenement => {
					evenement.preventDefault()
					if (verrou.current) return
					verrou.current = true
					const commune = choisie
					setErreurCommune(commune === null ? MESSAGE_COMMUNE_A_CHOISIR : '')
					void handleSubmit(
						saisie => {
							// Without a commune chosen in the list, nothing is sent.
							if (commune === null) {
								verrou.current = false
								return undefined
							}
							return enregistrer(saisie, commune)
						},
						() => {
							verrou.current = false
						}
					)(evenement)
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-1">
					<label htmlFor={`${identifiant}-commune`} className="font-medium text-sm">
						Ta commune
					</label>
					<ChampDeCommune
						id={`${identifiant}-commune`}
						idErreur={`${identifiant}-commune-erreur`}
						libelleInitial={valeurs.libelle}
						chercher={chercher}
						erreur={erreurCommune}
						onChoisir={commune => {
							setChoisie(commune)
							if (commune !== null) setErreurCommune('')
						}}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor={`${identifiant}-rayon`} className="font-medium text-sm">
						Rayon d’action (en km) <span className="font-normal text-neutral-600">(facultatif)</span>
					</label>
					<input
						id={`${identifiant}-rayon`}
						type="text"
						inputMode="numeric"
						autoComplete="off"
						aria-invalid={erreurRayon ? true : undefined}
						aria-describedby={`${identifiant}-rayon-aide${erreurRayon ? ` ${identifiant}-rayon-erreur` : ''}`}
						className={`${CHAMP} w-32`}
						{...register('rayon')}
					/>
					<p id={`${identifiant}-rayon-aide`} className="text-neutral-700 text-sm">
						De {BORNES_DU_RAYON_KM.min} à {BORNES_DU_RAYON_KM.max} km, en kilomètres entiers.
					</p>
					{erreurRayon ? (
						<p id={`${identifiant}-rayon-erreur`} className="text-red-800 text-sm">
							{erreurRayon}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-3">
					<input
						id={`${identifiant}-domicile`}
						type="checkbox"
						className="size-6 shrink-0 accent-neutral-900"
						{...register('aDomicile')}
					/>
					<label htmlFor={`${identifiant}-domicile`} className="min-h-11 flex-1 content-center font-medium text-sm">
						Je me déplace à domicile
					</label>
				</div>
				<MessageDEchec message={message} sessionExpiree={sessionExpiree} />
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						disabled={enCours}
						onClick={retour}
						className={`${BOUTON} border border-neutral-400 bg-white disabled:opacity-60`}
					>
						Précédent
					</button>
					<button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
						{enCours ? 'Enregistrement…' : 'Suivant'}
					</button>
				</div>
			</form>
		</CadreDEtape>
	)
}
