import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateCoursesProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateCoursesProfil'

export function CoursesProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { view } = router.query
	const mode = !!view

	const user = props.user

	const [modalUpdateCoursesProfil, setModalUpdateCoursesProfil] =
		React.useState(false)
	const handleModalUpdateCoursesProfil = () => {
		if (!mode) {
			setModalUpdateCoursesProfil(!modalUpdateCoursesProfil)
		}
	}
	return (
		<div className={'relative w-full'}>
			<ModalUpdateCoursesProfil
				modalUpdateCoursesProfil={modalUpdateCoursesProfil}
				handleModalUpdateCoursesProfil={handleModalUpdateCoursesProfil}
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
						onClick={handleModalUpdateCoursesProfil}
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
							<span className={'font-semibold'}>
								Modifier vos diplômes & formations
							</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>
					Formations & diplomes
				</h2>
				<div className={'flex flex-col gap-4'}>
					{user?.courses?.map((course, index) => {
						return (
							<div key={index} className={'flex text-slate-700'}>
								<span className="material-icons-round text-indigo-900">
									school
								</span>
								<div className={'ml-2 flex w-full flex-col gap-2'}>
									<div className={'flex flex-col'}>
										<p className={'font-semibold text-slate-700'}>
											{course.diploma}
										</p>
										<div className={'flex w-full justify-between'}>
											<p className={'text-sm italic text-slate-600'}>
												{course.school}
											</p>
											<p className={'text-sm italic text-slate-600'}>
												{course.date_graduation}
											</p>
										</div>
									</div>
									<div>
										{
											// display the user description
											// if \n is present, split the string and display each part in a new line
											course.course_description.split('\n').map((item, i) => {
												return (
													<p
														key={i}
														className={'text-sm italic text-slate-500'}
													>
														{item}
													</p>
												)
											})
										}
									</div>
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
