import React from 'react'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'
import ModalUpdateLocationProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateLocationProfil'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'

export function LocationProfil(props) {
	const user = props.user

	const [isModalOpen, setIsModalOpen] = React.useState(false)
	// the view of the page (src/pages/auth/profil.js), never copied (UI-02)
	const isPublic = props.isPublic
	// opens in the edit view only, an open modal always closes
	const handleIsModalOpen = () => {
		if (isModalOpen || !isPublic) setIsModalOpen(!isModalOpen)
	}

	return (
		<div className={'w-full'}>
			<ModalUpdateLocationProfil
				isModalOpen={isModalOpen}
				handleUpdateUser={props.handleUpdateUser}
				handleIsModalOpen={handleIsModalOpen}
				user={user}
			/>
			<div className={'relative flex w-full flex-col gap-4 rounded border border-gray-300 bg-white p-8'}>
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
