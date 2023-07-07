import React from 'react'

function CompletionProfilProgressBar(props) {
	// the account appear in the search when :
	// - Nom + prénom*
	// - Spécialité
	// - Photo de profil
	// - Localisation
	// - Réseaux
	// - Compétences
	// - Langues
	// - Portefolio
	// - Description
	// - Formation
	// - Service
	// - Experience
	//  12 infos à compléter au total : calcul à faire

	return (
		<div className={'w-full md:w-1/2'}>
			<h2 className="sr-only">0% de complétion</h2>
			<p className="text-sm font-medium text-gray-900">0% de complétion</p>
			<div className="mt-2 w-full" aria-hidden="true">
				<div className="overflow-hidden rounded-full bg-gray-200">
					<div
						className="h-2 rounded-full bg-indigo-600"
						style={{ width: '37.5%' }}
					/>
				</div>
			</div>
		</div>
	)
}

export default CompletionProfilProgressBar
