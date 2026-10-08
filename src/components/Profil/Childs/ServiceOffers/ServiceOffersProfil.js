import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ModalUpdateServiceOffersProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateServiceOffersProfil'
import ViewServiceOffersProfil from '@/components/Profil/Childs/Views/ViewServiceOffersProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function ServiceOffersProfil(props) {
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
			<ModalUpdateServiceOffersProfil
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
							dataCy="update-service-offers-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos prestations"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewServiceOffersProfil user={user} />
				</div>
			</div>
		</div>
	)
}
