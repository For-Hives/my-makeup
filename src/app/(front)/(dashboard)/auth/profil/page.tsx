import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AvailabilitySwitch } from '@/components/dashboard/AvailabilitySwitch'
import { MyViews } from '@/components/dashboard/MyViews'
import { OnboardingBanner } from '@/components/dashboard/OnboardingBanner'
import { ActivitySummary, SignOutCard } from '@/components/dashboard/overview/AccountSummary'
import { CARD, SECONDARY, TITLE } from '@/components/dashboard/overview/card'
import { OverviewHeader } from '@/components/dashboard/overview/OverviewHeader'
import { OverviewStatus } from '@/components/dashboard/overview/OverviewStatus'
import { PageOnline } from '@/components/dashboard/PageOnline'
import { PasswordChange } from '@/components/dashboard/PasswordChange'
import { QuoteRequests } from '@/components/dashboard/QuoteRequests'
import { RefreshSession } from '@/components/dashboard/RefreshSession'
import { body, display } from '@/components/direct-edit/fonts'
import { readCheck } from '@/lib/activity/store'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { activityView } from '@/lib/dashboard/activity'
import { AVAILABLE_TEXT, isAvailable, OUT_OF_SEARCH_TEXT, UNAVAILABLE_TEXT } from '@/lib/dashboard/availability'
import { readPasswordChangeMode } from '@/lib/dashboard/change-password'
import { confirmationMode } from '@/lib/dashboard/deletion-confirmation'
import { greetingName } from '@/lib/dashboard/greeting'
import { artistProfile, profileId } from '@/lib/dashboard/my-profile'
import { readMyViews } from '@/lib/dashboard/my-views'
import { remainingSteps } from '@/lib/dashboard/onboarding'
import { pageIsOnline, profileProgress } from '@/lib/dashboard/progress'
import { publicAddress } from '@/lib/dashboard/public-address'
import { requestUser } from '@/lib/dashboard/request'
import { serverEnv } from '@/lib/env'
import { readMyQuotes } from '@/lib/quote/dashboard'
import { saveMyAvailability } from './actions'
import { deleteMyAccountAction } from './deletion-actions'
import { changeMyPasswordAction, requestSetPasswordLinkAction } from './password-actions'
import { markMyQuoteRequest } from './quote-actions'

// Read per request: it depends on the session, and the build has no database. A page that reads
// the session is never shared nor stored (`private, no-store`, ticket 075).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon espace' }

/**
 * « Mon espace » is a summary (issue 1073; decision of 24/10/2026): where her page stands, how far it is filled and what
 * misses (each point a link to its block of the edit mode), her views, her quote requests, her account. Her profile is
 * changed in the edit mode (`/auth/apercu-profil?mode=edition`) and nowhere else: no editor of her photo, name, zone,
 * services, contacts or networks lives here. The page hands the browser plain text, nothing of the account nor of the
 * session.
 */
export default async function ProfilePage() {
	const artist = await requireArtist('/auth/profil')
	const context = await requestUser()
	const profile = context === null ? null : await artistProfile(context.payload, context.utilisateur)
	// An account that came without a profile (some accounts of the old site) gets one in the onboarding (ticket 140).
	if (context === null || profile === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	const progress = profileProgress(profile)
	// Her views of the last 30 days, once her page is published (ticket 1001): her own profile, found by her session.
	const myProfileId = profile.status === 'published' ? await profileId(context.payload, context.utilisateur) : null
	const myViews = myProfileId === null ? undefined : await readMyViews(context.payload, myProfileId)
	// Her quote requests (issue 1003): shown when the site offers the form, and as long as she holds one.
	const allProfileId = myProfileId ?? (await profileId(context.payload, context.utilisateur))
	const myQuotes = allProfileId === null ? [] : await readMyQuotes(context.payload, allProfileId)
	const showQuotes =
		(serverEnv().quoteRequests && profile.status === 'published') || myQuotes === null || myQuotes.length > 0
	const steps = remainingSteps(profile)
	// Not for a page the team hid, nor for the team's own account: the onboarding is not their next step.
	const showBanner = steps.premiere !== null && progress.etat !== 'masque' && progress.etat !== 'interne'
	// Her SIRET and where its check stands: for her eyes only (issue 1004).
	const activity = activityView(profile.siret, await readCheck(context.payload, profile.id))
	const available = isAvailable(profile.available)

	return (
		<main
			className={`${display.variable} ${body.variable} flex-1 bg-[#FAF7F5] px-4 py-8 font-body text-[#1A1417] sm:py-10`}
		>
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
				<RefreshSession expire={artist.expire} />
				<OverviewHeader
					greeting={`Bonjour ${greetingName({ firstName: profile.firstName, accountName: artist.name })}, tu es connectée.`}
				/>
				{showBanner && steps.premiere !== null ? (
					<OnboardingBanner reste={steps.reste} premiere={steps.premiere} />
				) : null}
				<OverviewStatus progress={progress} resume={saveMyAvailability} />
				{pageIsOnline(progress) && profile.slug ? <PageOnline adresse={publicAddress(profile.slug)} /> : null}
				<section
					aria-label="Ma disponibilité"
					data-testid="carte-disponibilite"
					className={`${CARD} flex flex-wrap items-start justify-between gap-3`}
				>
					<div className="flex min-w-0 flex-col gap-1">
						<h2 className={TITLE}>Disponibilité</h2>
						<p className="font-medium">{available ? AVAILABLE_TEXT : UNAVAILABLE_TEXT}</p>
						{available ? null : <p className={`text-sm ${SECONDARY}`}>{OUT_OF_SEARCH_TEXT}</p>}
					</div>
					<AvailabilitySwitch disponible={available} envoyer={saveMyAvailability} />
				</section>
				{myViews === undefined ? null : <MyViews jours={myViews} />}
				{showQuotes ? <QuoteRequests quotes={myQuotes} mark={markMyQuoteRequest} /> : null}
				<ActivitySummary view={activity} />
				<section aria-labelledby="mon-compte" data-testid="mon-compte" className="mt-2 flex flex-col gap-5">
					<h2 id="mon-compte" className={`${TITLE} px-1`}>
						Mon compte
					</h2>
					<SignOutCard />
					<PasswordChange
						mode={await readPasswordChangeMode(context.payload, artist.id)}
						envoyer={changeMyPasswordAction}
						demanderLien={requestSetPasswordLinkAction}
					/>
					<AccountDeletion mode={confirmationMode(context.utilisateur)} envoyer={deleteMyAccountAction} />
				</section>
			</div>
		</main>
	)
}
