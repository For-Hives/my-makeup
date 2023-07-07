import React from 'react'

function CompletionProfilProgressBar(props) {
	// the account appear in the search when :
	// - the account is disponible
	// - Lastname and Firstname are not empty
	// - Speciality is not empty
	// - City is not empty
	// - Description
	// - at least 1 social media

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
