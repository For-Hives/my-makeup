import React from 'react'
import { LocationProfil } from '@/components/Profil/Childs/LocationProfil'
import { DescriptionProfil } from '@/components/Profil/Childs/DescriptionProfil'
import { SocialMediaProfil } from '@/components/Profil/Childs/SocialMediaProfil'
import { SkillsProfil } from '@/components/Profil/Childs/SkillsProfil'
import { PortfolioProfil } from '@/components/Profil/Childs/PortfolioProfil'
import { LanguageProfil } from '@/components/Profil/Childs/LanguageProfil'
import { ServiceOffersProfil } from '@/components/Profil/Childs/ServiceOffers/ServiceOffersProfil'
import { CoursesProfil } from '@/components/Profil/Childs/CoursesProfil'
import { ExperiencesProfil } from '@/components/Profil/Childs/ExperiencesProfil'

function InfosProfil(props) {
	const user = props.user
	const mode = props.mode

	return (
		<div className={''}>
			<div className="mx-auto max-w-7xl">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-4 flex flex-col items-start gap-5'}>
						<LocationProfil user={user} />
						<SocialMediaProfil user={user} />
						<SkillsProfil user={user} />
						<LanguageProfil user={user} />
						<CoursesProfil user={user} />
					</div>
					<div className={'col-span-8 flex flex-col items-start gap-5'}>
						<DescriptionProfil user={user} />
						<PortfolioProfil user={user} />
						<ServiceOffersProfil user={user} />
						<ExperiencesProfil user={user} />
					</div>
				</div>
			</div>
		</div>
	)
}

export default InfosProfil
