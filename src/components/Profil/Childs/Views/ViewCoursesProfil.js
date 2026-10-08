import React from 'react'
import { lignes, texte } from '@/lib/profil/vue-publique'

// read from the props only, so the public profile is in the server HTML
function ViewCoursesProfil({ user }) {
	const formations = (Array.isArray(user?.courses) ? user.courses : []).filter(
		course => texte(course?.diploma) || texte(course?.school)
	)

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>
				Formations & diplômes
			</h2>
			{formations.map((course, index) => (
				<div key={index} className={'flex text-gray-700'}>
					<span
						className="material-icons-round text-indigo-900"
						aria-hidden="true"
					>
						school
					</span>
					<div className={'ml-2 flex w-full flex-col gap-2'}>
						<div className={'flex flex-col'}>
							<p
								className={'font-semibold text-gray-700'}
								data-cy={'course-diploma'}
							>
								{texte(course.diploma)}
							</p>
							<div className={'flex w-full justify-between'}>
								<p
									className={'text-sm italic text-gray-600'}
									data-cy={'course-school'}
								>
									{texte(course.school)}
								</p>
								<p
									className={'text-sm italic text-gray-600'}
									data-cy={'course-date-graduation'}
								>
									{texte(course.date_graduation)}
								</p>
							</div>
						</div>
						<div data-cy={'course-description'}>
							{lignes(course.course_description).map((ligne, i) => (
								<p key={i} className={'text-sm italic text-gray-500'}>
									{ligne}
								</p>
							))}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}

export default ViewCoursesProfil
