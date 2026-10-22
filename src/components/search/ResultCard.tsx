import Image from 'next/image'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { ZoneText } from '@/components/profile/ZoneText'
import { ofName } from '@/lib/french-elision'
import type { ProfileCard } from '@/services/public/profiles'

/** The picture of a card whose artist has no photo yet: the one of the site online. */
export const DEFAULT_PHOTO = '/assets/pp_makeup.webp'

function TravelIcon() {
	return (
		<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-white">
			<path d="M288 117C311 117 330 98 330 74C330 51 311 32 288 32C264 32 245 51 245 74C245 98 264 117 288 117ZM220 373L232 320L277 362L277 469C277 481 287 490 298 490C310 490 320 481 320 469L320 349C320 337 315 326 307 318L275 288L288 224C311 250 344 269 381 275C394 277 405 267 405 254C405 243 397 234 387 233C355 227 328 208 313 183L292 149C284 136 271 128 256 128C249 128 245 130 239 130L154 166C138 172 128 188 128 205L128 256C128 267 137 277 149 277C161 277 170 267 170 256L170 204L209 189L175 362L91 345C80 343 68 350 66 362L66 363C64 374 71 385 83 388L170 405C193 410 215 396 220 373Z" />
		</svg>
	)
}

function FlameIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			aria-hidden="true"
			className="mr-2 h-4 w-4 text-white"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"
			/>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"
			/>
		</svg>
	)
}

/**
 * A result of the search: her name, her speciality, where she works and her photo. The whole card is
 * one link to the page of her profile, at its final address (`/profil/<slug>`). It holds nothing that
 * is not on the card of the list: no contact detail, no coordinate.
 */
export function ResultCard({
	carte,
	prioritaire,
	rang,
}: {
	carte: ProfileCard
	prioritaire: boolean
	/** Rank (1-based) of the card in the whole list: the click reports it with the profile, nothing else. */
	rang: number
}) {
	const photo = carte.photo
	return (
		<TrackedLink
			href={`/profil/${carte.slug}`}
			suivi={{ nom: 'search_result_click', proprietes: { rank: rang, pid: carte.pid } }}
			className="flex w-full flex-col items-center rounded border border-gray-300 bg-white focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
		>
			<div className="relative h-[350px] w-full">
				<Image
					src={photo?.url ?? DEFAULT_PHOTO}
					alt={photo ? `Photo ${ofName(carte.nom)}` : ''}
					fill
					sizes="(min-width: 1536px) 16vw, (min-width: 768px) 33vw, 100vw"
					priority={prioritaire}
					className="rounded-t rounded-b-none object-cover object-center"
				/>
				{carte.superMaquilleuse && (
					<div className="absolute top-0 left-0 flex items-center justify-center pt-4">
						<div className="flex w-full items-center justify-center rounded-r-lg bg-fuchsia-700 px-3 py-1 text-center font-medium text-sm text-white italic shadow-xl">
							<FlameIcon />
							Pro
						</div>
					</div>
				)}
				<div className="absolute bottom-0 left-0 flex w-full flex-col bg-gradient-to-t from-black to-black/0 p-4">
					<h3 className="font-extrabold text-2xl text-white">{carte.nom}</h3>
					<p className="flex flex-row items-center gap-2 font-light text-sm text-white">
						<TravelIcon />
						{/* An empty city is said, never left blank. */}
						<span className={carte.lieu ? 'font-bold' : 'italic'}>
							{carte.lieu === null ? 'Zone non renseignée' : <ZoneText text={carte.lieu} flags={carte.flags} />}
						</span>
					</p>
				</div>
			</div>
			<div className="flex w-full flex-col gap-4 p-4 pt-6">
				{carte.specialite && <p className="font-bold text-gray-900 text-lg">{carte.specialite}</p>}
				{/* Ticket 291: no way to reach her is said, and the card carries no contact button. */}
				{carte.unreachable && (
					<p className="rounded bg-gray-100 px-3 py-2 text-gray-700 text-sm">Coordonnées pas encore indiquées</p>
				)}
			</div>
		</TrackedLink>
	)
}
