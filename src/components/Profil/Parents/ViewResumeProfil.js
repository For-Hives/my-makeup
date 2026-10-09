import Image from 'next/image'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import { DevisButton } from '@/components/Profil/Atoms/DevisButton'
import { attributs, nomAffiche, nomComplet, photoPrincipale, texte, zoneProfil } from '@/lib/profil/vue-publique'
import { ratioMedia, sizesBoite } from '@/lib/taille-image'

/** Box of the main photo, in px (h-[200px] w-[200px] at every width) */
const COTE_PHOTO = 200

/**
 * Header of a public profile, read from the props only (UI-06): the server
 * HTML holds the name in the only h1 of the page, the speciality and the
 * zone; nothing is shown for an empty field.
 */
function ViewResumeProfil(props) {
	const user = attributs(props.user)
	const nom = nomAffiche(user)
	const photo = photoPrincipale(user)
	const specialite = texte(user.speciality)
	const nomArtiste = texte(user.company_artist_name)
	const zone = zoneProfil(user)
	const seDeplace = zone.includes(' km autour')

	return (
		<div className={'relative bg-white px-4 pb-24 shadow-xl md:px-8 2xl:px-0'}>
			<div className="mx-auto max-w-7xl pt-[90px]">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'relative col-span-12 flex items-center justify-center xl:col-span-2 xl:justify-start'}>
						<div className={'relative h-[200px] w-[200px]'}>
							{/* UI-09: the box is 200 px at every width (it said 150 px on
							    a phone), and a landscape photo is drawn wider than it. Default
							    quality (75): this photo is the LCP of a profile on a phone, and
							    the right width is enough (q85 weighs 1.6 times as much) */}
							<Image
								src={photo?.url ?? '/assets/pp_makeup.webp'}
								alt={photo ? `Photo de ${nom}` : ''}
								priority={true}
								fill={true}
								sizes={sizesBoite({
									largeur: COTE_PHOTO,
									hauteur: COTE_PHOTO,
									ratio: photo ? ratioMedia(photo) : 1,
								})}
								className={'rounded-full object-cover'}
							></Image>
						</div>
					</div>
					<div className={'col-span-12 flex items-center md:col-span-8 xl:col-span-7'}>
						<div className={'flex h-full w-full flex-col justify-between py-8 md:py-0 md:pl-20'}>
							<div className={'flex w-full cursor-default flex-col gap-2'}>
								<h1 className={'text-3xl font-bold tracking-tight text-gray-800'} data-cy="resume-name">
									{nom}
								</h1>
								{specialite && (
									<p className={'text-xl font-semibold tracking-tight text-gray-700'} data-cy="resume-speciality">
										{specialite}
									</p>
								)}
								{nomArtiste && nomArtiste !== nom && nomComplet(user) && (
									<p className={'text-lg tracking-tight text-gray-800'} data-cy="resume-company-artist-name">
										{nomArtiste}
									</p>
								)}
							</div>
							{zone && (
								<div className={'mt-2 xl:m-0'}>
									<div className={'flex items-center gap-1'}>
										<span className="material-icons-round text-indigo-900" aria-hidden="true">
											{seDeplace ? 'directions_run' : 'location_on'}
										</span>
										<span data-cy={'resume-city-action-radius'}>{zone}</span>
									</div>
								</div>
							)}
						</div>
					</div>
					<div className={'col-span-12 flex items-center md:col-span-3'}>
						<div className={'flex h-full w-full flex-col items-start justify-between gap-4'}>
							<div className={'flex cursor-default items-center gap-5'}>
								{user.available === false ? <BadgeIndispo /> : <BadgeDispo />}
							</div>
							{/* from the page props, so the button is in the server HTML */}
							<DevisButton formUrl={props.devisUrl ?? null} slug={props.slug ?? user.username} pid={props.user?.id} />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ViewResumeProfil
