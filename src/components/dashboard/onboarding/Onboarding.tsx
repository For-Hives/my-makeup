'use client'

import { useEffect, useRef, useState } from 'react'
import { type Track, track } from '@/lib/analytics/track'
import type { IdentityValues } from '@/lib/dashboard/identity'
import type { LocationValues } from '@/lib/dashboard/location'
import { type OnboardingStep, STEPS, STEPS_NAMES } from '@/lib/dashboard/onboarding'
import type { PreparedPhoto } from '@/lib/dashboard/photo'
import type { PhotoId } from '@/lib/dashboard/photos'
import type { FileUploadResult } from '@/lib/dashboard/photos-upload'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { CitiesSearch } from '../CityField'
import type { IdentityUpload } from '../IdentityEditor'
import type { LocationUpload } from '../LocationEditor'
import { IdentityStep, type Origin } from './IdentityStep'
import { type OnboardingPhotoUpload, PhotoStep } from './PhotoStep'
import { ONBOARDING_PAGE } from './shared'
import { ZoneStep } from './ZoneStep'

/** Where she arrives once the server has seen the three steps done. */
const DASHBOARD = '/auth/profil'

const go = (url: string): void => window.location.assign(url)

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
export function Onboarding({
	etapeInitiale,
	identite,
	localisation,
	envoyerIdentite,
	envoyerLocalisation,
	chercherCommunes,
	revueZone = null,
	envoyerPhoto,
	preparer,
	televerser,
	supprimer,
	naviguer = go,
	suivre = track,
}: {
	etapeInitiale: OnboardingStep
	identite: IdentityValues
	localisation: LocationValues
	envoyerIdentite: IdentityUpload
	envoyerLocalisation: LocationUpload
	chercherCommunes: CitiesSearch
	/** The zone to review the import left on the profile, or null (ticket 265). */
	revueZone?: ZoneReviewView | null
	envoyerPhoto: OnboardingPhotoUpload
	preparer?: (fichier: File) => Promise<PreparedPhoto<File>>
	televerser?: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer?: (id: PhotoId) => Promise<unknown>
	naviguer?: (url: string) => void
	suivre?: Track
}) {
	const [step, setStep] = useState<OnboardingStep>(etapeInitiale)
	const [identityValues, setIdentityValues] = useState(identite)
	const [zoneValues, setZoneValues] = useState(localisation)
	// A zone saved empties the review on the server: the banner does not come back with « Précédent ».
	const [zoneReview, setZoneReview] = useState(revueZone)
	const [origin, setOrigin] = useState<Origin | null>(null)
	const title = useRef<HTMLHeadingElement>(null)
	const first = useRef(true)
	// Measure (ticket 148): each step is counted once per visit, the declared origin once, and neither
	// is ever stored or sent to the server.
	const trackedSteps = useRef(new Set<string>())
	const trackedOrigin = useRef(false)
	const trackStep = (etapeFranchie: 'identite' | 'zone' | 'photo' | 'termine') => {
		if (trackedSteps.current.has(etapeFranchie)) return
		trackedSteps.current.add(etapeFranchie)
		suivre('onboarding_step', { step: etapeFranchie })
	}

	// The title of the step that opens takes the focus, so that a keyboard or a screen reader follows.
	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		title.current?.focus()
	}, [step])

	return (
		<div className="flex flex-col gap-6">
			<h1 className="font-semibold text-3xl">Prépare ton profil</h1>
			<nav aria-label="Étapes">
				<ol className="grid grid-cols-3 gap-2">
					{STEPS.map(numero => {
						const current = numero === step
						const done = numero < step
						return (
							<li
								key={numero}
								aria-current={current ? 'step' : undefined}
								className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm ${
									current ? 'border-neutral-900 bg-neutral-900 font-medium text-white' : 'border-neutral-400 bg-white'
								}`}
							>
								<span aria-hidden="true">{done ? '✓' : numero}</span>
								<span>
									{STEPS_NAMES[numero]}
									{done ? <span className="sr-only"> (faite)</span> : null}
								</span>
							</li>
						)
					})}
				</ol>
			</nav>
			{step === 1 ? (
				<IdentityStep
					valeurs={identityValues}
					envoyer={envoyerIdentite}
					origine={origin}
					choisirOrigine={setOrigin}
					titre={title}
					surFait={valeurs => {
						trackStep('identite')
						if (origin !== null && !trackedOrigin.current) {
							trackedOrigin.current = true
							suivre('onboarding_source', { source: origin })
						}
						setIdentityValues(valeurs)
						setStep(2)
					}}
				/>
			) : null}
			{step === 2 ? (
				<ZoneStep
					valeurs={zoneValues}
					envoyer={envoyerLocalisation}
					chercher={chercherCommunes}
					revue={zoneReview}
					titre={title}
					surFait={valeurs => {
						trackStep('zone')
						setZoneValues(valeurs)
						setZoneReview(null)
						setStep(3)
					}}
					retour={() => setStep(1)}
				/>
			) : null}
			{step === 3 ? (
				<PhotoStep
					envoyer={envoyerPhoto}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					titre={title}
					retour={() => setStep(2)}
					surFait={({ position }) => {
						trackStep('photo')
						if (position === 'terminee') trackStep('termine')
						// Only the server's reading of the stored profile sends her on; a missing step reads the page again.
						naviguer(position === 'terminee' ? DASHBOARD : ONBOARDING_PAGE)
					}}
				/>
			) : null}
		</div>
	)
}
