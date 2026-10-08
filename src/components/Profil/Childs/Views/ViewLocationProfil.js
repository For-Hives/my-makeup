import React from 'react'
import { formatZone, rayonKm, villeAffichee } from '@/lib/format-zone'

// read from the props only, so the public profile is in the server HTML
function ViewLocationProfil({ user }) {
	const ville = villeAffichee(user?.city)
	const zone = rayonKm(user?.action_radius)
		? formatZone({ city: user?.city, radius: user?.action_radius })
		: ''

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>
				Localisation & département
			</h2>
			<div className={'flex gap-2'}>
				<span
					className="material-icons-round text-lg text-indigo-900"
					aria-hidden="true"
				>
					location_on
				</span>
				<div className={'flex flex-col gap-2'}>
					<h3 className={'text-lg font-semibold text-gray-700'}>
						Localisation
					</h3>
					{ville && <p className={'text-gray-800'}>{ville}</p>}
				</div>
			</div>
			{zone && (
				<div className={'flex gap-2'}>
					<span
						className="material-icons-round text-lg text-indigo-900"
						aria-hidden="true"
					>
						directions_run
					</span>
					<div className={'flex flex-col gap-2'}>
						<h3 className={'text-lg font-semibold text-gray-700'}>
							Peut travailler chez vous à
						</h3>
						<p
							className={'text-gray-800'}
							data-cy={'location-city-action-radius'}
						>
							{zone}
						</p>
					</div>
				</div>
			)}
		</div>
	)
}

export default ViewLocationProfil
