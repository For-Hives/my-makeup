'use client'

import { useEffect, useRef, useState } from 'react'
import { urlSessionExpiree } from '@/lib/auth/retour'
import {
	envoyerPuisEnregistrer,
	type PhotoAEnvoyer,
	type ResultatDEnvoiDUnFichier,
	supprimerLeMedia,
	televerserLaPhoto,
} from '@/lib/espace/envoi-des-photos'
import { ACCEPT, MESSAGES_PHOTO, type PhotoPreparee } from '@/lib/espace/photo'
import { preparerPhotoNavigateur } from '@/lib/espace/photo-navigateur'
import type { IdentifiantDePhoto, PhotoDeLEspace } from '@/lib/espace/photos'
import type { ValeursDuPortfolio } from '@/lib/espace/portfolio'
import type { ResultatDEnregistrement } from '@/lib/espace/resultat'
import { GALERIE_MAX } from '@/lib/medias'
import { apercuLocal, libererApercu } from './EditeurDeLaPhoto'
import { PanneauDEdition } from './PanneauDEdition'

export type EnvoiDuPortfolio = (saisie: {
	galerie: IdentifiantDePhoto[]
}) => Promise<ResultatDEnregistrement<ValeursDuPortfolio>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const PAGE_DE_L_ESPACE = '/auth/profil'

/** The alternative text a portfolio photo is stored with. */
export const ALT_PORTFOLIO = 'Photo du portfolio'

const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/**
 * One line of the list. `cle` is its own and never changes (L1): it comes from a counter, never
 * from the content, so that two photos that look alike stay two lines. A photo already in the
 * portfolio has its `id`; a photo chosen in this panel has its reduced `fichier` and a local
 * `apercu`, until « Enregistrer » sends it.
 */
interface Ligne extends PhotoAEnvoyer {
	url: string
	apercu: string
	enAttente: boolean
	/** The file she picked, to refuse the same one twice. */
	signature: string
}

const signatureDe = (fichier: File): string => `${fichier.name}|${fichier.size}|${fichier.lastModified}`

/** « Photo 2 sur 3 de ton portfolio »: the text of a photo for a screen reader, whatever its stored text. */
export const texteAlternatif = (rang: number, total: number): string => `Photo ${rang} sur ${total} de ton portfolio`

/**
 * The button « Modifier » of the card « Portfolio », and the panel it opens (tickets 135 and 136).
 *
 * - She picks several files at once. Each one is checked and reduced in the browser; one that is
 *   not accepted is set aside with its reason, without losing the others (E36). Ten photos at most:
 *   the eleventh is refused (U80). The same file picked twice is refused (rule L6).
 * - Nothing is sent before « Enregistrer »: closing the panel leaves no object (E34).
 * - « Enregistrer » sends the new files, then names the whole list, in order: the photos she added
 *   come after those she had. A failure keeps the portfolio as it was and says so.
 * - The result is announced in a `role="status"` outside the panel.
 *
 * The browser work, the network and the server action are properties: a test gives fakes.
 */
export function EditeurDuPortfolio({
	photos,
	envoyer,
	preparer = preparerPhotoNavigateur,
	televerser = (fichier, alt) => televerserLaPhoto(fichier, alt),
	supprimer = id => supprimerLeMedia(id),
}: {
	photos: readonly PhotoDeLEspace[]
	envoyer: EnvoiDuPortfolio
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
				aria-label="Modifier mon portfolio"
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
				<FormulaireDuPortfolio
					photos={photos}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					retour={declencheur}
					onEnregistre={() => {
						setAnnonce('Ton portfolio est enregistré.')
						setOuvert(false)
					}}
					onFermer={() => setOuvert(false)}
				/>
			) : null}
		</>
	)
}

function FormulaireDuPortfolio({
	photos,
	envoyer,
	preparer,
	televerser,
	supprimer,
	retour,
	onEnregistre,
	onFermer,
}: {
	photos: readonly PhotoDeLEspace[]
	envoyer: EnvoiDuPortfolio
	preparer: (fichier: File) => Promise<PhotoPreparee<File>>
	televerser: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer: (id: IdentifiantDePhoto) => Promise<unknown>
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const compteur = useRef(0)
	const [lignes, setLignes] = useState<Ligne[]>(() =>
		photos.map(photo => ({
			cle: `photo-${photo.id}`,
			fichier: new File([], ''),
			alt: photo.alt,
			id: photo.id,
			url: photo.url,
			apercu: '',
			enAttente: false,
			signature: '',
		}))
	)
	const [refus, setRefus] = useState<{ cle: string; texte: string }[]>([])
	const [message, setMessage] = useState('')
	const [sessionExpiree, setSessionExpiree] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [enCours, setEnCours] = useState(false)
	const verrou = useRef(false)
	const lignesCourantes = useRef(lignes)
	lignesCourantes.current = lignes

	// The local addresses are given back when the panel goes.
	useEffect(
		() => () => {
			for (const ligne of lignesCourantes.current) libererApercu(ligne.apercu)
		},
		[]
	)

	async function choisir(fichiers: File[]) {
		setMessage('')
		setPreparation(true)
		const refuses: { cle: string; texte: string }[] = []
		const refuser = (fichier: File, texte: string) => {
			compteur.current += 1
			refuses.push({ cle: `refus-${compteur.current}`, texte: `${fichier.name} : ${texte}` })
		}
		try {
			const acceptees: Ligne[] = []
			const connues = new Set(lignesCourantes.current.map(ligne => ligne.signature).filter(Boolean))
			for (const fichier of fichiers) {
				if (lignesCourantes.current.length + acceptees.length >= GALERIE_MAX) {
					refuser(fichier, MESSAGES_PHOTO['limite-galerie'])
					continue
				}
				const signature = signatureDe(fichier)
				if (connues.has(signature)) {
					refuser(fichier, MESSAGES_PHOTO.doublon)
					continue
				}
				const prete = await preparer(fichier)
				if (!prete.ok) {
					refuser(fichier, prete.message)
					continue
				}
				connues.add(signature)
				compteur.current += 1
				const apercu = apercuLocal(prete.fichier)
				acceptees.push({
					cle: `local-${compteur.current}`,
					fichier: prete.fichier,
					alt: ALT_PORTFOLIO,
					url: apercu,
					apercu,
					enAttente: true,
					signature,
				})
			}
			if (acceptees.length > 0) setLignes(courantes => [...courantes, ...acceptees])
			setRefus(refuses)
		} finally {
			setPreparation(false)
		}
	}

	async function enregistrer() {
		if (verrou.current) return
		verrou.current = true
		setEnCours(true)
		setMessage('')
		setSessionExpiree(false)
		try {
			const issue = await envoyerPuisEnregistrer<ValeursDuPortfolio>({
				photos: lignes,
				televerser,
				supprimer,
				enregistrer: ids => envoyer({ galerie: ids }),
				marquerEnvoyee: (cle, id) =>
					setLignes(courantes => courantes.map(ligne => (ligne.cle === cle ? { ...ligne, id } : ligne))),
			})
			if (issue.ok) {
				onEnregistre()
				return
			}
			setMessage(issue.champs?.galerie ?? issue.message)
			setSessionExpiree(issue.session === 'expiree')
		} finally {
			verrou.current = false
			setEnCours(false)
		}
	}

	const nouvelles = lignes.filter(ligne => ligne.enAttente).length
	return (
		<PanneauDEdition
			titre="Modifier mon portfolio"
			enCours={enCours || preparation}
			modifie={nouvelles > 0}
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
				<h3 className="font-medium">
					Photos de ton portfolio ({lignes.length} / {GALERIE_MAX})
				</h3>
				{lignes.length === 0 ? (
					<p className="text-neutral-600 italic">Tu n’as pas encore de photo dans ton portfolio.</p>
				) : (
					<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{lignes.map((ligne, rang) => (
							<li key={ligne.cle} className="flex min-w-0 flex-col gap-1">
								{/* biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer */}
								<img
									src={ligne.url || undefined}
									alt={texteAlternatif(rang + 1, lignes.length)}
									className="aspect-square w-full rounded object-cover"
								/>
								{ligne.enAttente ? <span className="font-semibold text-indigo-900 text-xs">À enregistrer</span> : null}
							</li>
						))}
					</ul>
				)}
				<div className="flex flex-col gap-1">
					<label htmlFor="portfolio-fichiers" className="font-medium text-sm">
						Ajouter des photos
					</label>
					<input
						id="portfolio-fichiers"
						type="file"
						multiple
						accept={ACCEPT}
						disabled={enCours || preparation}
						aria-describedby="portfolio-aide"
						onChange={evenement => {
							const choisis = Array.from(evenement.target.files ?? [])
							// The same files can be picked again.
							evenement.target.value = ''
							if (choisis.length > 0) void choisir(choisis)
						}}
						className="min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base"
					/>
					<p id="portfolio-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP, {GALERIE_MAX} photos au plus. Les photos sont réduites avant l’envoi, et rien n’est
						envoyé avant « Enregistrer ».
					</p>
					{preparation ? (
						<p role="status" className="text-sm">
							Préparation des photos…
						</p>
					) : null}
					{refus.length > 0 ? (
						<ul role="alert" className="list-disc pl-5 text-red-800 text-sm">
							{refus.map(({ cle, texte }) => (
								<li key={cle}>{texte}</li>
							))}
						</ul>
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
										href={urlSessionExpiree(PAGE_DE_L_ESPACE)}
										target="_blank"
										rel="noopener"
									>
										Te reconnecter (nouvel onglet)
									</a>
									, puis reviens ici et enregistre à nouveau : tes photos sont toujours là.
								</>
							) : null}
						</p>
					) : null}
				</div>
				<button
					type="submit"
					disabled={enCours || preparation || nouvelles === 0}
					className={`${BOUTON} bg-neutral-900 text-white disabled:cursor-not-allowed disabled:opacity-60`}
				>
					{enCours ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</PanneauDEdition>
	)
}
