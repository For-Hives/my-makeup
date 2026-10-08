import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ModalUpdateLocationProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLocationProfil'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function LocationProfil(props) {
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
		<div className={'w-full'}>
			<ModalUpdateLocationProfil
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
							dataCy="update-location-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos informations de localisation"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					{/* her own space: what she typed, and the help (UI-11) */}
					<ViewLocationProfil user={user} prive={!isPublic} />
				</div>
			</div>
		</div>
	)
}
