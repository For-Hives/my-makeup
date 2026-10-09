import React from 'react'
import ModalUpdateLanguageProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLanguageProfil'
import ViewLanguageProfil from '@/components/Profil/Childs/Views/ViewLanguageProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function LanguageProfil(props) {
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
