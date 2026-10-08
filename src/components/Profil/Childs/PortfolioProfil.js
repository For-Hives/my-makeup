import React, { useEffect } from 'react'
import ModalUpdatePortfolioProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdatePortfolioProfil'
import { useRouter } from 'next/router'
import ViewPortfolioProfil from '@/components/Profil/Childs/Views/ViewPortfolioProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function PortfolioProfil(props) {
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
			<ModalUpdatePortfolioProfil
				isModalOpen={isModalOpen}
				handleIsModalOpen={handleIsModalOpen}
				handleUpdateUser={props.handleUpdateUser}
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
							dataCy="update-portefolio-button"
							onClick={handleIsModalOpen}
							libelle="Modifier votre portfolio"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewPortfolioProfil user={user} />
				</div>
			</div>
		</div>
	)
}
