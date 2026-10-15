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
} from '@/lib/espace/localisation'
import { mesurerLEnregistrement } from '@/lib/espace/mesure'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/espace/resultat'
import { BORNES_DU_RAYON_KM } from '@/lib/profil/zone'
import { ChampDeCommune, type RechercheDeCommunes } from './ChampDeCommune'
import { PanneauDEdition } from './PanneauDEdition'

/** What is sent: the code of the commune she chose, the radius, « à domicile ». Never a name. */
export type SaisieDeLaLocalisation = { codeInsee: string; rayonKm: number | null; aDomicile: boolean }

export type EnvoiDeLaLocalisation = (
	saisie: SaisieDeLaLocalisation
) => Promise<ResultatDEnregistrement<ValeursDeLaLocalisation>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

const schemaDuFormulaire = z.object({ rayon: schemaDuRayonSaisi, aDomicile: z.boolean() })
type ValeursDuFormulaire = z.infer<typeof schemaDuFormulaire>

/**
 * The button « Modifier » of the card of her location, and the panel it opens (ticket 123): her
 * commune, chosen in the official list, her radius (0 to 200 km) and « à domicile ». Same contract as
 * the identity (ticket 119): the card changes once the server has answered, a failure keeps the old
 * value and says so, two clicks send one request, the result is announced outside the panel.
 *
 * - The commune is sent as its INSEE code and nothing else. Without a commune chosen in the list,
 *   nothing is sent and the field says so.
 * - The radius out of bounds, or not a whole number, is refused under the field, nothing sent.
 *
 * The functions that send and that search are properties: the page gives the server actions, a test
 * gives fakes.
 */
export function EditeurDeLocalisation({
	valeurs,
	envoyer,
	chercher,
}: {
	valeurs: ValeursDeLaLocalisation
	envoyer: EnvoiDeLaLocalisation
	chercher: RechercheDeCommunes
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
				aria-label="Modifier ma localisation"
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
				<FormulaireDeLocalisation
					valeurs={valeurs}
					envoyer={envoyer}
					chercher={chercher}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Ta localisation est enregistrée.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDeLocalisation({
	valeurs,
	envoyer,
	chercher,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDeLaLocalisation
	envoyer: EnvoiDeLaLocalisation
	chercher: RechercheDeCommunes
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const identifiant = useId()
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<ValeursDuFormulaire>({
		resolver: zodResolver(schemaDuFormulaire),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	// The commune chosen: the one stored at first, then the one she picks; null once she types again.
	const [choisie, setChoisie] = useState<CommuneProposee | null>(
		valeurs.codeInsee === '' ? null : { codeInsee: valeurs.codeInsee, libelle: valeurs.libelle }
	)
	const [erreurCommune, setErreurCommune] = useState('')
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)
	const communeModifiee = (choisie?.codeInsee ?? '') !== valeurs.codeInsee

	async function enregistrer(saisie: ValeursDuFormulaire, commune: CommuneProposee) {
		setEnCours(true)
		setMessage('')
		try {
			const resultat = await envoyer({
				codeInsee: commune.codeInsee,
				rayonKm: rayonDuTexte(saisie.rayon),
				aDomicile: saisie.aDomicile,
			}).catch((): ResultatDEnregistrement<ValeursDeLaLocalisation> => ({ ok: false, message: MESSAGE_ECHEC }))
			mesurerLEnregistrement('localisation', resultat)
			if (resultat.ok) {
				onEnregistre()
				return
			}
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
		<PanneauDEdition
			titre="Modifier ma localisation"
			enCours={enCours}
			modifie={isDirty || communeModifiee}
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
					const commune = choisie
					setErreurCommune(commune === null ? MESSAGE_COMMUNE_A_CHOISIR : '')
					void handleSubmit(
						saisie => {
							// Without a commune chosen, nothing is sent.
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
						Rayon d’action (en km)
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
						De {BORNES_DU_RAYON_KM.min} à {BORNES_DU_RAYON_KM.max} km, en kilomètres entiers. Tu peux laisser vide.
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
