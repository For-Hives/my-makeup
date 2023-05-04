import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateResumeProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateResumeProfil'
import ModalUpdateLocationProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLocationProfil'

export function LocationProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { view } = router.query
	const mode = !!view

	const user = props.user

	const [modalUpdateLocationProfil, setModalUpdateLocationProfil] =
		React.useState(false)
	const handleModalUpdateLocationProfil = () => {
		if (!mode) {
			setModalUpdateLocationProfil(!modalUpdateLocationProfil)
		}
	}
	return (
		<div className={'w-full'}>
			<ModalUpdateLocationProfil
				modalUpdateLocationProfil={modalUpdateLocationProfil}
				handleModalUpdateLocationProfil={handleModalUpdateLocationProfil}
				user={user}
			/>
			<div
				className={
					(!mode ? 'group relative' : '') +
					' flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
				}
			>
				{!mode ? (
					<button
						onClick={handleModalUpdateLocationProfil}
						className={
							'absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-center opacity-0 ' +
							'bg-white/75 backdrop-blur-none group-hover:z-20 group-hover:opacity-100 ' +
							'pointer-events-none transition duration-300 group-hover:pointer-events-auto group-hover:backdrop-blur-[2px] ' +
							'user-select-none group-hover:user-select-auto'
						}
					>
						<div
							className={
								'btn-alt-primary flex items-center gap-3 bg-white text-indigo-900'
							}
						>
							<span className="material-symbols-rounded">edit</span>
							<span className={'font-semibold'}>
								Modifier vos informations de localisation
							</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>
					Localisation & département
				</h2>
				<div className={'flex gap-2'}>
					<span className="material-symbols-rounded text-lg text-indigo-900">
						location_on
					</span>
					<div className={'flex flex-col gap-2'}>
						<h3 className={'text-lg font-semibold text-slate-700'}>
							Localisation
						</h3>
						<p className={'text-slate-800'}>{props.user?.city}</p>
					</div>
				</div>
				<div className={'flex gap-2'}>
					<span className="material-symbols-rounded text-lg text-indigo-900">
						<span className="material-symbols-outlined">directions_run</span>
					</span>
					<div className={'flex flex-col gap-2'}>
						<h3 className={'text-lg font-semibold text-slate-700'}>
							Peut travailer chez vous à
						</h3>
						<p className={'text-slate-800'}>
							{props.user?.city} & {props.user?.action_radius}km autour
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
