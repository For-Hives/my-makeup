import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ModalUpdateDescriptionProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateDescriptionProfil'
import ViewDescriptionProfil from '@/components/Profil/Childs/Views/ViewDescriptionProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function DescriptionProfil(props) {
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
			<ModalUpdateDescriptionProfil
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
							dataCy="update-description-button"
							onClick={handleIsModalOpen}
							libelle="Modifier votre description"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewDescriptionProfil user={user} />
				</div>
			</div>
		</div>
	)
}
