import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateSkillsProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateSkillsProfil'

export function SkillsProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query
	const isPublic = !!publicView

	const user = props.user

	const [isModalOpen, setIsModalOpen] = React.useState(false)
	const handleIsModalOpen = () => {
		if (!isPublic) {
			setIsModalOpen(!isModalOpen)
		}
	}
	return (
		<div className={'relative w-full'}>
			<ModalUpdateSkillsProfil
				isModalOpen={isModalOpen}
				handleIsModalOpen={handleIsModalOpen}
				user={user}
			/>
			<div
				className={
					(!isPublic ? 'group relative' : '') +
					' flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8 '
				}
			>
				{!isPublic ? (
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
								'btn-alt-primary flex items-center gap-3 bg-white text-indigo-900'
							}
						>
							<span className="material-icons-round">edit</span>
							<span className={'font-semibold'}>Modifier vos compétences</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>Compétences</h2>
				<div className={'flex flex-wrap gap-4'}>
					{/* map on skills -> name */}
					{user?.skills.map((skill, index) => {
						return (
							<div
								key={index}
								className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
							>
								{skill.name}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
