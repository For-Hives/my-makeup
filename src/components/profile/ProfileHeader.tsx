import Image from 'next/image'
import type { ReactNode } from 'react'
import { Icon } from '@/components/art/Icon'
import { ofName } from '@/lib/french-elision'
import { ratioMedia, sizesBox } from '@/lib/image-size'
import type { PublicProfile } from '@/services/public/profiles'
import { ActivityBadge } from './ActivityBadge'
import type { HeaderEdit } from './edit-slots'
import { ZoneText } from './ZoneText'

/** The photo shown when the profile has none: the picture of the site. */
export const DEFAULT_PHOTO = '/assets/pp_makeup.webp'

/** The side of the main photo, in px: the box is the same at every width. */
const PHOTO_SIDE = 200

function Dot({ disponible }: { disponible: boolean }) {
	const colors = disponible ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'
	return (
		<span className={`inline-flex items-center rounded-full px-5 py-2 font-medium text-sm ${colors}`}>
			<span
				aria-hidden="true"
				className={`-ml-1 mr-1.5 inline-block h-3 w-3 rounded-full bg-current ${disponible ? 'text-indigo-600' : 'text-red-600'}`}
			/>
			{disponible ? 'Prend de nouvelles dates' : 'Indisponible'}
		</span>
	)
}

function Marker() {
	return <Icon name="pin" className="h-6 w-6 shrink-0 text-indigo-900" />
}

/**
 * The top of the page of a profile, read from the server only (ticket 101): the only h1 of the page
 * is her name, then her speciality, her artist name when it adds something, her zone, her
 * availability and her main photo. A field she left empty is not shown. `action` is the button of
 * contact on a computer (ticket 290), under her zone. No postal address can
 * appear: the zone is a commune and a radius.
 */
export function ProfileHeader({
	profil,
	action,
	edit,
}: {
	profil: PublicProfile
	action?: ReactNode
	/** Her own page in edit mode (issue 1008): each block is wrapped by these functions. Nothing for a visitor. */
	edit?: HeaderEdit
}) {
	const { photo, nom: name } = profil
	const photoNode = (
		// A fixed box at every width, and a landscape photo is asked at the width it is drawn.
		<Image
			src={photo?.url ?? DEFAULT_PHOTO}
			alt={photo ? `Photo ${ofName(name)}` : ''}
			priority
			fetchPriority="high"
			fill
			sizes={sizesBox({
				largeur: PHOTO_SIDE,
				hauteur: PHOTO_SIDE,
				ratio: photo ? ratioMedia(photo) : 1,
			})}
			className="rounded-full object-cover"
		/>
	)
	const nameNodes = (
		<>
			<h1 className="max-w-full break-words font-bold text-3xl text-gray-800 tracking-tight">{name}</h1>
			{profil.specialite && (
				<p className="max-w-full break-words font-semibold text-gray-700 text-xl tracking-tight">{profil.specialite}</p>
			)}
			{profil.nomArtiste && (
				<p className="max-w-full break-words text-gray-800 text-lg tracking-tight">{profil.nomArtiste}</p>
			)}
		</>
	)
	const zoneNode = profil.zone ? (
		<p className="mt-2 flex max-w-full items-center gap-1 text-gray-700">
			<Marker />
			<span className="min-w-0 break-words">
				<ZoneText text={profil.zone} flags={profil.flags} />
			</span>
		</p>
	) : null
	const statusNode = <Dot disponible={profil.disponible} />
	return (
		<header className="bg-white px-4 pt-10 pb-12 shadow-xl sm:px-6 md:px-8">
			<div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 md:flex-row md:items-center">
				{edit ? edit.photo(photoNode) : <div className="relative h-[200px] w-[200px] shrink-0">{photoNode}</div>}
				<div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center md:items-start md:text-left">
					{edit ? edit.identity(nameNodes, { missingSpecialty: !profil.specialite }) : nameNodes}
					{edit ? edit.place(zoneNode) : zoneNode}
					{profil.activityVerified && <ActivityBadge checkedAt={profil.activityVerified.checkedAt} />}
					{action}
				</div>
				<div className="shrink-0">{edit ? edit.status(statusNode) : statusNode}</div>
			</div>
			{edit?.panel}
		</header>
	)
}
