'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { expiredSessionUrl } from '@/lib/auth/return-to'
import {
	CHAMPS_DE_L_IDENTITE,
	LIBELLES_DE_L_IDENTITE,
	schemaDeLIdentite,
	type ValeursDeLIdentite,
} from '@/lib/dashboard/identity'
import { mesurerLEnregistrement } from '@/lib/dashboard/analytics'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/dashboard/result'
import {
	garderLaSaisie,
	lireLaSaisie,
	oublierLaSaisie,
	peutRediriger,
	type SaisieGardee,
	type Stockage,
	stockageDeLOnglet,
} from '@/lib/dashboard/guarded-input'
import { PanneauDEdition } from './EditingPanel'

export type EnvoiDeLIdentite = (valeurs: ValeursDeLIdentite) => Promise<ResultatDEnregistrement<ValeursDeLIdentite>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const PAGE_DE_L_ESPACE = '/auth/profil'

const aller = (url: string): void => window.location.assign(url)

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
 * - The session ends while she types (ticket 121, E32): the save fails with nothing stored, what she
 *   typed is kept in the tab (`saisie-gardee.ts`), she is sent once to the sign-in page, and back
 *   on her space the same panel opens again with her typing. The draft is forgotten after a save
 *   or when she abandons. A second « expired » right after the redirection does not send her
 *   away again: the message stays in the panel.
 *
 * The send function is a property: the page gives the server action, a test gives a fake. So are
 * `proprietaire` (whose draft it is: another account on this browser never sees it), and the
 * storage and the navigation, which a test replaces.
 */
export function EditeurDIdentite({
	valeurs,
	envoyer,
	proprietaire,
	stockage = stockageDeLOnglet,
	naviguer = aller,
}: {
	valeurs: ValeursDeLIdentite
	envoyer: EnvoiDeLIdentite
	proprietaire: string
	stockage?: () => Stockage | null
	naviguer?: (url: string) => void
}) {
	const [ouvert, setOuvert] = useState(false)
	const [annonce, setAnnonce] = useState('')
	const [retrouvee, setRetrouvee] = useState<Record<keyof ValeursDeLIdentite, string> | null>(null)
	const declencheur = useRef<HTMLButtonElement>(null)

	// Back from the sign-in page: the typing kept before the redirection opens the panel again.
	useEffect(() => {
		const gardee = lireLaSaisie(stockage(), 'identite', proprietaire, CHAMPS_DE_L_IDENTITE, Date.now())
		if (gardee === null) return
		if (CHAMPS_DE_L_IDENTITE.every(champ => gardee.valeurs[champ] === valeurs[champ])) {
			oublierLaSaisie(stockage(), 'identite', proprietaire)
			return
		}
		setRetrouvee(gardee.valeurs)
		setOuvert(true)
	}, [proprietaire, stockage, valeurs])

	return (
		<>
			<button
				ref={declencheur}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mon identité"
				onClick={() => {
					setAnnonce('')
					setRetrouvee(null)
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
					retrouvee={retrouvee}
					envoyer={envoyer}
					proprietaire={proprietaire}
					stockage={stockage}
					naviguer={naviguer}
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
	retrouvee,
	envoyer,
	proprietaire,
	stockage,
	naviguer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ValeursDeLIdentite
	retrouvee: ValeursDeLIdentite | null
	envoyer: EnvoiDeLIdentite
	proprietaire: string
	stockage: () => Stockage | null
	naviguer: (url: string) => void
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		setValue,
		getValues,
		formState: { errors, isDirty },
	} = useForm<ValeursDeLIdentite>({ resolver: zodResolver(schemaDeLIdentite), defaultValues: valeurs })
	const [enCours, setEnCours] = useState(false)
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const verrou = useRef(false)

	// The typing kept before the redirection comes back into the fields, as changes still to save.
	useEffect(() => {
		if (retrouvee === null) return
		for (const champ of CHAMPS_DE_L_IDENTITE) setValue(champ, retrouvee[champ], { shouldDirty: true })
	}, [retrouvee, setValue])

	const fermer = () => {
		oublierLaSaisie(stockage(), 'identite', proprietaire)
		onFermer()
	}

	async function enregistrer(saisie: ValeursDeLIdentite) {
		setEnCours(true)
		setMessage('')
		setSessionExpiree(false)
		let partie = false
		try {
			const resultat: ResultatDEnregistrement<ValeursDeLIdentite> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: MESSAGE_ECHEC,
			}))
			mesurerLEnregistrement('identite', resultat)
			if (resultat.ok) {
				oublierLaSaisie(stockage(), 'identite', proprietaire)
				onEnregistre()
				return
			}
			if (resultat.session === 'expiree') {
				// Nothing was stored. Keep the typing, then send her to sign in: once, never in a loop.
				const maintenant = Date.now()
				const avant = lireLaSaisie(stockage(), 'identite', proprietaire, CHAMPS_DE_L_IDENTITE, maintenant)
				const redirige = peutRediriger(avant, maintenant)
				const gardee: SaisieGardee<ValeursDeLIdentite> = {
					valeurs: getValues(),
					le: maintenant,
					redirigeLe: redirige ? maintenant : (avant?.redirigeLe ?? null),
				}
				const gardeeAvecSucces = garderLaSaisie(stockage(), 'identite', proprietaire, gardee)
				if (redirige && gardeeAvecSucces) {
					partie = true
					naviguer(expiredSessionUrl(PAGE_DE_L_ESPACE))
					return
				}
				setSessionExpiree(true)
				setMessage(MESSAGE_SESSION)
				return
			}
			setMessage(resultat.message)
			for (const champ of CHAMPS_DE_L_IDENTITE) {
				const texte = resultat.champs?.[champ]
				if (texte) setError(champ, { message: texte })
			}
		} finally {
			// Leaving for the sign-in page: the form stays locked until the page goes.
			if (!partie) {
				verrou.current = false
				setEnCours(false)
			}
		}
	}

	return (
		<PanneauDEdition
			titre="Modifier mon identité"
			enCours={enCours}
			modifie={isDirty}
			retour={retour}
			onFermer={fermer}
		>
			{retrouvee !== null ? (
				<p role="status" className="mb-4 rounded-md bg-neutral-100 p-3 text-sm">
					Tu t’es reconnectée : on a retrouvé ce que tu avais saisi. Vérifie-le, puis enregistre.
				</p>
			) : null}
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
					{message ? (
						<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
							{message}
							{sessionExpiree ? (
								<>
									{' '}
									<a
										className="font-medium underline"
										href={expiredSessionUrl(PAGE_DE_L_ESPACE)}
										target="_blank"
										rel="noopener"
									>
										Te reconnecter (nouvel onglet)
									</a>
									, puis reviens ici et enregistre à nouveau : ta saisie est toujours là.
								</>
							) : null}
						</p>
					) : null}
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
