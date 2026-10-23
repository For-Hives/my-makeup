import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OnboardingDone } from '@/components/dashboard/onboarding/OnboardingDone'
import { OnboardingRoute } from '@/components/dashboard/onboarding/OnboardingRoute'
import { body, display } from '@/components/direct-edit/fonts'
import { ACCOUNT_ONBOARDING_PAGE, signInUrl } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { draftNotice } from '@/lib/dashboard/draft-notice'
import { ensureProfile } from '@/lib/dashboard/empty-profile'
import { profileRows } from '@/lib/dashboard/list'
import { locationValues } from '@/lib/dashboard/location'
import { artistProfile } from '@/lib/dashboard/my-profile'
import { onboardingPosition, remainingSteps, stepsDone } from '@/lib/dashboard/onboarding'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { DASHBOARD_PATH } from '@/lib/dashboard/preview'
import { profileProgress } from '@/lib/dashboard/progress'
import { publicAddress } from '@/lib/dashboard/public-address'
import { requestUser } from '@/lib/dashboard/request'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { text } from '@/lib/profile/display-name'
import { specialtyFormValues } from '@/lib/specialty'
import { readOfferMedians } from '@/services/public/offer-medians'
import { saveMyContactDetails, saveMyMainPicture, saveMyNetworks } from '../profil/actions'
import { saveMyServiceOffers } from '../profil/lists-actions'
import { findMyCities, saveMyLocation } from '../profil/location-actions'
import { saveMyOnboardingIdentity } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Prépare ton profil' }

/** The query that asks for the last screen: the server reads her profile and says where she stands. */
const END = 'fin'

/**
 * The onboarding of a new account (ticket 140; issue 1009): five steps, speciality, zone, main photo,
 * how to reach her, her flagship offer. The step shown is read from her stored profile, so she resumes
 * where she left and a step the profile already holds is skipped. An account that came without a profile
 * (some accounts of the old site) gets an empty one here, made by the server. A profile with nothing left
 * to do has nothing to do here: she goes to her space.
 *
 * With `?etape=fin` it is the last screen: « Ta page est en ligne » when the single rule of a profile
 * calls it publishable, else what is missing. Asked while the three essential steps are not done, it
 * sends her back to the steps.
 */
export default async function AccountOnboardingPage({ searchParams }: PageProps<'/auth/init-account'>) {
	await requireArtist(ACCOUNT_ONBOARDING_PAGE)
	const context = await requestUser()
	if (context === null) return redirect(signInUrl(ACCOUNT_ONBOARDING_PAGE))
	await ensureProfile(context.payload, context.utilisateur)
	const profile = await artistProfile(context.payload, context.utilisateur)
	if (profile === null) throw new Error('Le profil de la maquilleuse n’a pas pu être créé.')
	const position = onboardingPosition(profile)
	const progress = profileProgress(profile)

	if ((await searchParams).etape === END) {
		if (remainingSteps(profile).reste > 0) return redirect(ACCOUNT_ONBOARDING_PAGE)
		// A page the team hid, or the team's own account: the onboarding has nothing to say.
		if (progress.etat === 'masque' || progress.etat === 'interne') return redirect(DASHBOARD_PATH)
		const done = stepsDone(profile)
		return (
			<main className={`${display.variable} ${body.variable} flex flex-1 flex-col bg-blush font-body text-ink`}>
				<div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
					<OnboardingDone
						online={progress.etat === 'publiable'}
						address={profile.slug ? publicAddress(profile.slug) : ''}
						notice={draftNotice(progress)}
						resume={!done[4] || !done[5]}
						editPath={editPath()}
						dashboardPath={DASHBOARD_PATH}
					/>
				</div>
			</main>
		)
	}

	if (position === 'terminee') return redirect(DASHBOARD_PATH)
	const done = stepsDone(profile)
	const photos = await readDashboardPhotos(context.payload, profile)
	// The market hint is read only when the offer step is still to do.
	const medians = done[5] ? { Mariée: null, Soirée: null, Essai: null } : await readOfferMedians(context.payload)

	return (
		<main className={`${display.variable} ${body.variable} flex flex-1 flex-col bg-blush font-body text-ink`}>
			<div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
				<OnboardingRoute
					position={position}
					done={done}
					profile={{
						identity: {
							prenom: text(profile.firstName),
							nom: text(profile.lastName),
							nomArtiste: text(profile.artistName),
							...specialtyFormValues(profile),
						},
						askNames: text(profile.firstName) === '' || text(profile.lastName) === '',
						location: locationValues(profile),
						zoneReview: zoneReviewView(profile.zoneReview),
						photo: photos.photo,
						networks: {
							instagram: text(profile.networks?.instagram),
							facebook: text(profile.networks?.facebook),
							youtube: text(profile.networks?.youtube),
							linkedin: text(profile.networks?.linkedin),
							siteWeb: text(profile.networks?.website),
						},
						contact: {
							telephone: text(profile.contactDetails?.phone),
							email: text(profile.contactDetails?.email),
							contactPublic: profile.publicContact === true,
						},
						offers: profileRows(SERVICE_OFFERS, profile),
						medians,
					}}
					actions={{
						saveIdentity: saveMyOnboardingIdentity,
						savePlace: saveMyLocation,
						searchCities: findMyCities,
						savePhoto: saveMyMainPicture,
						saveNetworks: saveMyNetworks,
						saveContacts: saveMyContactDetails,
						saveServices: saveMyServiceOffers,
					}}
				/>
			</div>
		</main>
	)
}
