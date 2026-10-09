import { avecCles } from '@/lib/cles'
import { texte } from '@/lib/profil/vue-publique'

// read from the props only, so the public profile is in the server HTML
function ViewSkillsProfil({ user }) {
	const competences = (Array.isArray(user?.skills) ? user.skills : []).filter(skill => texte(skill?.name))

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Compétences</h2>
			{competences.length > 0 && (
				<ul className={'flex flex-wrap gap-4'}>
					{avecCles(competences).map(({ valeur: skill, cle }, _index) => (
						<li
							data-cy="skill"
							key={cle}
							className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
						>
							{texte(skill.name)}
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

export default ViewSkillsProfil
