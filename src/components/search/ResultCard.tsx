import Image from 'next/image'
import Link from 'next/link'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { Icon } from '@/components/art/Icon'
import { ActivityBadgePill } from '@/components/profile/ActivityBadge'
import { ZoneText } from '@/components/profile/ZoneText'
import { ofName } from '@/lib/french-elision'
import { formatFromShort } from '@/lib/price'
import type { ProfileCard } from '@/services/public/profiles'

/** The picture of a card whose artist has no photo yet: the one of the site online. */
export const DEFAULT_PHOTO = '/assets/pp_makeup.webp'

/**
 * A result of the search: her name, where she works, her offers and her photo. The whole card is one
 * link to the page of her profile, at its final address (`/profil/<slug>`). It holds nothing that is not
 * on the card of the list: no contact detail, no coordinate.
 *
 * On a phone (ticket 303) the card is a row of 140 px, a square photo then the lines, so that two or three
 * makeup artists fit in a screen; from 768 px it is a column with a 4:3 photo and the same lines. The
 * lines are her name, her zone, her speciality, her first two offers as chips and « dès 150 € » in indigo.
 *
 * `rang` is the rank of the card in a search: the click reports it. A card shown elsewhere (the page of
 * a speciality, an article) gives none, and its click reports nothing: the series of the search stays
 * the search.
 */
export function ResultCard({
	carte,
	prioritaire,
	rang,
}: {
	carte: ProfileCard
	prioritaire: boolean
	/** Rank (1-based) of the card in the whole list: the click reports it with the profile, nothing else. */
	rang?: number
}) {
	const photo = carte.photo
	const className =
		'card-hover flex w-full flex-row overflow-hidden rounded border border-gray-300 bg-white focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 md:flex-col'
	const content = (
		<>
			<div className="relative h-[140px] w-[140px] shrink-0 md:aspect-[4/3] md:h-auto md:w-full">
				<Image
					src={photo?.url ?? DEFAULT_PHOTO}
					alt={photo ? `Photo ${ofName(carte.nom)}` : ''}
					fill
					sizes="(min-width: 1536px) 16vw, (min-width: 768px) 33vw, 140px"
					priority={prioritaire}
					fetchPriority={prioritaire ? 'high' : undefined}
					className="card-zoom object-cover object-center"
				/>
				{carte.superMaquilleuse && (
					<div className="absolute top-0 left-0 flex items-center justify-center pt-2 md:pt-4">
						<div className="flex w-full items-center justify-center rounded-r-lg bg-fuchsia-700 px-2 py-0.5 text-center font-medium text-white text-xs italic shadow-xl md:px-3 md:py-1 md:text-sm">
							<Icon name="shield-check" className="mr-1 h-3.5 w-3.5 md:mr-2 md:h-4 md:w-4" />
							Pro
						</div>
					</div>
				)}
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1 p-3 md:gap-2 md:p-4">
				<h3 className="truncate font-extrabold text-base text-gray-900 md:text-xl">{carte.nom}</h3>
				<p className="flex min-w-0 flex-row items-center gap-1.5 text-gray-700 text-xs md:text-sm">
					<Icon name="pin" className="h-4 w-4 shrink-0 text-gray-500" />
					{/* An empty city is said, never left blank. */}
					<span className={`truncate ${carte.lieu ? 'font-semibold' : 'italic'}`}>
						{carte.lieu === null ? 'Zone non renseignée' : <ZoneText text={carte.lieu} flags={carte.flags} />}
					</span>
				</p>
				{carte.activityVerified && (
					<p>
						<ActivityBadgePill size="small" />
					</p>
				)}
				{carte.specialite && <p className="truncate text-gray-900 text-xs md:text-base">{carte.specialite}</p>}
				{carte.offerNames && (
					<ul className="flex flex-wrap gap-1.5" aria-label="Prestations">
						{carte.offerNames.map(name => (
							<li key={name} className="max-w-full truncate rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 text-xs">
								{name}
							</li>
						))}
					</ul>
				)}
				{carte.startingPrice !== undefined && (
					<p className="font-semibold text-indigo-700 text-sm md:text-base">{formatFromShort(carte.startingPrice)}</p>
				)}
				{/* Ticket 291: no way to reach her is said, and the card carries no contact button. */}
				{carte.unreachable && (
					<p className="rounded bg-gray-100 px-2 py-1 text-gray-700 text-xs md:px-3 md:py-2 md:text-sm">
						Coordonnées pas encore indiquées
					</p>
				)}
			</div>
		</>
	)
	const href = `/profil/${carte.slug}`
	return rang === undefined ? (
		<Link href={href} className={className}>
			{content}
		</Link>
	) : (
		<TrackedLink
			href={href}
			suivi={{ nom: 'search_result_click', proprietes: { rank: rang, pid: carte.pid } }}
			className={className}
		>
			{content}
		</TrackedLink>
	)
}
