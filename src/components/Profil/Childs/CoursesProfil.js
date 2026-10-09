import React from 'react'
import ModalUpdateCoursesProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateCoursesProfil'
import ViewCoursesProfil from '@/components/Profil/Childs/Views/ViewCoursesProfil'
import BoutonModifier from '@/components/Profil/Atoms/BoutonModifier'

export function CoursesProfil(props) {
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
			<ModalUpdateCoursesProfil
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
							dataCy="update-courses-button"
							onClick={handleIsModalOpen}
							libelle="Modifier vos diplômes & formations"
						/>
					</div>
				) : null}
				<div className={'flex w-full flex-col gap-4'}>
					<ViewCoursesProfil user={user} />
				</div>
			</div>
		</div>
	)
}
