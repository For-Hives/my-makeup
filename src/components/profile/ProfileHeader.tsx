import Image from 'next/image'
import { ratioMedia, sizesBoite } from '@/lib/taille-image'
import type { ProfilPublic } from '@/services/public/profiles'

/** The photo shown when the profile has none: the picture of the site. */
export const PHOTO_PAR_DEFAUT = '/assets/pp_makeup.webp'

/** The side of the main photo, in px: the box is the same at every width. */
const COTE_DE_LA_PHOTO = 200

function Pastille({ disponible }: { disponible: boolean }) {
	const couleurs = disponible ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'
	return (
		<span className={`inline-flex items-center rounded-full px-5 py-2 font-medium text-sm ${couleurs}`}>
			<svg
				className={`-ml-1 mr-1.5 h-3 w-3 ${disponible ? 'text-indigo-600' : 'text-red-600'}`}
				fill="currentColor"
				viewBox="0 0 16 16"
				aria-hidden="true"
			>
				<circle cx={8} cy={8} r={6} />
			</svg>
			{disponible ? 'Disponible' : 'Indisponible'}
		</span>
	)
}

function Repere() {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6 shrink-0 text-indigo-900">
			<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
		</svg>
	)
}

/**
 * The top of the page of a profile, read from the server only (ticket 101): the only h1 of the page
 * is her name, then her speciality, her artist name when it adds something, her zone, her
 * availability and her main photo. A field she left empty is not shown. No postal address can
 * appear: the zone is a commune and a radius.
 */
export function EnTeteDuProfil({ profil }: { profil: ProfilPublic }) {
	const { photo, nom } = profil
	return (
		<header className="bg-white px-4 pt-10 pb-12 shadow-xl sm:px-6 md:px-8">
			<div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 md:flex-row md:items-center">
				<div className="relative h-[200px] w-[200px] shrink-0">
					{/* A fixed box at every width, and a landscape photo is asked at the width it is drawn. */}
					<Image
						src={photo?.url ?? PHOTO_PAR_DEFAUT}
						alt={photo ? `Photo de ${nom}` : ''}
						priority
						fill
						sizes={sizesBoite({
							largeur: COTE_DE_LA_PHOTO,
							hauteur: COTE_DE_LA_PHOTO,
							ratio: photo ? ratioMedia(photo) : 1,
						})}
						className="rounded-full object-cover"
					/>
				</div>
				<div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center md:items-start md:text-left">
					<h1 className="max-w-full break-words font-bold text-3xl text-gray-800 tracking-tight">{nom}</h1>
					{profil.specialite && (
						<p className="max-w-full break-words font-semibold text-gray-700 text-xl tracking-tight">
							{profil.specialite}
						</p>
					)}
					{profil.nomArtiste && (
						<p className="max-w-full break-words text-gray-800 text-lg tracking-tight">{profil.nomArtiste}</p>
					)}
					{profil.zone && (
						<p className="mt-2 flex max-w-full items-center gap-1 text-gray-700">
							<Repere />
							<span className="min-w-0 break-words">{profil.zone}</span>
						</p>
					)}
				</div>
				<div className="shrink-0">
					<Pastille disponible={profil.disponible} />
				</div>
			</div>
		</header>
	)
}
