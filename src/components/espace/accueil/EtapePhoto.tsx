'use client'

import { useEffect, useRef, useState } from 'react'
import type { ValeursDeLaPhotoDAccueil } from '@/lib/espace/enregistrer-accueil'
import {
	envoyerPuisEnregistrer,
	type PhotoAEnvoyer,
	type ResultatDEnvoiDUnFichier,
	supprimerLeMedia,
	televerserLaPhoto,
} from '@/lib/espace/envoi-des-photos'
import { TITRES_DES_ETAPES } from '@/lib/espace/onboarding'
import { ACCEPT, type PhotoPreparee } from '@/lib/espace/photo'
import { preparerPhotoNavigateur } from '@/lib/espace/photo-navigateur'
import type { IdentifiantDePhoto } from '@/lib/espace/photos'
import type { ResultatDEnregistrement } from '@/lib/espace/resultat'
import { ALT_PHOTO_PRINCIPALE, apercuLocal, libererApercu } from '../EditeurDeLaPhoto'
import { BOUTON, BOUTON_PRINCIPAL, CadreDEtape, CHAMP, MessageDEchec } from './commun'

export type EnvoiDeLaPhotoDAccueil = (saisie: {
	photoPrincipale: IdentifiantDePhoto
}) => Promise<ResultatDEnregistrement<ValeursDeLaPhotoDAccueil>>

/** The alternative text of the preview (a constant: the rule on `alt` reads literals only). */
const ALT_DE_L_APERCU = 'Aperçu de la photo choisie'

interface Choisie extends PhotoAEnvoyer {
	apercu: string
}

/**
 * The third step: her main photo (ticket 140), on the contract of the card of her space (ticket
 * 134): the file is checked and reduced in the browser, nothing leaves before « Terminer », a failure
 * keeps the photo she chose and says so, and a file sent in a gesture that fails is deleted again.
 * Nothing is claimed here: the step gives the server's answer to its parent, which sends her to her
 * space only if the server reports the three steps done.
 */
export function EtapePhoto({
	envoyer,
	preparer = preparerPhotoNavigateur,
	televerser = (fichier, alt) => televerserLaPhoto(fichier, alt),
	supprimer = id => supprimerLeMedia(id),
	titre,
	surFait,
	retour,
}: {
	envoyer: EnvoiDeLaPhotoDAccueil
	preparer?: (fichier: File) => Promise<PhotoPreparee<File>>
	televerser?: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer?: (id: IdentifiantDePhoto) => Promise<unknown>
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: ValeursDeLaPhotoDAccueil) => void
	retour: () => void
}) {
	const [choisie, setChoisie] = useState<Choisie | null>(null)
	const [erreur, setErreur] = useState('')
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [enCours, setEnCours] = useState(false)
	const verrou = useRef(false)
	const apercuCourant = useRef('')

	// The local address is given back when the step goes.
	useEffect(
		() => () => {
			libererApercu(apercuCourant.current)
		},
		[]
	)

	async function choisir(fichier: File) {
		setErreur('')
		setMessage('')
		setPreparation(true)
		try {
			const prete = await preparer(fichier)
			if (!prete.ok) {
				setErreur(prete.message)
				return
			}
			libererApercu(apercuCourant.current)
			const apercu = apercuLocal(prete.fichier)
			apercuCourant.current = apercu
			setChoisie({ cle: 'photo', fichier: prete.fichier, alt: ALT_PHOTO_PRINCIPALE, apercu })
		} finally {
			setPreparation(false)
		}
	}

	async function enregistrer() {
		if (choisie === null || verrou.current) return
		verrou.current = true
		setEnCours(true)
		setMessage('')
		setSessionExpiree(false)
		try {
			const issue = await envoyerPuisEnregistrer<ValeursDeLaPhotoDAccueil>({
				photos: [choisie],
				televerser,
				supprimer,
				enregistrer: ids => {
					const [id] = ids
					return envoyer({ photoPrincipale: id as IdentifiantDePhoto })
				},
				marquerEnvoyee: (_cle, id) => setChoisie(courante => (courante === null ? courante : { ...courante, id })),
			})
			if (issue.ok) {
				surFait(issue.valeurs)
				return
			}
			setMessage(issue.champs?.photoPrincipale ?? issue.message)
			setSessionExpiree(issue.session === 'expiree')
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	return (
		<CadreDEtape
			titre={TITRES_DES_ETAPES[3]}
			explication="Une photo de toi ou de ton travail : c’est la première chose que voient les clientes."
			reference={titre}
		>
			<form
				noValidate
				aria-busy={enCours}
				onSubmit={evenement => {
					evenement.preventDefault()
					void enregistrer()
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex justify-center">
					{choisie?.apercu ? (
						// biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer
						<img src={choisie.apercu} alt={ALT_DE_L_APERCU} className="h-48 w-48 rounded-full object-cover" />
					) : (
						<p className="text-neutral-600 italic">Tu n’as pas encore choisi de photo.</p>
					)}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="accueil-photo-fichier" className="font-medium text-sm">
						{choisie ? 'Choisir une autre photo' : 'Choisir une photo'}
					</label>
					<input
						id="accueil-photo-fichier"
						type="file"
						accept={ACCEPT}
						disabled={enCours}
						aria-describedby="accueil-photo-aide"
						onChange={evenement => {
							const fichier = evenement.target.files?.[0]
							// The same file can be picked again.
							evenement.target.value = ''
							if (fichier) void choisir(fichier)
						}}
						className={CHAMP}
					/>
					<p id="accueil-photo-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP. La photo est réduite avant l’envoi, et rien n’est envoyé avant « Terminer ».
					</p>
					{preparation ? (
						<p role="status" className="text-sm">
							Préparation de la photo…
						</p>
					) : null}
					{erreur ? (
						<p role="alert" className="text-red-800 text-sm">
							{erreur}
						</p>
					) : null}
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
					<button
						type="submit"
						disabled={enCours || preparation || choisie === null}
						className={`${BOUTON_PRINCIPAL} disabled:cursor-not-allowed`}
					>
						{enCours ? 'Enregistrement…' : 'Terminer'}
					</button>
				</div>
			</form>
		</CadreDEtape>
	)
}
