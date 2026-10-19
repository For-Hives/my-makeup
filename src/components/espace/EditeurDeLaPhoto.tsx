'use client'

import { useEffect, useRef, useState } from 'react'
import { expiredSessionUrl } from '@/lib/auth/return-to'
import {
	envoyerPuisEnregistrer,
	type PhotoAEnvoyer,
	type ResultatDEnvoiDUnFichier,
	supprimerLeMedia,
	televerserLaPhoto,
} from '@/lib/espace/envoi-des-photos'
import { causeDuRefusLocal, mesurerLEnregistrement, mesurerUnRefusDePhoto } from '@/lib/espace/mesure'
import { ACCEPT, type PhotoPreparee } from '@/lib/espace/photo'
import { preparerPhotoNavigateur } from '@/lib/espace/photo-navigateur'
import type { ValeursDeLaPhoto } from '@/lib/espace/photo-principale'
import type { IdentifiantDePhoto, PhotoDeLEspace } from '@/lib/espace/photos'
import type { ResultatDEnregistrement } from '@/lib/espace/resultat'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDeLaPhoto = (saisie: {
	photoPrincipale: IdentifiantDePhoto
}) => Promise<ResultatDEnregistrement<ValeursDeLaPhoto>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const PAGE_DE_L_ESPACE = '/auth/profil'

/** The alternative text a main photo is stored with. */
export const ALT_PHOTO_PRINCIPALE = 'Photo principale'

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/** How a chosen file is shown before it is sent: a local address, or nothing where the browser has none. */
export function apercuLocal(fichier: Blob): string {
	try {
		return URL.createObjectURL(fichier)
	} catch {
		return ''
	}
}

/** Gives back a local address made by `apercuLocal`. */
export function libererApercu(adresse: string): void {
	try {
		if (adresse !== '') URL.revokeObjectURL(adresse)
	} catch {
		// Nothing to give back.
	}
}

interface Choisie extends PhotoAEnvoyer {
	apercu: string
}

/**
 * The button « Modifier » of the card « Photo principale », and the panel it opens (ticket 134).
 *
 * - She picks a file; it is checked and reduced in the browser (2 000 px, 1 Mo at most), and shown.
 *   A file that is not accepted is refused here, with the reason, before anything is sent (E36).
 * - Nothing is sent before « Enregistrer »: closing the panel leaves no object on the server.
 * - « Enregistrer » sends the reduced file, then names it as her main photo; the former one goes
 *   to the bin of the storage. A failure leaves the former photo, keeps what she chose, and says so.
 *   Whatever the failure, a file sent in the gesture is deleted again unless the outcome is unknown
 *   (`envoyerPuisEnregistrer`).
 * - The result is announced in a `role="status"` outside the panel.
 *
 * The browser work, the network and the server action are properties: a test gives fakes.
 */
export function EditeurDeLaPhoto({
	photo,
	envoyer,
	preparer = preparerPhotoNavigateur,
	televerser = (fichier, alt) => televerserLaPhoto(fichier, alt),
	supprimer = id => supprimerLeMedia(id),
}: {
	photo: PhotoDeLEspace | null
	envoyer: EnvoiDeLaPhoto
	preparer?: (fichier: File) => Promise<PhotoPreparee<File>>
	televerser?: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer?: (id: IdentifiantDePhoto) => Promise<unknown>
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
				aria-label="Modifier ma photo principale"
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
				<FormulaireDeLaPhoto
					photo={photo}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Ta photo principale est enregistrée.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDeLaPhoto({
	photo,
	envoyer,
	preparer,
	televerser,
	supprimer,
	retour,
	onEnregistre,
	onFermer,
}: {
	photo: PhotoDeLEspace | null
	envoyer: EnvoiDeLaPhoto
	preparer: (fichier: File) => Promise<PhotoPreparee<File>>
	televerser: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer: (id: IdentifiantDePhoto) => Promise<unknown>
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const [choisie, setChoisie] = useState<Choisie | null>(null)
	const [erreur, setErreur] = useState('')
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [enCours, setEnCours] = useState(false)
	const verrou = useRef(false)
	const apercuCourant = useRef('')

	// The local address is given back when the panel goes.
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
				mesurerUnRefusDePhoto(causeDuRefusLocal(prete))
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
			const issue = await envoyerPuisEnregistrer<ValeursDeLaPhoto>({
				photos: [choisie],
				televerser: async (fichier, alt) => {
					const envoi = await televerser(fichier, alt)
					// A session that ended is not a refusal of the photo.
					if (!envoi.ok && envoi.session !== 'expiree') mesurerUnRefusDePhoto(envoi.cause ?? 'server')
					return envoi
				},
				supprimer,
				enregistrer: async ids => {
					const [id] = ids
					const resultat = await envoyer({ photoPrincipale: id as IdentifiantDePhoto })
					// Only an answer of the server is a save; a lost call counts nothing.
					mesurerLEnregistrement('photo', resultat)
					return resultat
				},
				marquerEnvoyee: (_cle, id) => setChoisie(courante => (courante === null ? courante : { ...courante, id })),
			})
			if (issue.ok) {
				onEnregistre()
				return
			}
			setMessage(issue.champs?.photoPrincipale ?? issue.message)
			setSessionExpiree(issue.session === 'expiree')
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	const montree = choisie?.apercu || photo?.url || ''
	return (
		<PanneauDEdition
			titre="Modifier ma photo principale"
			enCours={enCours || preparation}
			modifie={choisie !== null}
			retour={retour}
			onFermer={onFermer}
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
					{montree ? (
						// biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer
						<img
							src={montree}
							alt={choisie ? 'Aperçu de la photo choisie' : 'Ta photo principale actuelle'}
							className="h-48 w-48 rounded-full object-cover"
						/>
					) : (
						<p className="text-neutral-600 italic">Tu n’as pas encore de photo principale.</p>
					)}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="photo-fichier" className="font-medium text-sm">
						{photo || choisie ? 'Choisir une autre photo' : 'Choisir une photo'}
					</label>
					<input
						id="photo-fichier"
						type="file"
						accept={ACCEPT}
						disabled={enCours}
						aria-describedby="photo-aide"
						onChange={evenement => {
							const fichier = evenement.target.files?.[0]
							// The same file can be picked again.
							evenement.target.value = ''
							if (fichier) void choisir(fichier)
						}}
						className="min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base"
					/>
					<p id="photo-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP. La photo est réduite avant l’envoi, et rien n’est envoyé avant « Enregistrer ».
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
									, puis reviens ici et enregistre à nouveau : ta photo est toujours là.
								</>
							) : null}
						</p>
					) : null}
				</div>
				<button
					type="submit"
					disabled={enCours || preparation || choisie === null}
					className={`${BOUTON} bg-neutral-900 text-white disabled:cursor-not-allowed disabled:opacity-60`}
				>
					{enCours ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</PanneauDEdition>
	)
}
