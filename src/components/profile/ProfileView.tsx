import { rows } from '@/lib/profile/public-view'
import type { PublicProfile } from '@/services/public/profiles'
import { ProfileHeader } from './ProfileHeader'
import { ProfileGallery } from './ProfileGallery'
import { ProfileSection } from './ProfileSection'
import {
	SkillsSection,
	SectionContacts,
	SectionDescription,
	SectionExperiences,
	CoursesSection,
	LanguagesSection,
	LocationSection,
	ServiceOffersSection,
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
	return (
		<main className="flex flex-1 flex-col">
			<ProfileHeader profil={profil} />
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-8">
				<div className="grid grid-cols-12 gap-5">
					<div className="col-span-12 flex min-w-0 flex-col items-start gap-5 md:col-span-4">
						{profil.lieu && <LocationSection lieu={profil.lieu} seDeplace={profil.seDeplace} zone={profil.zone} />}
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
		</main>
	)
}
