import React from 'react'
import Image from 'next/image'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import ModalUpdateResumeProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateResumeProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'
import { villePublique } from '@/lib/profil/lieu-public'

function ResumeProfil(props) {
	// the profile and the view of the page (src/pages/auth/profil.js), never
	// copied here: the name, the badge and the picture show what the API
	// stored (UI-01), in the same view as the cards (UI-02)
	const user = props.user
	const isPublic = props.isPublic
	const [isModalOpen, setIsModalOpen] = React.useState(false)
	const availability = !!user?.available
	const profilPicture = user?.main_picture?.url || '/assets/pp_makeup.webp'

	// opens in the edit view only, an open modal always closes
	const handleIsModalOpen = () => {
		if (isModalOpen || !isPublic) setIsModalOpen(!isModalOpen)
	}

	return (
		<div className={'relative bg-white px-4 pb-24 shadow-xl md:px-8 2xl:px-0'}>
			<ModalUpdateResumeProfil
				isModalOpen={isModalOpen}
				handleIsModalOpen={handleIsModalOpen}
				handleUpdateUser={props.handleUpdateUser}
				user={user}
			/>
			<div className="mx-auto max-w-7xl pt-[90px]">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div
						className={
							'relative col-span-12 flex items-center justify-center xl:col-span-2 xl:justify-start'
						}
					>
						{!isPublic ? (
							<button
								type="button"
								data-cy="update-picture-button"
								aria-label="Modifier votre photo de profil"
								className={
									'absolute left-1/2 top-0 z-10 flex h-[200px] w-[200px] -translate-x-1/2 flex-col items-center justify-center rounded-full text-white/0 transition hover:bg-indigo-700/25 hover:text-white xl:left-0 xl:translate-x-0 ' +
									'focus-visible:bg-indigo-700/40 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2'
								}
								onClick={handleIsModalOpen}
							>
								<span className="material-icons-round" aria-hidden="true">
									add_a_photo
								</span>
								<span className={'text-sm font-semibold'}>
									modifier votre photo
								</span>
							</button>
						) : null}
						<Image
							src={profilPicture}
							alt={'ppmakeup'}
							width={500}
							height={500}
							className={'h-[200px] w-[200px] rounded-full object-cover'}
						></Image>
					</div>
					<div
						className={
							'col-span-12 flex items-center md:col-span-8 xl:col-span-7'
						}
					>
						<div
							className={
								'flex h-full w-full flex-col justify-between py-8 md:py-0 md:pl-20'
							}
						>
							<div className={'flex w-full flex-col gap-2'}>
								<h3
									className={'text-3xl font-bold tracking-tight text-gray-800'}
									data-cy="resume-name"
								>
									{user?.first_name} {user?.last_name}
								</h3>
								<h2
									className={
										'text-xl font-semibold tracking-tight text-gray-700'
									}
									data-cy="resume-speciality"
								>
									{user?.speciality}
								</h2>
								<h3
									className={'text-lg tracking-tight text-gray-800'}
									data-cy="resume-company-artist-name"
								>
									{user?.company_artist_name}
								</h3>
								{!isPublic ? (
									<div className={'mt-2'}>
										<BoutonModifier
											dataCy="update-resume-button"
											onClick={handleIsModalOpen}
											libelle="Modifier vos informations personnelles"
										/>
									</div>
								) : null}
							</div>
							<div>
								<div className={'flex items-center gap-2'}>
									<span className="material-icons-round text-indigo-900">
										directions_run
									</span>
									<span data-cy={'resume-city-action-radius'}>
										peut se déplacer à{' '}
										{isPublic ? villePublique(user?.city) : user?.city} & dans
										un rayon de {user?.action_radius}km
									</span>
								</div>
							</div>
							<div></div>
							{/*<div className={'flex flex-row items-center gap-4'}>*/}
							{/*	<Stars starsToDisplay={user?.score} />{' '}*/}
							{/*	/!* todo connect the score to the number of reviews *!/*/}
							{/*	<span className={'text-sm italic'}>( {user?.score} avis )</span>*/}
							{/*</div>*/}
						</div>
					</div>
					<div className={'col-span-3 flex items-center'}>
						<div
							className={
								'flex h-full w-full flex-col items-start justify-between'
							}
						>
							<div className={'flex items-center gap-5'}>
								{availability ? (
									<>
										<BadgeDispo />
									</>
								) : (
									<>
										<BadgeIndispo />
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ResumeProfil
