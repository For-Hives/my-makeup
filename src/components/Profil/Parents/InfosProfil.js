import Link from 'next/link'
import CompletionProfilProgressBar from '@/components/Global/CompletionProfilProgressBar'
import { CoursesProfil } from '@/components/Profil/Childs/CoursesProfil'
import { DescriptionProfil } from '@/components/Profil/Childs/DescriptionProfil'
import { ExperiencesProfil } from '@/components/Profil/Childs/ExperiencesProfil'
import { LanguageProfil } from '@/components/Profil/Childs/LanguageProfil'
import { LocationProfil } from '@/components/Profil/Childs/LocationProfil'
import { PortfolioProfil } from '@/components/Profil/Childs/PortfolioProfil'
import { ServiceOffersProfil } from '@/components/Profil/Childs/ServiceOffers/ServiceOffersProfil'
import { SkillsProfil } from '@/components/Profil/Childs/SkillsProfil'
import { SocialMediaProfil } from '@/components/Profil/Childs/SocialMediaProfil'

function InfosProfil(props) {
	// the profile and the view of the page (src/pages/auth/profil.js): never
	// copied here, so every card shows what the API stored (UI-01) and the
	// same view as the top of the page (UI-02)
	const user = props.user
	const isPublic = props.isPublic

	return (
		<div className={''}>
			<div className="relative mx-auto max-w-7xl px-4 pt-8 md:px-8 2xl:px-0">
				<div
					className={'flex w-full flex-col items-start justify-start gap-4 md:flex-row md:items-end md:justify-between'}
				>
					{!isPublic ? (
						<>
							<CompletionProfilProgressBar user={user} />
							<Link
								data-cy="profil-public-view"
								href={'/auth/profil?publicView=true'}
								onClick={e => {
									e.preventDefault() // the page switches the view
									props.handleIsPublic(true)
								}}
								className={
									'flex min-h-[44px] items-center gap-2 rounded-lg px-2 font-semibold text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
								}
							>
								<span className="material-icons-round text-indigo-900" aria-hidden="true">
									visibility
								</span>
								<span className={'hover:underline'}>Voir mon profil public</span>
							</Link>
						</>
					) : (
						<div className={'flex w-full justify-end'}>
							<Link
								data-cy="profil-edit-view"
								href={'/auth/profil'}
								onClick={e => {
									e.preventDefault() // the page switches the view
									props.handleIsPublic(false)
								}}
								className={
									'flex min-h-[44px] items-center gap-2 rounded-lg px-2 font-semibold text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
								}
							>
								<span className="material-icons-round text-indigo-900" aria-hidden="true">
									edit
								</span>
								<span className={'hover:underline'}>Modifier mon profil</span>
							</Link>
						</div>
					)}
				</div>
				<div className={'grid grid-cols-12 gap-5 pt-8'}>
					<div className={'col-span-12 flex flex-col items-start gap-5 md:col-span-4'}>
						<LocationProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<SocialMediaProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<SkillsProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<LanguageProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<CoursesProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
					</div>
					<div className={'col-span-12 flex flex-col items-start gap-5 md:col-span-8'}>
						<DescriptionProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<PortfolioProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<ServiceOffersProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
						<ExperiencesProfil user={user} handleUpdateUser={props.handleUpdateUser} isPublic={isPublic} />
					</div>
				</div>
			</div>
		</div>
	)
}

export default InfosProfil
