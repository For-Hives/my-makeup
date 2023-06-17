import React from 'react'
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
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query

	const user = props.user.attributes
	const isPublic = !!publicView

	return (
		<div className={''}>
			<div className="relative mx-auto max-w-7xl pt-4">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-4 flex flex-col items-start gap-5'}>
						{user.city && (
							<ViewContainer user={user} Component={ViewLocationProfil} />
						)}
						{user?.network && (
							<ViewContainer user={user} Component={ViewSocialMediaProfil} />
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
					<div className={'col-span-8 flex flex-col items-start gap-5'}>
						{user?.description && (
							<ViewContainer user={user} Component={ViewDescriptionProfil} />
						)}
						{user?.image_gallery && (
							<ViewContainer user={user} Component={ViewPortfolioProfil} />
						)}
						{user?.service_offers && (
							<ViewContainer user={user} Component={ViewServiceOffersProfil} />
						)}
						{user?.experiences && (
							<ViewContainer user={user} Component={ViewExperiencesProfil} />
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default ViewInfosProfil
