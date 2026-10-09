import React from 'react'
import ModalUpdateExperiencesProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateExperiencesProfil'
import ViewExperiencesProfil from '@/components/Profil/Childs/Views/ViewExperiencesProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function ExperiencesProfil(props) {
	const user = props.user

	const [isModalOpen, setIsModalOpen] = React.useState(false)
	// the view of the page (src/pages/auth/profil.js), never copied (UI-02)
	const isPublic = props.isPublic
	// opens in the edit view only, an open modal always closes
	const handleIsModalOpen = () => {
		if (isModalOpen || !isPublic) setIsModalOpen(!isModalOpen)
	}

	return (
		<div className={'relative w-full'}>
			<ModalUpdateExperiencesProfil
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
							dataCy="update-experience-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos expériences"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewExperiencesProfil user={user} />
				</div>
			</div>
		</div>
	)
}
