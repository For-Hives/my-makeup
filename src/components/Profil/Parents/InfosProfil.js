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
import { useRouter } from 'next/router'
import Link from 'next/link'

function InfosProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query

	const user = props.user
	const isPublic = !!publicView

	return (
		<div className={''}>
			<div className="relative mx-auto max-w-7xl pt-4">
				<div className={'absolute right-0 top-0 m-8 mt-16 flex'}>
					{!isPublic ? (
						<Link
							href={{ pathname: '/profil', query: { publicView: true } }}
							className={'flex gap-2 font-semibold text-indigo-900 '}
						>
							<span className="material-icons-round text-indigo-900">
								visibility
							</span>
							<span className={'hover:underline'}>Voir mon profil public</span>
						</Link>
					) : (
						<Link
							href={{ pathname: '/profil' }}
							className={'flex gap-2 font-semibold text-indigo-900'}
						>
							<span className="material-icons-round text-indigo-900">edit</span>
							<span className={'hover:underline'}>Modifier mon profil</span>
						</Link>
					)}
				</div>
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
