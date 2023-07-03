import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'
import ViewSocialMediaProfil from '@/components/Profil/Childs/Views/ViewSocialMediaProfil'
import ViewSkillsProfil from '@/components/Profil/Childs/Views/ViewSkillsProfil'
import ViewLanguageProfil from '@/components/Profil/Childs/Views/ViewLanguageProfil'
import ViewCoursesProfil from '@/components/Profil/Childs/Views/ViewCoursesProfil'
import ViewDescriptionProfil from '@/components/Profil/Childs/Views/ViewDescriptionProfil'
import ViewPortfolioProfil from '@/components/Profil/Childs/Views/ViewPortfolioProfil'
import ViewServiceOffersProfil from '@/components/Profil/Childs/Views/ViewServiceOffersProfil'
import ViewExperiencesProfil from '@/components/Profil/Childs/Views/ViewExperiencesProfil'
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
								{user?.city && (
									<ViewContainer user={user} Component={ViewLocationProfil} />
								)}
								{user?.network && (
									<ViewContainer
										user={user}
										Component={ViewSocialMediaProfil}
									/>
								)}
								{user?.skills && (
									<ViewContainer user={user} Component={ViewSkillsProfil} />
								)}
								{user?.language && (
									<ViewContainer user={user} Component={ViewLanguageProfil} />
								)}
								{user?.courses && (
									<ViewContainer user={user} Component={ViewCoursesProfil} />
								)}
							</div>
							<div
								className={
									'col-span-12 flex flex-col items-start gap-5 md:col-span-8'
								}
							>
								{user?.description && (
									<ViewContainer
										user={user}
										Component={ViewDescriptionProfil}
									/>
								)}
								{user?.image_gallery && (
									<ViewContainer user={user} Component={ViewPortfolioProfil} />
								)}
								{user?.service_offers && (
									<ViewContainer
										user={user}
										Component={ViewServiceOffersProfil}
									/>
								)}
								{user?.experiences && (
									<ViewContainer
										user={user}
										Component={ViewExperiencesProfil}
									/>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	)
}

export default ViewInfosProfil
