import type { ReactNode } from 'react'
import { type QuoteAction, QuoteRequestForm } from '@/components/quote/QuoteRequestForm'
import { formatFrom } from '@/lib/price'
import { contactActions, contactName, subjectOf } from '@/lib/profile/contact-actions'
import { type ContactLink, rows } from '@/lib/profile/public-view'
import { travelSentence } from '@/lib/profile/travel-sentence'
import type { PublicProfile } from '@/services/public/profiles'
import { ContactButton } from './ContactButton'
import type { BodyEdit, ProfileEdit } from './edit-slots'
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
	activity: 'order-10 w-full min-w-0 md:order-none',
} as const

/**
 * The content of the page of a profile (tickets 101 to 103): the top, then the cards that have
 * something to show, in two columns as on the site today. A card with nothing to show is left out,
 * title included. It reads the profile it is given and nothing else, so a test renders it without a
 * database, and the HTML of the server holds all of it. `mesure` false: the contact links count no click
 * (the preview of her own page, ticket 144).
 */
export function ProfileView({
	profil,
	mesure = true,
	edit,
	quote,
}: {
	profil: PublicProfile
	mesure?: boolean
	/**
	 * The quote request form (issue 1003), given by the page only when the site offers it and this profile takes
	 * requests (src/lib/quote/shown.ts). Never given on her own page.
	 */
	quote?: { action: QuoteAction; siteKey?: string }
	/** Her own page in edit mode (issue 1008): the blocks she can change. Never given on the public page. */
	edit?: ProfileEdit
}) {
	const description = rows(profil.description)
	const travel = travelSentence(profil)
	// The button of contact: one per way of reaching her that leads somewhere, none when there is no way.
	const name = contactName(profil)
	const actions = contactActions(profil.liens, name)
	// A block is drawn when it has something to show. On her own page (edit mode) it is drawn anyway when
	// it can be changed, with an invitation in place of its content: the slot gets `null`.
	const body = edit?.body
	const block = (key: keyof BodyEdit, order: string, read: ReactNode | null) => {
		const wrap = body?.[key]
		if (wrap) return <div className={order}>{wrap(read)}</div>
		return read === null ? null : <div className={order}>{read}</div>
	}
	// Networks and contact details are two blocks on her page, one card for the visitor.
	const split = body?.networks !== undefined || body?.contacts !== undefined
	const isNetwork = (link: ContactLink) => link.canal !== 'email' && link.canal !== 'phone'
	const contactsCard = (links: readonly ContactLink[], title?: string) =>
		links.length > 0 ? (
			<SectionContacts liens={links} pid={profil.pid} mesure={mesure} {...(title ? { titre: title } : {})} />
		) : null
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
			<ProfileHeader
				profil={profil}
				action={actions.length > 0 ? contact('header') : undefined}
				{...(edit ? { edit: edit.header } : {})}
			/>
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-8">
				{/*
				 * The HTML is in the order of a computer: left column, then right column. On a phone the two
				 * columns melt into one (`contents`) and each block takes the place of PHONE_ORDER (`order-N`),
				 * so that the prices come before the skills; on a computer `md:order-none` puts every block
				 * back in the order of the HTML. Only CSS moves: what a search engine reads does not.
				 */}
				<div className="flex flex-col gap-5 md:grid md:grid-cols-12">
					<div className="contents md:col-span-4 md:flex md:min-w-0 md:flex-col md:items-start md:gap-5">
						{block('travel', PHONE_ORDER.travel, travel !== null ? <TravelSection phrase={travel} /> : null)}
						{split ? (
							<>
								{block(
									'networks',
									PHONE_ORDER.contact,
									contactsCard(profil.liens.filter(isNetwork), 'Réseaux sociaux')
								)}
								{block(
									'contacts',
									PHONE_ORDER.contact,
									contactsCard(
										profil.liens.filter(link => !isNetwork(link)),
										'Contacts'
									)
								)}
							</>
						) : (
							block('contacts', PHONE_ORDER.contact, contactsCard(profil.liens))
						)}
						{block(
							'skills',
							PHONE_ORDER.skills,
							profil.competences.length > 0 ? <SkillsSection competences={profil.competences} /> : null
						)}
						{block(
							'languages',
							PHONE_ORDER.languages,
							profil.langues.length > 0 ? <LanguagesSection langues={profil.langues} /> : null
						)}
						{block('activity', PHONE_ORDER.activity, null)}
						{block(
							'courses',
							PHONE_ORDER.courses,
							profil.formations.length > 0 ? <CoursesSection formations={profil.formations} /> : null
						)}
					</div>
					<div className="contents md:col-span-8 md:flex md:min-w-0 md:flex-col md:items-start md:gap-5">
						{block(
							'about',
							PHONE_ORDER.about,
							description.length > 0 ? <SectionDescription lignes={description} /> : null
						)}
						{block(
							'gallery',
							PHONE_ORDER.portfolio,
							profil.galerie.length > 0 ? (
								<ProfileSection titre="Portfolio">
									<ProfileGallery photos={profil.galerie} nom={profil.nom} />
								</ProfileSection>
							) : null
						)}
						{block(
							'services',
							PHONE_ORDER.services,
							profil.prestations.length > 0 ? <ServiceOffersSection prestations={profil.prestations} /> : null
						)}
						{profil.experiences.length > 0 && (
							<div className={PHONE_ORDER.experiences}>
								<SectionExperiences experiences={profil.experiences} />
							</div>
						)}
					</div>
				</div>
			</div>
			{quote && (
				<div id="devis" className="mx-auto w-full max-w-7xl scroll-mt-4 px-4 pb-8 sm:px-6 md:px-8">
					<ProfileSection titre="Demander un devis">
						<p className="text-gray-700">
							{`Indiquez la date, le lieu et le type de prestation : ${subjectOf(name)} vous répond directement.`}
						</p>
						<QuoteRequestForm
							action={quote.action}
							slug={profil.slug}
							{...(quote.siteKey !== undefined && { siteKey: quote.siteKey })}
						/>
					</ProfileSection>
				</div>
			)}
			{/* Stuck to the bottom of the screen on a phone, and stopped by the end of the page: it never covers the footer. */}
			{actions.length > 0 && contact('bar')}
		</main>
	)
}
