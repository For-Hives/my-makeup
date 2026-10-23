'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { ContactsSave } from '@/components/direct-edit/blocks/ContactsBlock'
import { IdentityForm, type IdentitySave } from '@/components/direct-edit/blocks/IdentityBlock'
import type { NetworksSave } from '@/components/direct-edit/blocks/NetworksBlock'
import { PhotoForm, type PhotoSave, type PhotoWork } from '@/components/direct-edit/blocks/PhotoBlock'
import { PlaceForm, type PlaceSave } from '@/components/direct-edit/blocks/PlaceBlock'
import type { RowsSave } from '@/components/direct-edit/blocks/RowsBlock'
import { EditSession } from '@/components/direct-edit/EditSession'
import { type Track, track } from '@/lib/analytics/track'
import type { ContactDetailsValues } from '@/lib/dashboard/contact-details'
import type { IdentityValues } from '@/lib/dashboard/identity'
import type { SavedRow } from '@/lib/dashboard/list'
import type { LocationValues } from '@/lib/dashboard/location'
import type { NetworksValues } from '@/lib/dashboard/networks'
import {
	ESSENTIAL_STEPS,
	type OnboardingStep,
	OPTIONAL_STEPS,
	onboardingIdentitySchema,
	STEPS,
	STEPS_NAMES,
	STEPS_TITLES,
} from '@/lib/dashboard/onboarding'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { OfferModel } from '@/lib/price-median'
import type { CitiesSearch } from '../CityField'
import { ContactStep } from './ContactStep'
import { OfferStep } from './OfferStep'
import { type Origin, OriginQuestion } from './OriginQuestion'
import { ONBOARDING_END_PAGE, QUIET_BUTTON, SECONDARY_BUTTON, StepFrame } from './shared'

/** The server actions the steps save through: the ones of her space, given by the page. */
export interface OnboardingActions {
	saveIdentity: IdentitySave
	savePlace: PlaceSave
	searchCities: CitiesSearch
	savePhoto: PhotoSave
	saveNetworks: NetworksSave
	saveContacts: ContactsSave
	saveServices: RowsSave
}

/** What the page reads of her stored profile for the steps. */
export interface OnboardingProfile {
	identity: IdentityValues
	/** The names are asked only when the account has none (an account of the old site). */
	askNames: boolean
	location: LocationValues
	/** The zone to review the import left on the profile, or null (ticket 265). */
	zoneReview: ZoneReviewView | null
	photo: DashboardPhoto | null
	networks: NetworksValues
	contact: ContactDetailsValues
	offers: readonly SavedRow[]
	/** The median of the published offers by model, null under the minimum sample. */
	medians: Readonly<Record<OfferModel['label'], number | null>>
}

/** The measure (ticket 148, issue 1009): the value of `onboarding_step` each step sends once it is stored. */
const MEASURED = {
	1: 'identite',
	2: 'zone',
	3: 'photo',
	4: 'contact',
	5: 'prestation',
} as const

/**
 * The onboarding of a new makeup artist (ticket 140; issue 1009): five short steps, each saved on its own.
 *
 * - It opens on the first step her stored profile has not done (`position`, read by the server), so a
 *   step left yesterday is resumed today, and a step the profile already holds is skipped.
 * - The fields are the editors of the direct edition (same forms, same rules, same server actions);
 *   each step lives in its own `EditSession`, whose « saved » is the moment the server answered « ok ».
 *   A failure stays on the step, with what she typed, and says so.
 * - A step opens the next one only once the server stored hers. The page is then read again in the
 *   background (`refresh`), so that what the next steps show is what is stored.
 * - The last two steps have « Plus tard »: they lead to a publishable page and block nothing. When no
 *   step is left to do, the onboarding goes to the end page, where the server says whether the page is
 *   online (`navigate`): this component never claims it.
 *
 * The server actions, the browser work, the refresh and the navigation are properties: the page gives
 * the real ones, a test gives fakes.
 */
export function Onboarding({
	position,
	done,
	profile,
	actions,
	photoWork,
	refresh,
	navigate,
	suivre = track,
}: {
	position: OnboardingStep
	/** Which steps the stored profile has done: the next step is the next one not done. */
	done: Readonly<Record<OnboardingStep, boolean>>
	profile: OnboardingProfile
	actions: OnboardingActions
	photoWork?: PhotoWork
	refresh: () => void
	navigate: (url: string) => void
	suivre?: Track
}) {
	const [step, setStep] = useState<OnboardingStep>(position)
	const [origin, setOrigin] = useState<Origin | null>(null)
	const title = useRef<HTMLHeadingElement>(null)
	const first = useRef(true)
	// Measure (ticket 148): each step is counted once per visit, the declared origin once, and neither
	// is ever stored or sent to the server.
	const trackedSteps = useRef(new Set<string>())
	const trackedOrigin = useRef(false)
	const trackStep = (value: (typeof MEASURED)[OnboardingStep] | 'termine') => {
		if (trackedSteps.current.has(value)) return
		trackedSteps.current.add(value)
		suivre('onboarding_step', { step: value })
	}

	// The title of the step that opens takes the focus, so that a keyboard or a screen reader follows.
	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		title.current?.focus()
	}, [step])

	// A step is done when the stored profile says so, or when the server stored it during this visit: the
	// page is read again in the background, and its answer may come after she moved on.
	const storedHere = useRef(new Set<OnboardingStep>())
	const isDone = (rank: OnboardingStep): boolean => done[rank] || storedHere.current.has(rank)
	const nextAfter = (from: OnboardingStep): OnboardingStep | null =>
		STEPS.find(rank => rank > from && !isDone(rank)) ?? null

	function goOn(from: OnboardingStep) {
		const next = nextAfter(from)
		if (next === null) return navigate(ONBOARDING_END_PAGE)
		setStep(next)
		refresh()
	}

	/** The server stored this step. */
	function saved(from: OnboardingStep) {
		// Counted the first time the server stores the step, not each time it is saved again.
		if (!isDone(from)) {
			trackStep(MEASURED[from])
			// The profile became active: this was the last of the three essential steps.
			const essential = (ESSENTIAL_STEPS as readonly number[]).includes(from)
			if (essential && ESSENTIAL_STEPS.every(rank => rank === from || isDone(rank))) trackStep('termine')
		}
		storedHere.current.add(from)
		if (from === 1 && origin !== null && !trackedOrigin.current) {
			trackedOrigin.current = true
			suivre('onboarding_source', { source: origin })
		}
		goOn(from)
	}

	/** « Précédent » and « Plus tard », where the editors of the direct edition have « Annuler ». */
	const buttons: ReactNode = (
		<>
			{step > 1 ? (
				<button type="button" onClick={() => setStep((step - 1) as OnboardingStep)} className={SECONDARY_BUTTON}>
					Précédent
				</button>
			) : null}
			{(OPTIONAL_STEPS as readonly number[]).includes(step) ? (
				<button type="button" onClick={() => goOn(step)} className={QUIET_BUTTON}>
					Plus tard
				</button>
			) : null}
		</>
	)

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-3">
				<h1 className="font-display font-medium text-3xl text-ink sm:text-4xl">Prépare ton profil</h1>
				<nav aria-label="Étapes">
					<ol className="flex items-center gap-2">
						{STEPS.map(rank => {
							const current = rank === step
							const finished = rank < step
							return (
								<li
									key={rank}
									aria-current={current ? 'step' : undefined}
									className={`flex size-9 items-center justify-center rounded-full border text-sm ${
										current
											? 'border-ink bg-ink font-semibold text-white'
											: finished
												? 'border-ink bg-white text-ink'
												: 'border-hairline bg-white text-mute'
									}`}
								>
									<span aria-hidden="true">{finished ? '✓' : rank}</span>
									<span className="sr-only">
										Étape {rank} sur {STEPS.length} : {STEPS_NAMES[rank]}
										{finished ? ' (faite)' : ''}
									</span>
								</li>
							)
						})}
					</ol>
				</nav>
				<p className="text-mute text-sm" data-testid="etape-courante">
					Étape {step} sur {STEPS.length} · {STEPS_NAMES[step]}
				</p>
			</div>
			<EditSession key={step} refresh={() => saved(step)}>
				{step === 1 ? (
					<StepFrame
						titre={STEPS_TITLES[1]}
						explication={
							profile.askNames
								? 'Ton prénom, ton nom et ta spécialité seront visibles sur ta page.'
								: 'Ton prénom et ton nom viennent de ton inscription. Il ne manque que ta spécialité, visible sous ton nom.'
						}
						reference={title}
					>
						<IdentityForm
							values={profile.identity}
							save={actions.saveIdentity}
							schema={onboardingIdentitySchema}
							askNames={profile.askNames}
							title="Ta spécialité"
							submitLabel="Suivant"
							cancel={null}
							after={<OriginQuestion origine={origin} choisir={setOrigin} />}
						/>
					</StepFrame>
				) : null}
				{step === 2 ? (
					<StepFrame
						titre={STEPS_TITLES[2]}
						explication="Dis-nous où tu travailles : seule ta commune ou ton pays apparaît sur ta page, jamais ton adresse."
						reference={title}
					>
						<PlaceForm
							values={profile.location}
							save={actions.savePlace}
							search={actions.searchCities}
							review={profile.zoneReview}
							title="Ta zone"
							submitLabel="Suivant"
							cancel={buttons}
							rayonFacultatif
						/>
					</StepFrame>
				) : null}
				{step === 3 ? (
					<StepFrame
						titre={STEPS_TITLES[3]}
						explication="C’est la première chose qu’on voit de toi. Une photo de ton visage, nette, bien éclairée."
						reference={title}
					>
						<PhotoForm
							photo={profile.photo}
							save={actions.savePhoto}
							{...photoWork}
							submitLabel="Suivant"
							cancel={buttons}
						/>
					</StepFrame>
				) : null}
				{step === 4 ? (
					<StepFrame
						titre={STEPS_TITLES[4]}
						explication="Une cliente doit pouvoir te joindre. Ton Instagram suffit ; ton téléphone ou ton email ne s’affichent que si tu le choisis."
						reference={title}
					>
						<ContactStep
							networks={profile.networks}
							contact={profile.contact}
							saveNetworks={actions.saveNetworks}
							saveContacts={actions.saveContacts}
							cancel={buttons}
						/>
					</StepFrame>
				) : null}
				{step === 5 ? (
					<StepFrame
						titre={STEPS_TITLES[5]}
						explication="La prestation qu’on te demande le plus, avec son prix. Tu pourras en ajouter d’autres ensuite."
						reference={title}
					>
						<OfferStep rows={profile.offers} medians={profile.medians} save={actions.saveServices} cancel={buttons} />
					</StepFrame>
				) : null}
			</EditSession>
		</div>
	)
}
