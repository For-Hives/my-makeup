import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { ActivityBadgePill } from '@/components/profile/ActivityBadge'
import { ZoneText } from '@/components/profile/ZoneText'
import { DEFAULT_PHOTO } from '@/components/search/ResultCard'
import { ofName } from '@/lib/french-elision'
import { formatFromShort } from '@/lib/price'
import type { ProfileCard as ProfileCardData } from '@/services/public/profiles'
import { type ArchBand, ArchImage } from './ArchImage'
import type { Tint } from './CapsuleImage'
import { Icon } from './graphics'

export interface ProfileCardCommonProps {
	/** The same data the search and « Mise en avant » cards take (`src/services/public/profiles.ts`). */
	profile: ProfileCardData
	/** The picture of the first cards of a page loads early; the others are lazy. */
	priority?: boolean
	/** Rank (1-based) in a search: the click reports it with the profile. A card shown elsewhere gives none. */
	rank?: number
	headingLevel?: 2 | 3
	tint?: Tint
	band?: ArchBand
}

/** The name of the card, as the one link that stretches over the card (so the whole card is a target, and a screen reader hears the name only). */
function NameLink({ profile, rank, children }: { profile: ProfileCardData; rank?: number; children: ReactNode }) {
	const className =
		'after:absolute after:inset-0 after:z-10 focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-4 hover:no-underline'
	const href = `/profil/${profile.slug}`
	return rank === undefined ? (
		<Link href={href} className={className}>
			{children}
		</Link>
	) : (
		<TrackedLink
			href={href}
			suivi={{ nom: 'search_result_click', proprietes: { rank, pid: profile.pid } }}
			className={className}
		>
			{children}
		</TrackedLink>
	)
}

function photoOf(profile: ProfileCardData) {
	return { src: profile.photo?.url ?? DEFAULT_PHOTO, alt: profile.photo ? `Photo ${ofName(profile.nom)}` : '' }
}

/** Where she works, and when she cannot be reached yet: the lines both cards share. */
function Facts({ profile }: { profile: ProfileCardData }) {
	return (
		<>
			<p className="flex min-w-0 items-center gap-1.5 text-[15px] text-mute">
				<Icon name="pin" className="h-4 w-4 flex-none text-indigo-700" />
				{/* An empty zone is said, never left blank. */}
				<span className={profile.lieu ? 'font-semibold' : 'italic'}>
					{profile.lieu === null ? 'Zone non renseignée' : <ZoneText text={profile.lieu} flags={profile.flags} />}
				</span>
			</p>
			{profile.activityVerified && (
				<p>
					<ActivityBadgePill size="small" />
				</p>
			)}
			{profile.specialite && <p className="text-ink">{profile.specialite}</p>}
			{profile.offerNames && (
				<ul className="flex flex-wrap gap-2" aria-label="Prestations">
					{profile.offerNames.map(name => (
						<li
							key={name}
							className="max-w-full truncate rounded-full border border-hairline px-3.5 py-1 font-medium text-[13.5px] text-mute"
						>
							{name}
						</li>
					))}
				</ul>
			)}
			{profile.unreachable && (
				<p className="rounded-xl bg-nude-100 px-3 py-2 text-mute text-sm">Coordonnées pas encore indiquées</p>
			)}
		</>
	)
}

function Price({ profile }: { profile: ProfileCardData }) {
	if (profile.startingPrice === undefined) return <span />
	return <p className="font-display font-medium text-2xl text-ink">{formatFromShort(profile.startingPrice)}</p>
}

/** The round arrow at the foot of a card: it shows the card leads somewhere; the name is the link. */
function GoArrow() {
	return (
		<span
			aria-hidden="true"
			className="inline-flex size-11 flex-none items-center justify-center rounded-full border border-ink text-ink transition-colors group-hover:bg-ink group-hover:text-white"
		>
			<Icon name="arrow-right" className="art-arrow h-5 w-5" />
		</span>
	)
}

function Pro() {
	return (
		<span className="absolute bottom-4 left-3.5 z-[3] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-indigo-900 text-xs">
			<Icon name="seal" className="h-3.5 w-3.5" />
			Pro
		</span>
	)
}

/**
 * The vertical profile card of the kit: the photo in an arch with its offset band, the name in Bodoni, where she works,
 * her speciality and her first offers as chips, and « dès 150 € » with a round arrow. Server component. It takes the
 * data of the search card (no new field, no contact detail) and keeps its rules: the whole card is one link to
 * `/profil/<slug>` (the name), the click is reported only when `rank` is given, an empty zone and a profile nobody can
 * reach yet are said in words. A list wraps it in `<li className="reveal">`.
 */
export function ProfileCard({
	profile,
	priority = false,
	rank,
	headingLevel = 3,
	tint = 'blush',
	band = 'band',
}: ProfileCardCommonProps) {
	const Heading = headingLevel === 2 ? 'h2' : 'h3'
	const photo = photoOf(profile)
	return (
		<article data-profile-card className="card-hover group relative flex flex-col gap-5 rounded-art-frame p-1.5">
			<div className="relative">
				<ArchImage
					src={photo.src}
					alt={photo.alt}
					tint={tint}
					band={band}
					priority={priority}
					sizes="(min-width: 1536px) 22vw, (min-width: 768px) 30vw, 80vw"
				/>
				{profile.superMaquilleuse && <Pro />}
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
				<Heading className="font-display font-medium text-[28px] text-ink leading-[1.1]">
					<NameLink profile={profile} rank={rank}>
						{profile.nom}
					</NameLink>
				</Heading>
				<Facts profile={profile} />
				<div className="mt-1.5 flex items-center justify-between gap-4 border-hairline border-t pt-4">
					<Price profile={profile} />
					<GoArrow />
				</div>
			</div>
		</article>
	)
}

/**
 * The horizontal profile card (a row of a list): a small arch photo, the name, her facts, and on the right the price
 * with the arrow. Under 720 px the price drops under the text, on a hairline. Same data, same rules as `ProfileCard`.
 */
export function ProfileRowCard({
	profile,
	priority = false,
	rank,
	headingLevel = 3,
	tint = 'blush',
	band = 'band',
}: ProfileCardCommonProps) {
	const Heading = headingLevel === 2 ? 'h2' : 'h3'
	const photo = photoOf(profile)
	return (
		<article
			data-profile-row-card
			className="card-hover group relative grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-[18px] gap-y-3.5 rounded-card border border-nude-200 bg-white p-[18px] md:grid-cols-[148px_minmax(0,1fr)_auto] md:gap-x-7 md:py-[22px] md:pr-7 md:pl-[22px]"
		>
			<div className="relative">
				<ArchImage
					src={photo.src}
					alt={photo.alt}
					tint={tint}
					band={band}
					size="sm"
					mark="plus"
					priority={priority}
					sizes="148px"
				/>
				{profile.superMaquilleuse && <Pro />}
			</div>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5">
				<Heading className="font-display font-medium text-[22px] text-ink leading-[1.1] md:text-[26px]">
					<NameLink profile={profile} rank={rank}>
						{profile.nom}
					</NameLink>
				</Heading>
				<Facts profile={profile} />
			</div>
			<div className="col-span-full flex items-center justify-between gap-4 border-hairline border-t pt-3.5 md:col-span-1 md:grid md:justify-items-end md:border-t-0 md:pt-0 md:text-right">
				<Price profile={profile} />
				<GoArrow />
			</div>
		</article>
	)
}

/** The props of a card as a component takes them, for a page that passes them on. */
export type ProfileCardProps = ComponentProps<typeof ProfileCard>
