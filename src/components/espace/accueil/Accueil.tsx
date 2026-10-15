'use client'

import { useEffect, useRef, useState } from 'react'
import type { ResultatDEnvoiDUnFichier } from '@/lib/espace/envoi-des-photos'
import type { ValeursDeLIdentite } from '@/lib/espace/identite'
import type { ValeursDeLaLocalisation } from '@/lib/espace/localisation'
import { ETAPES, type EtapeDAccueil, NOMS_DES_ETAPES } from '@/lib/espace/onboarding'
import type { PhotoPreparee } from '@/lib/espace/photo'
import type { IdentifiantDePhoto } from '@/lib/espace/photos'
import type { RechercheDeCommunes } from '../ChampDeCommune'
import type { EnvoiDeLaLocalisation } from '../EditeurDeLocalisation'
import type { EnvoiDeLIdentite } from '../EditeurDIdentite'
import { PAGE_DE_L_ACCUEIL } from './commun'
import { EtapeIdentite, type Origine } from './EtapeIdentite'
import { type EnvoiDeLaPhotoDAccueil, EtapePhoto } from './EtapePhoto'
import { EtapeZone } from './EtapeZone'

/** Where she arrives once the server has seen the three steps done. */
const ESPACE = '/auth/profil'

const aller = (url: string): void => window.location.assign(url)

/**
 * The onboarding of a new makeup artist (ticket 140): three steps, identity, zone and main photo.
 *
 * - It opens on the first step her stored profile has not done (`etapeInitiale`, read by the
 *   server), so a step left yesterday is resumed today.
 * - A step opens the next one only when the server answered that it stored her input. A failure
 *   stays on the step, with what she typed, and says so.
 * - She arrives in her space only when the server answers, after the photo, that the profile it
 *   stored holds all three steps (RG-07: no false welcome). While it answers, even 2.5 s later, the
 *   step says « Enregistrement… » and nothing else; if it answers that a step is missing, the page
 *   is read again from the server. The page itself also sends an active profile to her space.
 *
 * The server actions and the browser work are properties: the page gives the actions, a test gives
 * fakes.
 */
export function Accueil({
	etapeInitiale,
	identite,
	localisation,
	envoyerIdentite,
	envoyerLocalisation,
	chercherCommunes,
	envoyerPhoto,
	preparer,
	televerser,
	supprimer,
	naviguer = aller,
}: {
	etapeInitiale: EtapeDAccueil
	identite: ValeursDeLIdentite
	localisation: ValeursDeLaLocalisation
	envoyerIdentite: EnvoiDeLIdentite
	envoyerLocalisation: EnvoiDeLaLocalisation
	chercherCommunes: RechercheDeCommunes
	envoyerPhoto: EnvoiDeLaPhotoDAccueil
	preparer?: (fichier: File) => Promise<PhotoPreparee<File>>
	televerser?: (fichier: File, alt: string) => Promise<ResultatDEnvoiDUnFichier>
	supprimer?: (id: IdentifiantDePhoto) => Promise<unknown>
	naviguer?: (url: string) => void
}) {
	const [etape, setEtape] = useState<EtapeDAccueil>(etapeInitiale)
	const [valeursIdentite, setValeursIdentite] = useState(identite)
	const [valeursZone, setValeursZone] = useState(localisation)
	const [origine, setOrigine] = useState<Origine | null>(null)
	const titre = useRef<HTMLHeadingElement>(null)
	const premier = useRef(true)

	// The title of the step that opens takes the focus, so that a keyboard or a screen reader follows.
	useEffect(() => {
		if (premier.current) {
			premier.current = false
			return
		}
		titre.current?.focus()
	}, [etape])

	return (
		<div className="flex flex-col gap-6">
			<h1 className="font-semibold text-3xl">Prépare ton profil</h1>
			<nav aria-label="Étapes">
				<ol className="grid grid-cols-3 gap-2">
					{ETAPES.map(numero => {
						const courante = numero === etape
						const faite = numero < etape
						return (
							<li
								key={numero}
								aria-current={courante ? 'step' : undefined}
								className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm ${
									courante ? 'border-neutral-900 bg-neutral-900 font-medium text-white' : 'border-neutral-400 bg-white'
								}`}
							>
								<span aria-hidden="true">{faite ? '✓' : numero}</span>
								<span>
									{NOMS_DES_ETAPES[numero]}
									{faite ? <span className="sr-only"> (faite)</span> : null}
								</span>
							</li>
						)
					})}
				</ol>
			</nav>
			{etape === 1 ? (
				<EtapeIdentite
					valeurs={valeursIdentite}
					envoyer={envoyerIdentite}
					origine={origine}
					choisirOrigine={setOrigine}
					titre={titre}
					surFait={valeurs => {
						setValeursIdentite(valeurs)
						setEtape(2)
					}}
				/>
			) : null}
			{etape === 2 ? (
				<EtapeZone
					valeurs={valeursZone}
					envoyer={envoyerLocalisation}
					chercher={chercherCommunes}
					titre={titre}
					surFait={valeurs => {
						setValeursZone(valeurs)
						setEtape(3)
					}}
					retour={() => setEtape(1)}
				/>
			) : null}
			{etape === 3 ? (
				<EtapePhoto
					envoyer={envoyerPhoto}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					titre={titre}
					retour={() => setEtape(2)}
					surFait={({ position }) => {
						// Only the server's reading of the stored profile sends her on; a missing step reads the page again.
						naviguer(position === 'terminee' ? ESPACE : PAGE_DE_L_ACCUEIL)
					}}
				/>
			) : null}
		</div>
	)
}
