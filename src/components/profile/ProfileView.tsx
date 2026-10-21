import { formatFrom } from '@/lib/price'
import { contactActions, contactName } from '@/lib/profile/contact-actions'
import { rows } from '@/lib/profile/public-view'
import type { PublicProfile } from '@/services/public/profiles'
import { ContactButton } from './ContactButton'
import { ProfileGallery } from './ProfileGallery'
import { ProfileHeader } from './ProfileHeader'
import { ProfileSection } from './ProfileSection'
import {
	CoursesSection,
	LanguagesSection,
	SectionContacts,
	SectionDescription,
	SectionExperiences,
	ServiceOffersSection,
	SkillsSection,
} from './ProfileSections'

/**
 * The content of the page of a profile (tickets 101 to 103): the top, then the cards that have
 * something to show, in two columns as on the site today. A card with nothing to show is left out,
 * title included. It reads the profile it is given and nothing else, so a test renders it without a
 * database, and the HTML of the server holds all of it. `mesure` false: the contact links count no click
 * (the preview of her own page, ticket 144).
 */
export function ProfileView({ profil, mesure = true }: { profil: PublicProfile; mesure?: boolean }) {
	const description = rows(profil.description)
	// The button of contact: one per way of reaching her that leads somewhere, none when there is no way.
	const name = contactName(profil)
	const actions = contactActions(profil.liens, name)
	const contact = (placement: 'header' | 'bar') => (
		<ContactButton
			placement={placement}
			name={name}
			price={placement === 'bar' ? formatFrom(profil.prixMinimal) || null : null}
			actions={actions}
			pid={profil.pid}
			mesure={mesure}
		/>
	)
	return (
		<main className="flex flex-1 flex-col">
			<ProfileHeader profil={profil} action={actions.length > 0 ? contact('header') : undefined} />
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-8">
				<div className="grid grid-cols-12 gap-5">
					<div className="col-span-12 flex min-w-0 flex-col items-start gap-5 md:col-span-4">
						{profil.liens.length > 0 && <SectionContacts liens={profil.liens} pid={profil.pid} mesure={mesure} />}
						{profil.competences.length > 0 && <SkillsSection competences={profil.competences} />}
						{profil.langues.length > 0 && <LanguagesSection langues={profil.langues} />}
						{profil.formations.length > 0 && <CoursesSection formations={profil.formations} />}
					</div>
					<div className="col-span-12 flex min-w-0 flex-col items-start gap-5 md:col-span-8">
						{description.length > 0 && <SectionDescription lignes={description} />}
						{profil.galerie.length > 0 && (
							<ProfileSection titre="Portfolio">
								<ProfileGallery photos={profil.galerie} nom={profil.nom} />
							</ProfileSection>
						)}
						{profil.prestations.length > 0 && <ServiceOffersSection prestations={profil.prestations} />}
						{profil.experiences.length > 0 && <SectionExperiences experiences={profil.experiences} />}
					</div>
				</div>
			</div>
			{/* Stuck to the bottom of the screen on a phone, and stopped by the end of the page: it never covers the footer. */}
			{actions.length > 0 && contact('bar')}
		</main>
	)
}
