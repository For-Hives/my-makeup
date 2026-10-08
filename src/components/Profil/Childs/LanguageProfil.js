import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ModalUpdateLanguageProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLanguageProfil'
import ViewLanguageProfil from '@/components/Profil/Childs/Views/ViewLanguageProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function LanguageProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query
	const user = props.user

	const [isModalOpen, setIsModalOpen] = React.useState(false)
	const [isPublic, setIsPublic] = React.useState(props.isPublic)

	const handleIsModalOpen = () => {
		if (!isPublic) {
			setIsModalOpen(!isModalOpen)
		}
	}
	useEffect(() => {
		setIsPublic(!!publicView)
	}, [])

	useEffect(() => {
		setIsPublic(props.isPublic)
	}, [props.isPublic])

	return (
		<div className={'relative w-full'}>
			<ModalUpdateLanguageProfil
				isModalOpen={isModalOpen}
				handleUpdateUser={props.handleUpdateUser}
				handleIsModalOpen={handleIsModalOpen}
				user={user}
			/>
			<div
				className={
					'relative flex w-full flex-col gap-4 rounded border border-gray-300 bg-white p-8'
				}
			>
				{!isPublic ? (
					<div className={'-mr-4 -mt-4 flex justify-end'}>
						<BoutonModifier
							dataCy="update-languages-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos langues parlées"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewLanguageProfil user={user} />
				</div>
			</div>
		</div>
	)
}
