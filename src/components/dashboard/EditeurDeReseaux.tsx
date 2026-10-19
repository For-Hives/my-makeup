'use client'

import { useRef, useState } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { mesurerLEnregistrement } from '@/lib/dashboard/mesure'
import {
	CHAMPS_DES_RESEAUX,
	type ChampDeReseau,
	lireLesReseaux,
	RESEAUX,
	type ValeursDesReseaux,
} from '@/lib/dashboard/reseaux'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from '@/lib/dashboard/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDesReseaux = (valeurs: ValeursDesReseaux) => Promise<ResultatDEnregistrement<ValeursDesReseaux>>

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const CHAMP = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The form reads what she typed by the rule of the server (`lireLesReseaux`): « @pseudo » becomes
 * the address, an address of another site is refused under its field, and nothing is sent while a
 * field is refused (E30). The values the form sends are the normalised ones.
 */
const resolveur: Resolver<ValeursDesReseaux> = values => {
	const lue = lireLesReseaux(values)
	if (lue.ok) return { values: lue.valeurs, errors: {} }
	return {
		values: {},
		errors: Object.fromEntries(
			CHAMPS_DES_RESEAUX.flatMap(champ => {
				const message = lue.champs[champ]
				return message === undefined ? [] : [[champ, { type: 'validate', message }]]
			})
		),
	}
}

/**
 * The button « Modifier » of the card of her networks, and the panel it opens (ticket 125). Same
 * contract as the identity (src/components/espace/EditeurDIdentite.tsx): the card shows only what
 * the database stored; a failure keeps the old value and what she typed, and says so (E31); one
 * request for two clicks; the result is announced outside of the panel.
 *
 * Emptying a field removes the network. A network is a channel of contact: the panel says so.
 */
export function EditeurDeReseaux({ valeurs, envoyer }: { valeurs: ValeursDesReseaux; envoyer: EnvoiDesReseaux }) {
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	const declencheur = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mes réseaux"
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
				<FormulaireDeReseaux
					valeurs={valeurs}
					envoyer={envoyer}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Tes réseaux sont enregistrés.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDeReseaux({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDesReseaux
	envoyer: EnvoiDesReseaux
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<ValeursDesReseaux>({ resolver: resolveur, defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const verrou = useRef(false)

	async function enregistrer(saisie: ValeursDesReseaux) {
		setEnCours(true)
		setMessage('')
		try {
			const resultat: ResultatDEnregistrement<ValeursDesReseaux> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			mesurerLEnregistrement('reseaux', resultat)
			if (resultat.ok) {
				onEnregistre()
				return
			}
			setMessage(resultat.message)
			for (const champ of CHAMPS_DES_RESEAUX) {
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
			titre="Modifier mes réseaux"
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
				<p className="text-neutral-700 text-sm">
					Écris ton @pseudo ou colle l’adresse de ta page. Un champ vide retire le réseau. Un réseau ou un site compte
					comme un moyen de te contacter.
				</p>
				{CHAMPS_DES_RESEAUX.map((champ: ChampDeReseau) => {
					const erreur = errors[champ]?.message
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`reseaux-${champ}`} className="font-medium text-sm">
								{RESEAUX[champ].libelle}
							</label>
							<input
								id={`reseaux-${champ}`}
								type="text"
								inputMode={champ === 'siteWeb' ? 'url' : 'text'}
								autoComplete="off"
								autoCapitalize="none"
								spellCheck={false}
								placeholder={RESEAUX[champ].exemple}
								aria-invalid={erreur ? true : undefined}
								aria-describedby={erreur ? `reseaux-${champ}-erreur` : undefined}
								className={CHAMP}
								{...register(champ)}
							/>
							{erreur ? (
								<p id={`reseaux-${champ}-erreur`} className="text-red-800 text-sm">
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
