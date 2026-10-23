import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignOutButtons } from '@/components/auth/SignOutButtons'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AvailabilitySwitch } from '@/components/dashboard/AvailabilitySwitch'
import { BulletsEditor } from '@/components/dashboard/BulletsEditor'
import { CollapsibleCards } from '@/components/dashboard/CollapsibleCards'
import { ContactDetailsEditor } from '@/components/dashboard/ContactDetailsEditor'
import { DescriptionEditor } from '@/components/dashboard/DescriptionEditor'
import { IdentityEditor } from '@/components/dashboard/IdentityEditor'
import { CoursesEditor, ExperiencesEditor, ServiceOffersEditor } from '@/components/dashboard/ListsEditors'
import { LocationEditor } from '@/components/dashboard/LocationEditor'
import { MainPhotoThumbnail } from '@/components/dashboard/MainPhotoThumbnail'
import { MyViews } from '@/components/dashboard/MyViews'
import { NetworksEditor } from '@/components/dashboard/NetworksEditor'
import { OnboardingBanner } from '@/components/dashboard/OnboardingBanner'
import { PageOnline } from '@/components/dashboard/PageOnline'
import { PasswordChange } from '@/components/dashboard/PasswordChange'
import { PhotoEditor } from '@/components/dashboard/PhotoEditor'
import { PortfolioEditor } from '@/components/dashboard/PortfolioEditor'
import { ProfileProgress } from '@/components/dashboard/ProfileProgress'
import { RefreshSession } from '@/components/dashboard/RefreshSession'
import { SectionCard } from '@/components/dashboard/SectionCard'
import { ViewLink } from '@/components/dashboard/ViewLink'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { isAvailable } from '@/lib/dashboard/availability'
import { listBullets } from '@/lib/dashboard/bullets'
import { type Card, FIRST_GROUP_TITLE, FURTHER_GROUP_TITLE, groupedCards, profileCards } from '@/lib/dashboard/cards'
import { readPasswordChangeMode } from '@/lib/dashboard/change-password'
import { COURSES } from '@/lib/dashboard/courses'
import { confirmationMode } from '@/lib/dashboard/deletion-confirmation'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import { greetingName } from '@/lib/dashboard/greeting'
import { profileRows } from '@/lib/dashboard/list'
import { locationValues } from '@/lib/dashboard/location'
import { artistProfile, profileId } from '@/lib/dashboard/my-profile'
import { readMyViews } from '@/lib/dashboard/my-views'
import { remainingSteps } from '@/lib/dashboard/onboarding'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { PREVIEW_PATH } from '@/lib/dashboard/preview'
import { pageIsOnline, profileProgress } from '@/lib/dashboard/progress'
import { publicAddress } from '@/lib/dashboard/public-address'
import { requestUser } from '@/lib/dashboard/request'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import { usageView } from '@/lib/photo-limits'
import { readPhotoUsage } from '@/lib/photo-usage'
import { text } from '@/lib/profile/display-name'
import { specialtyFormValues } from '@/lib/specialty'
import {
	saveMyAvailability,
	saveMyContactDetails,
	saveMyDescription,
	saveMyIdentity,
	saveMyLanguages,
	saveMyMainPicture,
	saveMyNetworks,
	saveMyPortfolio,
	saveMySkills,
} from './actions'
import { deleteMyAccountAction } from './deletion-actions'
import { saveMyCourses, saveMyExperiences, saveMyServiceOffers } from './lists-actions'
import { findMyCities, saveMyLocation } from './location-actions'
import { changeMyPasswordAction, requestSetPasswordLinkAction } from './password-actions'

// Read per request: it depends on the session, and the build has no database. A page that reads
// the session is never shared nor stored (`private, no-store`, ticket 075).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon espace' }

/**
 * The space of the makeup artist (tickets 118 and 119): one card per section of her profile, with
 * the value stored or « à compléter ». Each section plugs its button « Modifier » into its card as
 * it arrives. The page hands the browser plain text and the identity she edits, nothing of the
 * account nor of the session.
 */
export default async function ProfilePage() {
	const artist = await requireArtist('/auth/profil')
	const context = await requestUser()
	const profile = context === null ? null : await artistProfile(context.payload, context.utilisateur)
	// An account that came without a profile (some accounts of the old site) gets one in the onboarding (ticket 140).
	if (context === null || profile === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	const photos = await readDashboardPhotos(context.payload, profile)
	// What she stores and what the site allows (ticket 309): the volume used and the photos left.
	const usage = usageView(await readPhotoUsage(context.payload, artist.id))
	const progress = profileProgress(profile)
	// Her views of the last 30 days, once her page is published (ticket 1001): her own profile, found by her session.
	const myProfileId = profile.status === 'published' ? await profileId(context.payload, context.utilisateur) : null
	const myViews = myProfileId === null ? undefined : await readMyViews(context.payload, myProfileId)
	const steps = remainingSteps(profile)
	// Not for a page the team hid, nor for the team's own account: the onboarding is not their next step.
	const showBanner = steps.premiere !== null && progress.etat !== 'masque' && progress.etat !== 'interne'

	const allCards = profileCards(profile, photos)
	const cards = groupedCards(allCards)
	// The availability is a switch in the header, so its card is read apart from the groups.
	const [availability] = allCards.filter(carte => carte.section === 'disponibilite')

	/** The button « Modifier » of a card, or nothing for a card without an editor. */
	const actionOf = (carte: Card) =>
		carte.section === 'identite' ? (
			<IdentityEditor
				valeurs={{
					prenom: text(profile.firstName),
					nom: text(profile.lastName),
					nomArtiste: text(profile.artistName),
					...specialtyFormValues(profile),
				}}
				envoyer={saveMyIdentity}
				proprietaire={String(artist.id)}
			/>
		) : carte.section === 'description' ? (
			<DescriptionEditor valeurs={{ description: text(profile.description) }} envoyer={saveMyDescription} />
		) : carte.section === 'localisation' ? (
			<LocationEditor
				valeurs={locationValues(profile)}
				envoyer={saveMyLocation}
				chercher={findMyCities}
				revue={zoneReviewView(profile.zoneReview)}
			/>
		) : carte.section === 'langues' ? (
			<BulletsEditor liste="languages" puces={listBullets(profile.languages)} envoyer={saveMyLanguages} />
		) : carte.section === 'competences' ? (
			<BulletsEditor liste="skills" puces={listBullets(profile.skills)} envoyer={saveMySkills} />
		) : carte.section === 'photo' ? (
			<PhotoEditor photo={photos.photo} manquante={photos.principaleManquante} envoyer={saveMyMainPicture} />
		) : carte.section === 'portfolio' ? (
			<PortfolioEditor photos={photos.galerie} usage={usage} envoyer={saveMyPortfolio} />
		) : carte.section === 'reseaux' ? (
			<NetworksEditor
				valeurs={{
					instagram: text(profile.networks?.instagram),
					facebook: text(profile.networks?.facebook),
					youtube: text(profile.networks?.youtube),
					linkedin: text(profile.networks?.linkedin),
					siteWeb: text(profile.networks?.website),
				}}
				envoyer={saveMyNetworks}
			/>
		) : carte.section === 'coordonnees' ? (
			<ContactDetailsEditor
				valeurs={{
					telephone: text(profile.contactDetails?.phone),
					email: text(profile.contactDetails?.email),
					contactPublic: profile.publicContact === true,
				}}
				envoyer={saveMyContactDetails}
			/>
		) : carte.section === 'experiences' ? (
			<ExperiencesEditor lignes={profileRows(EXPERIENCES, profile)} envoyer={saveMyExperiences} />
		) : carte.section === 'formations' ? (
			<CoursesEditor lignes={profileRows(COURSES, profile)} envoyer={saveMyCourses} />
		) : carte.section === 'prestations' ? (
			<ServiceOffersEditor lignes={profileRows(SERVICE_OFFERS, profile)} envoyer={saveMyServiceOffers} />
		) : null

	/** One card of her space: the editor in its slot, and the thumbnail in place of the lines for the main photo. */
	const renderCard = (carte: Card) => (
		<SectionCard
			key={carte.section}
			carte={carte}
			action={actionOf(carte)}
			visuel={
				carte.section === 'photo' && photos.photo !== null ? <MainPhotoThumbnail photo={photos.photo} /> : undefined
			}
		/>
	)

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<RefreshSession expire={artist.expire} />
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p>Bonjour {greetingName({ firstName: profile.firstName, accountName: artist.name })}, tu es connectée.</p>
				<ViewLink
					vue="publique"
					href={PREVIEW_PATH}
					data-testid="voir-mon-profil-public"
					className="flex min-h-[44px] w-fit items-center rounded-lg px-2 font-semibold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
				>
					Voir mon profil public
				</ViewLink>
			</div>
			{availability === undefined ? null : (
				// The availability is a switch in the header (ticket 307). The test id is the one of the card it replaces.
				<section
					aria-label="Ma disponibilité"
					data-testid="carte-disponibilite"
					className="flex w-full min-w-0 flex-wrap items-start justify-between gap-3 rounded border border-neutral-300 bg-white p-4 sm:p-5"
				>
					<div className="flex min-w-0 flex-col gap-1">
						{availability.lignes.map(ligne => (
							<p
								key={ligne.valeur}
								className={ligne === availability.lignes[0] ? 'font-medium' : 'text-neutral-700 text-sm'}
							>
								{ligne.valeur}
							</p>
						))}
					</div>
					<AvailabilitySwitch disponible={isAvailable(profile.available)} envoyer={saveMyAvailability} />
				</section>
			)}
			{showBanner && steps.premiere !== null ? (
				<OnboardingBanner reste={steps.reste} premiere={steps.premiere} />
			) : null}
			<ProfileProgress avancement={progress} reprendre={saveMyAvailability} />
			{pageIsOnline(progress) && profile.slug ? <PageOnline adresse={publicAddress(profile.slug)} /> : null}
			{myViews === undefined ? null : <MyViews jours={myViews} />}
			<section aria-labelledby="groupe-premier" data-testid="groupe-premier" className="flex flex-col gap-5">
				<h2 id="groupe-premier" className="font-semibold text-neutral-700 text-lg">
					{FIRST_GROUP_TITLE}
				</h2>
				{cards.first.map(renderCard)}
			</section>
			<CollapsibleCards id="groupe-plus-loin" titre={FURTHER_GROUP_TITLE}>
				{cards.further.map(renderCard)}
			</CollapsibleCards>
			<section aria-labelledby="mon-compte" data-testid="mon-compte" className="mt-4 flex flex-col gap-4">
				<h2 id="mon-compte" className="font-semibold text-neutral-700 text-lg">
					Mon compte
				</h2>
				<div className="flex justify-center">
					<SignOutButtons />
				</div>
				<PasswordChange
					mode={await readPasswordChangeMode(context.payload, artist.id)}
					envoyer={changeMyPasswordAction}
					demanderLien={requestSetPasswordLinkAction}
				/>
				<AccountDeletion mode={confirmationMode(context.utilisateur)} envoyer={deleteMyAccountAction} />
			</section>
		</main>
	)
}
