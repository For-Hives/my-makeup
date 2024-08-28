import React, { useEffect } from 'react'

import ViewServiceOffersProfil from '@/components/Profil/Childs/Views/ViewServiceOffersProfil'
import ViewSocialMediaProfil from '@/components/Profil/Childs/Views/ViewSocialMediaProfil'
import ViewDescriptionProfil from '@/components/Profil/Childs/Views/ViewDescriptionProfil'
import ViewExperiencesProfil from '@/components/Profil/Childs/Views/ViewExperiencesProfil'
import ViewPortfolioProfil from '@/components/Profil/Childs/Views/ViewPortfolioProfil'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'
import ViewLanguageProfil from '@/components/Profil/Childs/Views/ViewLanguageProfil'
import ViewCoursesProfil from '@/components/Profil/Childs/Views/ViewCoursesProfil'
import ViewSkillsProfil from '@/components/Profil/Childs/Views/ViewSkillsProfil'
import ViewContainer from '@/components/Profil/Childs/Views/ViewContainer'

function ViewInfosProfil(props) {
	const [user, setUser] = React.useState(null)

	useEffect(() => {
		if (props.user) {
			setUser(props.user.attributes)
		}
	}, [props.user])

	return (
		<div className={''}>
			<div className="relative mx-auto max-w-7xl px-4 pt-4 md:px-8 2xl:px-0">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					{props.isPublicView && (
						<>
							<div
								className={
									'col-span-12 flex flex-col items-start gap-5 md:col-span-4'
								}
							>
								<ViewContainer Component={ViewLocationProfil} user={user} />
								<ViewContainer Component={ViewSocialMediaProfil} user={user} />
								<ViewContainer Component={ViewSkillsProfil} user={user} />
								<ViewContainer Component={ViewLanguageProfil} user={user} />
								<ViewContainer Component={ViewCoursesProfil} user={user} />
							</div>
							<div
								className={
									'col-span-12 flex flex-col items-start gap-5 md:col-span-8'
								}
							>
								<ViewContainer Component={ViewDescriptionProfil} user={user} />
								<ViewContainer Component={ViewPortfolioProfil} user={user} />
								<ViewContainer
									Component={ViewServiceOffersProfil}
									user={user}
								/>
								<ViewContainer Component={ViewExperiencesProfil} user={user} />
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	)
}

export default ViewInfosProfil
