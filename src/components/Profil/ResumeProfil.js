import React from 'react'
import Image from 'next/image'
import { Stars } from '@/components/Profil/Stars'
import { BadgeDispo } from '@/components/Profil/BadgeDispo'
import { useSession } from 'next-auth/react'
import _ from 'lodash'
import { BadgeIndispo } from '@/components/Profil/BadgeIndispo'

// Head : General
// left
// - Photo principale
// middle
// - Nom Prénom
// - Spécialité principale
// - Ville principale et rayon d'action
// - Nombre de missions réalisées
// - Note moyenne ( avis google + avis internes , moyenne entre les deux ou un truc du genre )
// - Nombre de recommandations
// Head : infos complémentaires
// right
// - Badge de disponibilité
// - Date de disponibilité
// - Boutton d'édition de la disponibilité

function ResumeProfil(props) {
	const user = props.user
	const [starsToDisplay, setStarsToDisplay] = React.useState(5)

	return (
		<div className={'bg-white pb-20 shadow-xl'}>
			<div className="mx-auto max-w-7xl pt-[90px]">
				<div className={'grid grid-cols-12 gap-5 pt-[100px]'}>
					<div className={'col-span-2 flex items-center'}>
						<Image
							src={user.main_picture.url}
							alt={'ppmakeup'}
							width={500}
							height={500}
							className={'h-[200px] w-[200px] rounded-full object-cover'}
						></Image>
					</div>
					<div className={'col-span-7 flex items-center'}>
						<div
							className={'flex h-full w-full flex-col justify-between pl-20'}
						>
							<div className={'flex w-full flex-col gap-2'}>
								<h3
									className={'text-3xl font-bold tracking-tight text-slate-800'}
								>
									{user.first_name} {user.last_name}
								</h3>
								<h2
									className={
										'text-xl font-semibold tracking-tight text-slate-700'
									}
								>
									{user.speciality}
								</h2>
							</div>
							<div>
								<div className={'flex items-center'}>
									<span className="material-symbols-rounded text-indigo-900">
										directions_run
									</span>
									peut se déplacer à {user.city} & dans un rayon de{' '}
									{user.action_radius}km
								</div>
								{/*<div className={'flex items-center gap-4'}>*/}
								{/*	<div className={'text-sm font-semibold'}>*/}
								{/*		{'12'} missions réalisées*/}
								{/*	</div>*/}
								{/*</div>*/}
							</div>
							<div className={'flex flex-row items-center gap-4'}>
								<Stars starsToDisplay={user.score} />{' '}
								<span className={'text-sm italic'}>( {user.score} avis )</span>
							</div>
						</div>
					</div>
					<div className={'col-span-3 flex items-center'}>
						<div
							className={
								'flex h-full w-full flex-col items-start justify-between'
							}
						>
							<div className={'flex flex-col gap-5'}>
								{user.available ? (
									<>
										<BadgeIndispo />
										{/*<div className={'text-sm font-semibold text-slate-900/90'}>*/}
										{/*	{'Disponible à partir du ' + '01/01/2021'}*/}
										{/*</div>*/}
									</>
								) : (
									<>
										<BadgeDispo />
									</>
								)}

								<button className={'btn-primary'}>
									Editer ma disponibilité
								</button>
							</div>
							<div>
								<a
									href="#"
									className={'flex gap-2 font-semibold text-indigo-900 '}
								>
									<span className="material-symbols-rounded text-indigo-900">
										visibility
									</span>
									{/* todo : switch vision du profil */}
									<span className={'hover:underline'}>
										Voir mon profil public
									</span>
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ResumeProfil
