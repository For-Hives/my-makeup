import React from 'react'
import { useRouter } from 'next/router'
import ModalUpdateLanguageProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLanguageProfil'

export function LanguageProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { view } = router.query
	const mode = !!view

	const user = props.user

	const [modalUpdateLanguageProfil, setModalUpdateLanguageProfil] =
		React.useState(false)
	const handleModalUpdateLanguageProfil = () => {
		if (!mode) {
			setModalUpdateLanguageProfil(!modalUpdateLanguageProfil)
		}
	}
	return (
		<div className={'relative w-full'}>
			<ModalUpdateLanguageProfil
				modalUpdateLanguageProfil={modalUpdateLanguageProfil}
				handleModalUpdateLanguageProfil={handleModalUpdateLanguageProfil}
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
						onClick={handleModalUpdateLanguageProfil}
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
								Modifier vos langues parlées
							</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>Langues</h2>
				<ul className={'flex flex-col gap-4'}>
					{/* map on language -> name */}
					{user?.language?.map((language, index) => {
						return (
							<li key={index} className={'text-slate-700'}>
								→&nbsp;
								<div className="inline-flex flex-nowrap items-center rounded-full px-3 py-2 text-sm font-medium text-slate-700">
									{language.name}
								</div>
							</li>
						)
					})}
				</ul>
			</div>
		</div>
	)
}
