import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignOutButtons } from '@/components/auth/SignOutButtons'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AvailabilitySwitch } from '@/components/dashboard/AvailabilitySwitch'
import { BulletsEditor } from '@/components/dashboard/BulletsEditor'
import { ContactDetailsEditor } from '@/components/dashboard/ContactDetailsEditor'
import { DescriptionEditor } from '@/components/dashboard/DescriptionEditor'
import { IdentityEditor } from '@/components/dashboard/IdentityEditor'
import { CoursesEditor, ExperiencesEditor, ServiceOffersEditor } from '@/components/dashboard/ListsEditors'
import { LocationEditor } from '@/components/dashboard/LocationEditor'
import { NetworksEditor } from '@/components/dashboard/NetworksEditor'
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
import { profileCards } from '@/lib/dashboard/cards'
import { COURSES } from '@/lib/dashboard/courses'
import { confirmationMode } from '@/lib/dashboard/deletion-confirmation'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import { profileRows } from '@/lib/dashboard/list'
import { locationValues } from '@/lib/dashboard/location'
import { artistProfile } from '@/lib/dashboard/my-profile'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { PREVIEW_PATH } from '@/lib/dashboard/preview'
import { profileProgress } from '@/lib/dashboard/progress'
import { requestUser } from '@/lib/dashboard/request'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import { text } from '@/lib/profile/display-name'
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

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<RefreshSession expire={artist.expire} />
			<p>Bonjour {text(artist.nom) || 'toi'}, tu es connectée.</p>
			{profile === null ? null : (
				<>
					<ViewLink
						vue="publique"
						href={PREVIEW_PATH}
						data-testid="voir-mon-profil-public"
						className="flex min-h-[44px] w-fit items-center rounded-lg px-2 font-semibold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
					>
						Voir mon profil public
					</ViewLink>
					<ProfileProgress avancement={profileProgress(profile)} />
					{profileCards(profile).map(carte => (
						<SectionCard
							key={carte.section}
							carte={carte}
							action={
								carte.section === 'identite' ? (
									<IdentityEditor
										valeurs={{
											prenom: text(profile.firstName),
											nom: text(profile.lastName),
											nomArtiste: text(profile.artistName),
											specialite: text(profile.specialty),
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
								) : carte.section === 'disponibilite' ? (
									<AvailabilitySwitch disponible={isAvailable(profile.available)} envoyer={saveMyAvailability} />
								) : carte.section === 'langues' ? (
									<BulletsEditor liste="languages" puces={listBullets(profile.languages)} envoyer={saveMyLanguages} />
								) : carte.section === 'competences' ? (
									<BulletsEditor liste="skills" puces={listBullets(profile.skills)} envoyer={saveMySkills} />
								) : carte.section === 'photo' ? (
									<PhotoEditor photo={photos.photo} envoyer={saveMyMainPicture} />
								) : carte.section === 'portfolio' ? (
									<PortfolioEditor photos={photos.galerie} envoyer={saveMyPortfolio} />
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
							}
						/>
					))}
				</>
			)}
			<div className="mt-4 flex justify-center">
				<SignOutButtons />
			</div>
			<AccountDeletion
				mode={context === null ? 'mot-de-passe' : confirmationMode(context.utilisateur)}
				envoyer={deleteMyAccountAction}
			/>
		</main>
	)
}
