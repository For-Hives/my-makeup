import ViewContainer from '@/components/Profil/Childs/Views/ViewContainer'
import ViewCoursesProfil from '@/components/Profil/Childs/Views/ViewCoursesProfil'
import ViewDescriptionProfil from '@/components/Profil/Childs/Views/ViewDescriptionProfil'
import ViewExperiencesProfil from '@/components/Profil/Childs/Views/ViewExperiencesProfil'
import ViewLanguageProfil from '@/components/Profil/Childs/Views/ViewLanguageProfil'
import ViewLocationProfil from '@/components/Profil/Childs/Views/ViewLocationProfil'
import ViewPortfolioProfil from '@/components/Profil/Childs/Views/ViewPortfolioProfil'
import ViewServiceOffersProfil from '@/components/Profil/Childs/Views/ViewServiceOffersProfil'
import ViewSkillsProfil from '@/components/Profil/Childs/Views/ViewSkillsProfil'
import ViewSocialMediaProfil from '@/components/Profil/Childs/Views/ViewSocialMediaProfil'
import { attributs, sectionsVisibles } from '@/lib/profil/vue-publique'

/**
 * Cards of a public profile, read from the props only so they are in the
 * server HTML (UI-06); a card with nothing to show is left out.
 */
function ViewInfosProfil(props) {
	const user = attributs(props.user)
	const visibles = sectionsVisibles(user)

	if (!(props.isPublicView && Object.values(visibles).some(Boolean))) return null

	const carte = (section, Component, extra = {}) =>
		visibles[section] ? <ViewContainer user={user} Component={Component} {...extra} /> : null

	return (
		<div className={''}>
			<div className="relative mx-auto max-w-7xl px-4 pt-4 md:px-8 2xl:px-0">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-12 flex flex-col items-start gap-5 md:col-span-4'}>
						{carte('localisation', ViewLocationProfil)}
						{carte('reseaux', ViewSocialMediaProfil, {
							tracking: {
								pid: props.user?.id,
								username: user.username,
							},
						})}
						{carte('competences', ViewSkillsProfil)}
						{carte('langues', ViewLanguageProfil)}
						{carte('formations', ViewCoursesProfil)}
					</div>
					<div className={'col-span-12 flex flex-col items-start gap-5 md:col-span-8'}>
						{carte('description', ViewDescriptionProfil)}
						{carte('portfolio', ViewPortfolioProfil)}
						{carte('offres', ViewServiceOffersProfil)}
						{carte('experiences', ViewExperiencesProfil)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default ViewInfosProfil
