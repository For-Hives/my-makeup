import React, { useEffect } from 'react'

const totalPointToComplete = 13

function CompletionProfilProgressBar(props) {
	const { user, handleUpdateUser } = props
	// the account appear in the search when :
	// - Nom + prénom*
	// - Spécialité
	// - Photo de profil
	// - Nom de la compagnie
	// - Localisation
	// - Réseaux
	// - Compétences
	// - Langues
	// - Portefolio
	// - Description
	// - Formation
	// - Service
	// - Experience
	//  13 infos à compléter au total : calcul à faire
	const [completion, setCompletion] = React.useState(0)
	const [valueToDisplay, setValueToDisplay] = React.useState(100)

	useEffect(() => {
		console.log('useEffect CompletionProfilProgressBar')
		let count = 0
		if (user.last_name && user.first_name) count++
		if (user.speciality) count++
		if (user.company_artist_name) count++
		if (user.city) count++
		if (user.description) count++
		if (user.main_picture) count++
		if (user.skills && user.skills.length > 0) count++
		if (user.experiences && user.experiences.length > 0) count++
		if (user.courses && user.courses.length > 0) count++
		if (user.service_offers && user.service_offers.length > 0) count++
		if (
			user.network &&
			(user.network.youtube ||
				user.network.instagram ||
				user.network.facebook ||
				user.network.website ||
				user.network.linkedin ||
				user.network.phone ||
				user.network.email)
		) {
			count++
		}
		if (user.language && user.language.length > 0) count++
		if (user.image_gallery && user.image_gallery.length > 0) count++

		setCompletion(count)
		let userTemp = user
		handleUpdateUser(userTemp)

		let newProgressValue = Math.round((100 / totalPointToComplete) * count)
		setValueToDisplay(newProgressValue)
	}, [user, handleUpdateUser])

	return (
		<div className={'w-full md:w-1/2'}>
			<h2 className="sr-only">{(100 / 13) * completion}% de complétion</h2>
			<p className="text-sm font-medium text-gray-900">
				{valueToDisplay}% de complétion
			</p>
			<div className="mt-2 w-full" aria-hidden="true">
				<div className="overflow-hidden rounded-full bg-gray-200">
					<div
						className="h-2 rounded-full bg-indigo-600"
						style={{ width: `${valueToDisplay}%` }}
					/>
				</div>
			</div>
		</div>
	)
}

export default CompletionProfilProgressBar
