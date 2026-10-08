import React from 'react'
import { texte } from '@/lib/profil/vue-publique'

// read from the props only, so the public profile is in the server HTML
function ViewLanguageProfil({ user }) {
	const langues = (Array.isArray(user?.language) ? user.language : []).filter(
		language => texte(language?.name)
	)

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Langues</h2>
			<ul className={'flex flex-col gap-4'} data-cy={'language'}>
				{langues.map((language, index) => (
					<li key={index} className={'text-gray-700'}>
						<span aria-hidden="true">→&nbsp;</span>
						<span className="inline-flex flex-nowrap items-center rounded-full px-3 py-2 text-sm font-medium text-gray-700">
							{texte(language.name)}
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}

export default ViewLanguageProfil
