import { avecCles } from '@/lib/cles'
import { lignes, periode, texte } from '@/lib/profil/vue-publique'

// read from the props only, so the public profile is in the server HTML
function ViewExperiencesProfil({ user }) {
	const experiences = Array.isArray(user?.experiences) ? user.experiences.filter(Boolean) : []

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Expériences professionnelles</h2>
			{experiences.length > 0 && (
				<div className={'flex flex-col gap-4'}>
					{avecCles(experiences).map(({ valeur: experience, cle }, _index) => (
						<div key={cle} className={'flex w-full text-indigo-800'}>
							<span className="material-icons-round" aria-hidden="true">
								apartment
							</span>
							<div className={'ml-2 flex w-full flex-col gap-2'}>
								<div className={'flex w-full flex-col'}>
									<p className={'font-semibold text-gray-700'} data-cy={'experience-company'}>
										{texte(experience.company)}
									</p>
									<div className={'flex justify-between gap-2'}>
										<p className={'text-sm italic text-gray-600'} data-cy={'experience-job-name'}>
											{texte(experience.job_name)}
										</p>
										<p className={'text-sm italic text-gray-600'} data-cy={'experience-date'}>
											{periode(experience)}
										</p>
									</div>
								</div>
								{texte(experience.city) && (
									<p className={'text-sm italic text-gray-600'} data-cy={'experience-city'}>
										à {texte(experience.city)}
									</p>
								)}
								<div data-cy={'experience-description'}>
									{avecCles(lignes(experience.description)).map(({ valeur: ligne, cle }, _i) => (
										<p key={cle} className={'text-sm italic text-gray-500'}>
											{ligne}
										</p>
									))}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default ViewExperiencesProfil
