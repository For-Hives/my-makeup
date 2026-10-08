import React from 'react'
import { formatZone, rayonKm, villeAffichee } from '@/lib/format-zone'
import { AIDE_VILLE, villePublique } from '@/lib/profil/lieu-public'

// read from the props only, so the public profile is in the server HTML.
// Public page: the public city (UI-11), the commune of an address, never its
// street. Artist's space (`prive`): what she typed, and what her page shows
// when it differs.
function ViewLocationProfil({ user, prive = false }) {
	const tapee = villeAffichee(user?.city)
	const publique = villePublique(user?.city)
	const ville = prive ? tapee : publique
	const zone = rayonKm(user?.action_radius)
		? formatZone({ city: ville, radius: user?.action_radius })
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
					{prive && tapee && publique !== tapee && (
						<p
							className={'text-sm text-gray-700'}
							data-cy={'location-city-public'}
						>
							{publique
								? `Sur ta page publique : ${publique}`
								: 'Aucune ville sur ta page publique : indique ta ville.'}
						</p>
					)}
					{prive && (
						<p
							className={'text-sm text-gray-600'}
							data-cy={'location-city-help'}
						>
							{AIDE_VILLE}
						</p>
					)}
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
