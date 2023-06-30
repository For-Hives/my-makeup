import React, { useEffect } from 'react'
import Image from 'next/image'
import { Stars } from '@/components/Profil/Atoms/Stars'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import ModalUpdateResumeProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateResumeProfil'
import { useRouter } from 'next/router'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'

function ResumeProfil(props) {
	const router = useRouter()
	const { publicView } = router.query

	const [user, setUser] = React.useState(props.user)
	const isPublic = !!publicView

	const [starsToDisplay, setStarsToDisplay] = React.useState(5)
	const [availability, setAvailability] = React.useState(!!user?.available)
	const [isModalOpen, setIsModalOpen] = React.useState(false)
	const [profilPicture, setProfilePicture] = React.useState(
		user?.main_picture?.url
	)

	const handleAvailability = () => {
		setAvailability(!availability)
	}

	const handleProfilPicture = pp => {
		setProfilePicture(pp)
	}

	const handleIsModalOpen = () => {
		if (!isPublic) {
			setIsModalOpen(!isModalOpen)
		}
		setUser(props.user)
	}

	const handleUpdateUser = user => {
		props.handleUpdateUser(user)
		setAvailability(!!user?.available)
	}

	useEffect(() => {
		setAvailability(!!user?.available)
	}, [user])

	return (
		<div
			className={
				'group relative bg-white px-4 pb-24 shadow-xl md:px-8 2xl:px-0'
			}
		>
			{!isPublic && (
				<button
					onClick={handleIsModalOpen}
					className={
						'absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-center opacity-0 ' +
						'bg-white/75 backdrop-blur-none group-hover:z-20 group-hover:opacity-100 ' +
						'pointer-events-none transition duration-300 group-hover:pointer-events-auto group-hover:backdrop-blur-[2px] ' +
						'user-select-none group-hover:user-select-auto focus:outline-none'
					}
				>
					<div
						className={
							'btn-alt-primary mt-[90px] flex items-center gap-3 bg-white text-indigo-900'
						}
					>
						<span className="material-icons-round">edit</span>
						<span className={'font-semibold'}>
							Modifier vos informations personnelles
						</span>
					</div>
				</button>
			)}
			<ModalUpdateResumeProfil
				isModalOpen={isModalOpen}
				handleIsModalOpen={handleIsModalOpen}
				handleProfilPicture={handleProfilPicture}
				handleUpdateUser={handleUpdateUser}
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
								className={
									'absolute left-0 top-0 flex h-full w-full flex-col items-center justify-center rounded-full text-white/0 transition hover:text-white xl:bg-indigo-700/0 xl:hover:bg-indigo-700/25'
								}
								onClick={handleIsModalOpen}
							>
								<span className="material-icons-round">add_a_photo</span>
								<p className={'text-sm font-semibold'}>modifier votre photo</p>
							</button>
						) : null}

						{user && user?.main_picture && user?.main_picture?.url ? (
							<Image
								src={profilPicture}
								alt={'ppmakeup'}
								width={500}
								height={500}
								className={'h-[200px] w-[200px] rounded-full object-cover'}
							></Image>
						) : (
							<Image
								src={'/assets/pp_makeup.webp'}
								alt={'ppmakeup'}
								width={500}
								height={500}
								className={'h-[200px] w-[200px] rounded-full object-cover'}
							></Image>
						)}
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
							<div
								className={
									'flex w-full flex-col gap-2' +
									(!isPublic ? ' cursor-pointer' : ' cursor-default')
								}
								onClick={handleIsModalOpen}
							>
								<h3
									className={'text-3xl font-bold tracking-tight text-gray-800'}
								>
									{user?.first_name} {user?.last_name}
								</h3>
								<h2
									className={
										'text-xl font-semibold tracking-tight text-gray-700'
									}
								>
									{user?.speciality}
								</h2>
								<h3 className={'text-lg tracking-tight text-gray-800'}>
									{user?.company_artist_name}
								</h3>
							</div>
							<div>
								<div className={'flex items-center gap-2'}>
									<span className="material-icons-round text-indigo-900">
										directions_run
									</span>
									peut se déplacer à {user?.city} & dans un rayon de{' '}
									{user?.action_radius}km
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
							<div
								className={
									'flex items-center gap-5' +
									(!isPublic ? ' cursor-pointer' : ' cursor-default')
								}
								onClick={handleIsModalOpen}
							>
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
