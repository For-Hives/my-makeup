import { avecCles } from '@/lib/cles'
import { lignes } from '@/lib/profil/vue-publique'

// read from the props only, so the public profile is in the server HTML
function ViewDescriptionProfil({ user }) {
	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Vous en quelques mots</h2>
			{
				// one paragraph per line typed
				avecCles(lignes(user?.description)).map(({ valeur: ligne, cle }, _i) => (
					<p data-cy={'description'} key={cle} className={'text-gray-800'}>
						{ligne}
					</p>
				))
			}
		</div>
	)
}

export default ViewDescriptionProfil
