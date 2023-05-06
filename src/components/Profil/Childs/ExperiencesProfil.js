import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateExperiencesProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateExperiencesProfil'

export function ExperiencesProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { view } = router.query
	const mode = !!view

	const user = props.user

	const [modalUpdateExperiencesProfil, setModalUpdateExperiencesProfil] =
		React.useState(false)
	const handleModalUpdateExperiencesProfil = () => {
		if (!mode) {
			setModalUpdateExperiencesProfil(!modalUpdateExperiencesProfil)
		}
	}
	return (
		<div className={'relative w-full'}>
			<ModalUpdateExperiencesProfil
				modalUpdateExperiencesProfil={modalUpdateExperiencesProfil}
				handleModalUpdateExperiencesProfil={handleModalUpdateExperiencesProfil}
				user={user}
			/>
			<div
				className={
					(!mode ? 'group relative' : '') +
					' flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8 '
				}
			>
				{!mode ? (
					<button
						onClick={handleModalUpdateExperiencesProfil}
						className={
							'absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-center opacity-0 ' +
							'bg-white/75 backdrop-blur-none group-hover:z-20 group-hover:opacity-100 ' +
							'pointer-events-none transition duration-300 group-hover:pointer-events-auto group-hover:backdrop-blur-[2px] ' +
							'user-select-none group-hover:user-select-auto focus:outline-none'
						}
					>
						<div
							className={
								'btn-alt-primary flex items-center gap-3 bg-white text-indigo-900'
							}
						>
							<span className="material-icons-round">edit</span>
							<span className={'font-semibold'}>Modifier vos expériences</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>
					Expériences professionnelles
				</h2>
				<div className={'flex flex-wrap gap-4'}>
					{/* map on experiences */}
					{
						// company
						// job_name
						// city
						// date_start
						// date_end
						// description
					}
					<div className={'flex flex-col gap-4'}>
						{user?.experiences?.map((experience, index) => {
							return (
								<div key={index} className={'flex w-full text-indigo-800'}>
									<span className="material-icons-round">apartment</span>
									<div className={'ml-2 flex w-full flex-col gap-2'}>
										<div className={'flex w-full flex-col'}>
											<p className={'font-semibold text-slate-700'}>
												{experience.company}
											</p>
											<div className={'flex justify-between'}>
												<p className={'text-sm italic text-slate-600'}>
													{experience.job_name}
												</p>
												<p className={'text-sm italic text-slate-600'}>
													{/* format date to month year ( like july 1998 )  */}
													{/*{experience.date_start} - {experience.date_end}*/}
													{new Date(experience.date_start).toLocaleString(
														'default',
														{
															year: 'numeric',
															month: 'long',
														}
													)}
													{' - '}
													{experience.date_end === null ||
													experience.date_end === ''
														? "Aujourd'hui"
														: new Date(experience.date_end).toLocaleString(
																'default',
																{
																	year: 'numeric',
																	month: 'long',
																}
														  )}
												</p>
											</div>
										</div>
										<div>
											<p className={'text-sm italic text-slate-500'}>
												{experience.description}
											</p>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				</div>
			</div>
		</div>
	)
}
