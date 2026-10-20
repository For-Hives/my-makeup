import Image from 'next/image'
import type { Pid } from '@/lib/analytics/events'
import type {
	ContactLink,
	PublicCourse,
	PublicExperience,
	PublicOption,
	PublicServiceOffer,
} from '@/lib/profile/public-view'
import { CHANNEL_LABELS } from '@/lib/profile/public-view'
import { ProfileSection } from './ProfileSection'
import { TrackedContactLink } from './TrackedContactLink'

/**
 * The cards of the page of a profile, one component each (ticket 102). They are server components
 * and show what they are given: the caller leaves out a card that has nothing to show, so a title is
 * never alone. A line of text is a paragraph; a list of things is a list.
 *
 * The rows never change place and never are reordered, so an index in a key is safe.
 */

/** A paragraph for each line typed. */
function Paragraphs({ lignes, className }: { lignes: readonly string[]; className: string }) {
	return lignes.map((ligne, rang) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: the lines are fixed text, never reordered
		<p key={`${rang}-${ligne}`} className={`break-words ${className}`}>
			{ligne}
		</p>
	))
}

export function SectionDescription({ lignes }: { lignes: readonly string[] }) {
	return (
		<ProfileSection titre="Vous en quelques mots">
			<Paragraphs lignes={lignes} className="text-gray-800" />
		</ProfileSection>
	)
}

export function LocationSection({ lieu, seDeplace, zone }: { lieu: string; seDeplace: boolean; zone: string | null }) {
	return (
		<ProfileSection titre="Localisation & département">
			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-gray-700 text-lg">Localisation</h3>
				<p className="break-words text-gray-800">{lieu}</p>
			</div>
			{seDeplace && zone && (
				<div className="flex flex-col gap-1">
					<h3 className="font-semibold text-gray-700 text-lg">Peut travailler chez vous à</h3>
					<p className="break-words text-gray-800">{zone}</p>
				</div>
			)}
		</ProfileSection>
	)
}

/** The icon of each channel: the files of the site online, in public/assets/brand. */
const ICONS: Readonly<Record<ContactLink['canal'], string>> = {
	instagram: '/assets/brand/037-instagram.svg',
	facebook: '/assets/brand/006-facebook.svg',
	linkedin: '/assets/brand/030-linkedin.svg',
	youtube: '/assets/brand/033-youtube.svg',
	email: '/assets/brand/050-email.svg',
	phone: '/assets/brand/051-phone.svg',
	website: '/assets/brand/052-website.svg',
}

/** Networks and websites open in a new tab; an email and a telephone do not. */
const NEW_TAB = new Set<ContactLink['canal']>(['instagram', 'facebook', 'linkedin', 'youtube', 'website'])

function ContactLinkAnchor({
	lien: { canal, libelle },
	href,
	pid,
	mesure,
}: {
	lien: ContactLink
	href: string
	pid: Pid | null
	mesure: boolean
}) {
	const properties = {
		href,
		...(NEW_TAB.has(canal) ? { target: '_blank' } : {}),
		rel: 'noopener nofollow noreferrer',
		className:
			'break-words text-indigo-900 underline [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2',
	}
	return mesure && pid !== null ? (
		<TrackedContactLink pid={pid} canal={canal} {...properties}>
			{libelle}
		</TrackedContactLink>
	) : (
		<a {...properties}>{libelle}</a>
	)
}

/**
 * `pid` and `mesure`: the links count their click (ticket 144). The preview of her own page does not
 * (`mesure` false), and a profile whose `pid` is unknown cannot be counted.
 */
export function SectionContacts({
	liens,
	pid,
	mesure = true,
}: {
	liens: readonly ContactLink[]
	pid: Pid | null
	mesure?: boolean
}) {
	return (
		<ProfileSection titre="Réseaux sociaux & contacts">
			<ul className="flex flex-col gap-3">
				{liens.map(({ canal, libelle, href }) => (
					<li key={canal} className="flex min-w-0 items-center gap-3 text-sm">
						{/* The name of the channel is written next to the icon: the icon only decorates. */}
						<Image src={ICONS[canal]} alt="" width={35} height={35} className="shrink-0" />
						<div className="min-w-0">
							<span className="block font-semibold text-gray-700">{CHANNEL_LABELS[canal]}</span>
							{href ? (
								<ContactLinkAnchor lien={{ canal, libelle, href }} href={href} pid={pid} mesure={mesure} />
							) : (
								<span className="break-words text-gray-700 [overflow-wrap:anywhere]">{libelle}</span>
							)}
						</div>
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}

export function SkillsSection({ competences }: { competences: readonly string[] }) {
	return (
		<ProfileSection titre="Compétences">
			<ul className="flex flex-wrap gap-3">
				{competences.map((nom, rang) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: a skill can be listed twice, and the rows never move
						key={`${rang}-${nom}`}
						className="rounded-full bg-indigo-100 px-3 py-2 font-medium text-indigo-700 text-xs [overflow-wrap:anywhere]"
					>
						{nom}
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}

export function LanguagesSection({ langues }: { langues: readonly string[] }) {
	return (
		<ProfileSection titre="Langues">
			<ul className="flex flex-col gap-3">
				{langues.map((nom, rang) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a language can be listed twice, and the rows never move
					<li key={`${rang}-${nom}`} className="break-words text-gray-700 text-sm">
						<span aria-hidden="true">→&nbsp;</span>
						{nom}
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}

export function CoursesSection({ formations }: { formations: readonly PublicCourse[] }) {
	return (
		<ProfileSection titre="Formations & diplômes">
			<ul className="flex flex-col gap-5">
				{formations.map(({ diploma, school, obtenu, description }, rang) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the rows never move
					<li key={`${rang}-${diploma}-${school}`} className="flex min-w-0 flex-col gap-1">
						{diploma && <p className="break-words font-semibold text-gray-700">{diploma}</p>}
						{(school || obtenu) && (
							<p className="flex flex-wrap justify-between gap-x-4 text-gray-600 text-sm italic">
								{school && <span className="break-words">{school}</span>}
								{obtenu && <span>{obtenu}</span>}
							</p>
						)}
						<Paragraphs lignes={description} className="text-gray-500 text-sm italic" />
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}

function PriceAndDescription({ element }: { element: PublicOption }) {
	if (element.description.length === 0 && element.prix.length === 0) return null
	return (
		<div className="flex flex-col gap-3">
			{element.description.length > 0 && (
				<div className="flex flex-col gap-1 border-gray-300 border-l pl-4">
					<Paragraphs lignes={element.description} className="text-gray-700" />
				</div>
			)}
			{element.prix.length > 0 && (
				<div className="flex flex-col items-end gap-2">
					{element.prix.map((ligne, rang) => (
						<p
							// biome-ignore lint/suspicious/noArrayIndexKey: the lines are fixed text, never reordered
							key={`${rang}-${ligne}`}
							className="max-w-full whitespace-pre-line break-words rounded-full bg-gray-50 px-3 py-2 text-right text-gray-500 text-md italic"
						>
							{ligne}
						</p>
					))}
				</div>
			)}
		</div>
	)
}

export function ServiceOffersSection({ prestations }: { prestations: readonly PublicServiceOffer[] }) {
	return (
		<ProfileSection titre="Service(s) proposé(s)">
			<ul className="flex flex-col gap-8">
				{prestations.map((prestation, rang) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the rows never move
					<li key={`${rang}-${prestation.nom}`} className="flex min-w-0 flex-col gap-4">
						<h3 className="break-words text-start font-bold text-indigo-900 text-lg">{prestation.nom}</h3>
						<PriceAndDescription element={prestation} />
						{prestation.options.length > 0 && (
							<div className="flex flex-col">
								{prestation.options.map((option, place) => (
									// The prices of an option are in the HTML closed too: a <details> shows its content to a search engine.
									// biome-ignore lint/suspicious/noArrayIndexKey: the rows never move
									<details key={`${place}-${option.nom}`} className="group border-gray-300 border-t py-4">
										<summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-gray-700 group-open:text-indigo-900 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2">
											<span className="min-w-0 break-words">{option.nom}</span>
											<svg
												viewBox="0 0 20 20"
												fill="currentColor"
												aria-hidden="true"
												className="h-5 w-5 shrink-0 transition-transform group-open:rotate-90"
											>
												<path
													fillRule="evenodd"
													d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
													clipRule="evenodd"
												/>
											</svg>
										</summary>
										<div className="pt-4">
											<PriceAndDescription element={option} />
										</div>
									</details>
								))}
							</div>
						)}
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}

export function SectionExperiences({ experiences }: { experiences: readonly PublicExperience[] }) {
	return (
		<ProfileSection titre="Expériences professionnelles">
			<ul className="flex flex-col gap-5">
				{experiences.map(({ company, jobTitle, city, periode, description }, rang) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the rows never move
					<li key={`${rang}-${company}-${jobTitle}`} className="flex min-w-0 flex-col gap-1">
						{company && <p className="break-words font-semibold text-gray-700">{company}</p>}
						{(jobTitle || periode) && (
							<p className="flex flex-wrap justify-between gap-x-4 text-gray-600 text-sm italic">
								{jobTitle && <span className="break-words">{jobTitle}</span>}
								{periode && <span>{periode}</span>}
							</p>
						)}
						{city && <p className="break-words text-gray-600 text-sm italic">à {city}</p>}
						<Paragraphs lignes={description} className="text-gray-500 text-sm italic" />
					</li>
				))}
			</ul>
		</ProfileSection>
	)
}
