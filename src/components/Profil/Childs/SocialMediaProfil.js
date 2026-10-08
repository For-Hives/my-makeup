import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ModalUpdateSocialMediaProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateSocialMediaProfil'
import ViewSocialMediaProfil from '@/components/Profil/Childs/Views/ViewSocialMediaProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function SocialMediaProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query
	const [isPublic, setIsPublic] = React.useState(props.isPublic)

	const user = props.user

	const [isModalOpen, setIsModalOpen] = React.useState(false)
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
			<ModalUpdateSocialMediaProfil
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
							dataCy="update-social-medias-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos informations de contacts"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewSocialMediaProfil user={user} />
				</div>
			</div>
		</div>
	)
}
