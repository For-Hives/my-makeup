import { duDepartement } from '@/lib/search/lieu'
import { type Recherche, urlPageRecherche } from '@/lib/search/saisie'

const COLONNE = 'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center'
const LIEN = 'font-semibold text-indigo-900 underline'

/**
 * The search could not be read (the database is cut off or too slow, ticket 100): what happened in
 * words, and a link that asks the same search again. Never a blank page.
 */
export function RechercheEnEchec({ recherche }: { recherche: Pick<Recherche, 'search' | 'city' | 'page'> }) {
	return (
		<div className={COLONNE}>
			<h1 className="font-bold text-2xl text-gray-800">La recherche n’a pas abouti</h1>
			<p role="alert" className="text-gray-700">
				Le service de recherche ne répond pas pour le moment. Réessayez dans quelques instants.
			</p>
			<a href={urlPageRecherche(recherche)} className="btn-primary">
				Réessayer
			</a>
		</div>
	)
}

/**
 * Nothing found (ticket 099): the title says what was looked for, and the page offers a way on: another
 * word, the search without the city, the département of the city, and the sign-up of a makeup artist.
 */
export function AucunResultat({
	titre,
	search,
	city,
	departements = [],
}: {
	titre: string
	search: string
	city: string
	/** The codes of the département of the city typed, when they are known. */
	departements?: readonly string[]
}) {
	return (
		<div className={COLONNE}>
			<h1 className="font-bold text-2xl text-gray-800">{titre}</h1>
			<p className="text-gray-700">
				Essayez un autre mot (mariage, soirée, effets spéciaux…)
				{city ? ', une ville voisine ou la recherche sans ville' : ''}.
			</p>
			<ul className="flex flex-col items-center gap-2">
				{city && search && search.toLowerCase() !== city.toLowerCase() && (
					<li>
						<a href={urlPageRecherche({ search })} className={LIEN}>
							Chercher « {search} » partout
						</a>
					</li>
				)}
				{departements.map(code => (
					<li key={code}>
						<a href={urlPageRecherche({ city: code })} className={LIEN}>
							Voir les maquilleuses {duDepartement([code])}
						</a>
					</li>
				))}
			</ul>
			<p className="text-gray-700">
				Vous êtes maquilleuse professionnelle ?{' '}
				<a href="/auth/signup" className={LIEN}>
					Créez votre profil
				</a>{' '}
				pour apparaître dans les résultats.
			</p>
		</div>
	)
}
