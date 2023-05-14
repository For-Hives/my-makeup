import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateDescriptionProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateDescriptionProfil'

export function DescriptionProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query
	const isPublic = !!publicView

	const user = props.user

	const [modalUpdateDescriptionProfil, setModalUpdateDescriptionProfil] =
		React.useState(false)
	const handleModalUpdateDescriptionProfil = () => {
		if (!isPublic) {
			setModalUpdateDescriptionProfil(!modalUpdateDescriptionProfil)
		}
	}
	return (
		<div className={'relative w-full'}>
			<ModalUpdateDescriptionProfil
				modalUpdateDescriptionProfil={modalUpdateDescriptionProfil}
				handleModalUpdateDescriptionProfil={handleModalUpdateDescriptionProfil}
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
						onClick={handleModalUpdateDescriptionProfil}
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
								Modifier votre description
							</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>
					Vous en quelques mots
				</h2>
				{
					// display the user description
					// if \n is present, split the string and display each part in a new line
					user?.description.split('\n').map((item, i) => {
						return (
							<p key={i} className={'text-slate-800'}>
								{item}
							</p>
						)
					})
				}
			</div>
		</div>
	)
}
