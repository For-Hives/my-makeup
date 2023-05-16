import React from 'react'
import Image from 'next/image'
import { Stars } from '@/components/Profil/Atoms/Stars'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import ModalUpdateResumeProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateResumeProfil'
import { useRouter } from 'next/router'

function ResumeProfil(props) {
	const router = useRouter()
	const { publicView } = router.query

	const user = props.user
	const isPublic = !!publicView

	const [starsToDisplay, setStarsToDisplay] = React.useState(5)
	const [availability, setAvailability] = React.useState(!!user?.available)
	const [isModalOpen, setIsModalOpen] = React.useState(false)

	const handleAvailability = () => {
		setAvailability(!availability)
	}

	const handleIsModalOpen = () => {
		if (!isPublic) {
			setIsModalOpen(!isModalOpen)
		}
	}

	return (
		<div className={'relative bg-white pb-24 shadow-xl'}>
			<ModalUpdateResumeProfil
				isModalOpen={isModalOpen}
				handleIsModalOpen={handleIsModalOpen}
				user={user}
			/>
			<div className="mx-auto max-w-7xl pt-[90px]">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'relative col-span-2 flex items-center'}>
						{!isPublic ? (
							<button
								className={
									'absolute left-0 top-0 flex h-full w-full flex-col items-center justify-center rounded-full bg-indigo-700/0 text-white/0 transition hover:bg-indigo-700/25 hover:text-white'
								}
								onClick={handleIsModalOpen}
							>
								<span className="material-icons-round">add_a_photo</span>
								<p className={'text-sm font-semibold'}>modifier votre photo</p>
							</button>
						) : null}
						<Image
							src={user?.main_picture?.url}
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
							<div
								className={
									'flex w-full flex-col gap-2' +
									(!isPublic ? ' cursor-pointer' : ' cursor-default')
								}
								onClick={handleIsModalOpen}
							>
								<h3
									className={'text-3xl font-bold tracking-tight text-slate-800'}
								>
									{user?.first_name} {user?.last_name}
								</h3>
								<h2
									className={
										'text-xl font-semibold tracking-tight text-slate-700'
									}
								>
									{user?.speciality}
								</h2>
							</div>
							<div>
								<div className={'flex items-center'}>
									<span className="material-icons-round text-indigo-900">
										directions_run
									</span>
									peut se déplacer à {user?.city} & dans un rayon de{' '}
									{user?.action_radius}km
								</div>
							</div>
							<div className={'flex flex-row items-center gap-4'}>
								<Stars starsToDisplay={user?.score} />{' '}
								<span className={'text-sm italic'}>( {user?.score} avis )</span>
							</div>
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
