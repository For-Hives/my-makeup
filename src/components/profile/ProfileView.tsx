import { formatFrom } from '@/lib/price'
import { contactActions, contactName } from '@/lib/profile/contact-actions'
import { rows } from '@/lib/profile/public-view'
import { travelSentence } from '@/lib/profile/travel-sentence'
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
	TravelSection,
} from './ProfileSections'

/**
 * The place of each block on a phone (ticket 304; audit UX, improvement 5): contact, prices, portfolio,
 * « À propos », the zone in a sentence, then what is folded. Whole class names, so that Tailwind finds them.
 */
const PHONE_ORDER = {
	contact: 'order-1 w-full min-w-0 md:order-none',
	services: 'order-2 w-full min-w-0 md:order-none',
	portfolio: 'order-3 w-full min-w-0 md:order-none',
	about: 'order-4 w-full min-w-0 md:order-none',
	travel: 'order-5 w-full min-w-0 md:order-none',
	skills: 'order-6 w-full min-w-0 md:order-none',
	languages: 'order-7 w-full min-w-0 md:order-none',
	courses: 'order-8 w-full min-w-0 md:order-none',
	experiences: 'order-9 w-full min-w-0 md:order-none',
} as const

/**
 * The content of the page of a profile (tickets 101 to 103): the top, then the cards that have
 * something to show, in two columns as on the site today. A card with nothing to show is left out,
 * title included. It reads the profile it is given and nothing else, so a test renders it without a
 * database, and the HTML of the server holds all of it. `mesure` false: the contact links count no click
 * (the preview of her own page, ticket 144).
 */
export function ProfileView({ profil, mesure = true }: { profil: PublicProfile; mesure?: boolean }) {
	const description = rows(profil.description)
	const travel = travelSentence(profil)
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
				{/*
				 * The HTML is in the order of a computer: left column, then right column. On a phone the two
				 * columns melt into one (`contents`) and each block takes the place of PHONE_ORDER (`order-N`),
				 * so that the prices come before the skills; on a computer `md:order-none` puts every block
				 * back in the order of the HTML. Only CSS moves: what a search engine reads does not.
				 */}
				<div className="flex flex-col gap-5 md:grid md:grid-cols-12">
					<div className="contents md:col-span-4 md:flex md:min-w-0 md:flex-col md:items-start md:gap-5">
						{travel !== null && (
							<div className={PHONE_ORDER.travel}>
								<TravelSection phrase={travel} />
							</div>
						)}
						{profil.liens.length > 0 && (
							<div className={PHONE_ORDER.contact}>
								<SectionContacts liens={profil.liens} pid={profil.pid} mesure={mesure} />
							</div>
						)}
						{profil.competences.length > 0 && (
							<div className={PHONE_ORDER.skills}>
								<SkillsSection competences={profil.competences} />
							</div>
						)}
						{profil.langues.length > 0 && (
							<div className={PHONE_ORDER.languages}>
								<LanguagesSection langues={profil.langues} />
							</div>
						)}
						{profil.formations.length > 0 && (
							<div className={PHONE_ORDER.courses}>
								<CoursesSection formations={profil.formations} />
							</div>
						)}
					</div>
					<div className="contents md:col-span-8 md:flex md:min-w-0 md:flex-col md:items-start md:gap-5">
						{description.length > 0 && (
							<div className={PHONE_ORDER.about}>
								<SectionDescription lignes={description} />
							</div>
						)}
						{profil.galerie.length > 0 && (
							<div className={PHONE_ORDER.portfolio}>
								<ProfileSection titre="Portfolio">
									<ProfileGallery photos={profil.galerie} nom={profil.nom} />
								</ProfileSection>
							</div>
						)}
						{profil.prestations.length > 0 && (
							<div className={PHONE_ORDER.services}>
								<ServiceOffersSection prestations={profil.prestations} />
							</div>
						)}
						{profil.experiences.length > 0 && (
							<div className={PHONE_ORDER.experiences}>
								<SectionExperiences experiences={profil.experiences} />
							</div>
						)}
					</div>
				</div>
			</div>
			{/* Stuck to the bottom of the screen on a phone, and stopped by the end of the page: it never covers the footer. */}
			{actions.length > 0 && contact('bar')}
		</main>
	)
}
