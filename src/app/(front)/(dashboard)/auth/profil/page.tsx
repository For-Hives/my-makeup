import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { MyViews } from '@/components/dashboard/MyViews'
import { OnboardingBanner } from '@/components/dashboard/OnboardingBanner'
import { PreviewBanner } from '@/components/dashboard/PreviewBanner'
import { QuoteRequests } from '@/components/dashboard/QuoteRequests'
import { RefreshSession } from '@/components/dashboard/RefreshSession'
import { bodyEdit } from '@/components/direct-edit/body-edit'
import { CompletenessPanel } from '@/components/direct-edit/CompletenessPanel'
import { EditBar } from '@/components/direct-edit/EditBar'
import { body, display } from '@/components/direct-edit/fonts'
import { headerEdit } from '@/components/direct-edit/header-edit'
import { OwnerEditSession } from '@/components/direct-edit/OwnerEditSession'
import { ProfileView } from '@/components/profile/ProfileView'
import { readCheck } from '@/lib/activity/store'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { activityView } from '@/lib/dashboard/activity'
import { greetingName } from '@/lib/dashboard/greeting'
import { artistProfile, profileId } from '@/lib/dashboard/my-profile'
import { readMyViews } from '@/lib/dashboard/my-views'
import { remainingSteps } from '@/lib/dashboard/onboarding'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { previewState } from '@/lib/dashboard/preview'
import { profileProgress } from '@/lib/dashboard/progress'
import { publicAddress } from '@/lib/dashboard/public-address'
import { requestUser } from '@/lib/dashboard/request'
import { EDIT_QUERY, editPath, isPreviewRequest, previewPath } from '@/lib/direct-edit/edit-mode'
import { serverEnv } from '@/lib/env'
import { usageView } from '@/lib/photo-limits'
import { readPhotoUsage } from '@/lib/photo-usage'
import { readMyQuotes } from '@/lib/quote/dashboard'
import { readProfilePreview } from '@/services/public/profiles'
import {
	saveMyAvailability,
	saveMyContactDetails,
	saveMyDescription,
	saveMyIdentity,
	saveMyLanguages,
	saveMyMainPicture,
	saveMyNetworks,
	saveMyPortfolio,
	saveMySiret,
	saveMySkills,
} from './actions'
import { saveMyCourses, saveMyExperiences, saveMyServiceOffers } from './lists-actions'
import { findMyCities, saveMyLocation } from './location-actions'
import { markMyQuoteRequest } from './quote-actions'

// Read per request: it depends on the session, and the build has no database. A page that reads
// the session is never shared nor stored (`private, no-store`, ticket 075), and never indexed:
// the headers of `/auth/*` (`private, no-store`, `noindex`) and the tag below.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon profil', robots: { index: false, follow: false } }

/**
 * Her space IS her profile (issue 1022; decision of 23/10/2026): the page of her profile, drawn by the same
 * component from the same public reading as `/profil/<slug>`, and editable in place. Above it, how far her profile
 * is filled and what she lacks; below it, her views and her quote requests. With `?mode=preview` it is the page as
 * a visitor sees it, even when the profile is not listed yet or is hidden, with a banner that says where it stands.
 *
 * Only her profile can come out of it: it is found by her session, no identifier or slug comes from the request.
 * Never a structured data nor a canonical address (the page is not for a search engine), and the public address of
 * the profile never carries an editing control. An account that came without a profile goes to the onboarding.
 */
export default async function ProfilePage({ searchParams }: PageProps<'/auth/profil'>) {
	const previewing = isPreviewRequest((await searchParams)[EDIT_QUERY])
	const artist = await requireArtist(previewing ? previewPath() : editPath())
	const context = await requestUser()
	const id = context === null ? null : await profileId(context.payload, context.utilisateur)
	const preview = context === null || id === null ? null : await readProfilePreview(context.payload, id)
	// An account that came without a profile (some accounts of the old site) gets one in the onboarding (ticket 140).
	if (context === null || id === null || preview === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	const state = previewState(preview.etat)
	if (previewing) {
		return (
			<>
				<PreviewBanner etat={state} />
				<ProfileView profil={preview.profil} mesure={false} />
			</>
		)
	}
	const profile = await artistProfile(context.payload, context.utilisateur)
	if (profile === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	const photos = await readDashboardPhotos(context.payload, profile)
	// What she stores and what the site allows (issue 309): the volume used and the photos left.
	const usage = usageView(await readPhotoUsage(context.payload, artist.id))
	// Her SIRET and where its check stands: for her eyes only (issue 1004).
	const activity = activityView(profile.siret, await readCheck(context.payload, profile.id))
	const progress = profileProgress(profile)
	// Her views of the last 30 days, once her page is published (issue 1001): her own profile, found by her session.
	const myViews = profile.status === 'published' ? await readMyViews(context.payload, id) : undefined
	// Her quote requests (issue 1003): shown when the site offers the form, and as long as she holds one.
	const myQuotes = await readMyQuotes(context.payload, id)
	// An empty profile has no page to send a request to: its block would only push her page down.
	const showQuotes =
		(serverEnv().quoteRequests && profile.status === 'published') || myQuotes === null || myQuotes.length > 0
	const steps = remainingSteps(profile)
	// Not for a page the team hid, nor for the team's own account: the onboarding is not their next step.
	const showBanner = steps.premiere !== null && progress.etat !== 'masque' && progress.etat !== 'interne'
	return (
		<div className={`${display.variable} ${body.variable} flex flex-1 flex-col`}>
			<RefreshSession expire={artist.expire} />
			<OwnerEditSession>
				<EditBar />
				{showBanner && steps.premiere !== null ? (
					<OnboardingBanner reste={steps.reste} premiere={steps.premiere} />
				) : null}
				<CompletenessPanel
					progress={progress}
					resume={saveMyAvailability}
					address={profile.slug ? publicAddress(profile.slug) : null}
					greeting={`Bonjour ${greetingName({ firstName: profile.firstName, accountName: artist.name })}, tu es connectée.`}
				/>
				<ProfileView
					profil={preview.profil}
					mesure={false}
					edit={{
						header: headerEdit({
							profile,
							photos,
							actions: {
								savePhoto: saveMyMainPicture,
								saveIdentity: saveMyIdentity,
								savePlace: saveMyLocation,
								saveStatus: saveMyAvailability,
								searchCities: findMyCities,
							},
						}),
						body: bodyEdit({
							profile,
							photos,
							usage,
							activity,
							actions: {
								saveAbout: saveMyDescription,
								saveSkills: saveMySkills,
								saveLanguages: saveMyLanguages,
								saveCourses: saveMyCourses,
								saveExperiences: saveMyExperiences,
								saveServices: saveMyServiceOffers,
								savePortfolio: saveMyPortfolio,
								saveContacts: saveMyContactDetails,
								saveNetworks: saveMyNetworks,
								saveSiret: saveMySiret,
								saveMainPicture: saveMyMainPicture,
								savePlace: saveMyLocation,
								searchCities: findMyCities,
							},
						}),
					}}
				/>
			</OwnerEditSession>
			{myViews === undefined && !showQuotes ? null : (
				<section
					aria-label="Mon activité"
					data-testid="mon-activite"
					className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 font-body sm:px-6 md:px-8"
				>
					{myViews === undefined ? null : <MyViews jours={myViews} />}
					{showQuotes ? <QuoteRequests quotes={myQuotes} mark={markMyQuoteRequest} /> : null}
				</section>
			)}
		</div>
	)
}
