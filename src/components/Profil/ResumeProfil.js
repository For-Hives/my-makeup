import React from 'react'
import Image from 'next/image'
import { Stars } from '@/components/Profil/Stars'
import { BadgeDispo } from '@/components/Profil/BadgeDispo'
import { useSession } from 'next-auth/react'
import { useQuery } from 'react-query'
import { fetchApi } from '@/services/api'

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
	const [starsToDisplay, setStarsToDisplay] = React.useState(5)

	// get current user id
	const { data: session } = useSession()
	// get current user data
	const { isLoading, isError, data, error } = useQuery('makeup-artiste', () =>
		fetchApi('/makeup-artiste/' + session.user.id ? session.user.id : 1)
	)

	return (
		<div className="mx-auto max-w-7xl pt-[90px]">
			<div className={'grid grid-cols-12 gap-5 pt-[100px]'}>
				<div className={'col-span-2 flex items-center'}>
					<Image
						src={'/assets/pp_makeup_2.png'}
						alt={'ppmakeup'}
						width={500}
						height={500}
						className={'h-[200px] w-[200px] rounded-full object-cover'}
					></Image>
				</div>
				<div className={'col-span-7 flex items-center'}>
					<div className={'flex h-full w-full flex-col justify-between pl-20'}>
						<div className={'flex w-full flex-col gap-2'}>
							<h3
								className={'text-3xl font-bold tracking-tight text-slate-800'}
							>
								{session
									? 'Bonjour ' +
									  (session.user.name ? session.user.name : session.user.email)
									: 'Se connecter'}
							</h3>
							<h2
								className={
									'text-xl font-semibold tracking-tight text-slate-700'
								}
							>
								{/* todo : Maquilleuse poste */}
								{'Spécialité de maquilleuse principale'}
							</h2>
						</div>
						<div>
							<div className={'flex items-center'}>
								<span className="material-symbols-rounded text-indigo-900">
									directions_run
								</span>
								peut se déplacer à {'[ville]'} & dans un rayon de {'50km'}
							</div>
							<div className={'flex items-center gap-4'}>
								<div className={'text-sm font-semibold'}>
									{'12'} missions réalisées
								</div>

								<div
									className={
										'flex items-center text-xs italic text-indigo-900/50'
									}
								></div>
							</div>
						</div>
						<div className={'flex flex-row items-center gap-4'}>
							<Stars starsToDisplay={starsToDisplay} />{' '}
							<span className={'text-sm italic'}>( 5 avis )</span>
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
							<BadgeDispo />
							<div className={'text-sm font-semibold text-slate-900/90'}>
								{
									// todo : Date de disponibilité
									'Disponible à partir du ' + '01/01/2021'
								}
							</div>
							<button className={'btn-primary'}>Editer ma disponibilité</button>
						</div>
						<div>
							<a
								href="#"
								className={'flex gap-2 font-semibold text-indigo-900 '}
							>
								<span className="material-symbols-rounded text-indigo-900">
									visibility
								</span>
								<span className={'hover:underline'}>
									Voir mon profil public
								</span>
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ResumeProfil
