import { type Search, searchPageUrl } from '@/lib/search/input'
import { inDepartment } from '@/lib/search/place'

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center'
const LINK = 'font-semibold text-indigo-900 underline'

/**
 * The search could not be read (the database is cut off or too slow, ticket 100): what happened in
 * words, and a link that asks the same search again. Never a blank page.
 */
export function SearchFailed({ recherche }: { recherche: Pick<Search, 'search' | 'city' | 'page'> }) {
	return (
		<div className={COLUMN}>
			<h1 className="font-bold text-2xl text-gray-800">La recherche n’a pas abouti</h1>
			<p role="alert" className="text-gray-700">
				Le service de recherche ne répond pas pour le moment. Réessayez dans quelques instants.
			</p>
			<a href={searchPageUrl(recherche)} className="btn-primary">
				Réessayer
			</a>
		</div>
	)
}

/**
 * Nothing found (ticket 099): the title says what was looked for, and the page offers a way on: another
 * word, the search without the city, the département of the city, and the sign-up of a makeup artist.
 */
export function NoResult({
	titre,
	search,
	city,
	departements = [],
	codesPostaux = [],
}: {
	titre: string
	search: string
	city: string
	/** The codes of the département of the city typed, when they are known. */
	departements?: readonly string[]
	/** The postal codes typed (ticket 263): the page then says no commune of these codes has a makeup artist. */
	codesPostaux?: readonly string[]
}) {
	return (
		<div className={COLUMN}>
			<h1 className="font-bold text-2xl text-gray-800">{titre}</h1>
			{codesPostaux.length > 0 && (
				<p className="text-gray-700">
					Aucune maquilleuse n’est inscrite dans les communes {codesPostaux.map(code => `du ${code}`).join(' et ')} pour
					le moment.
				</p>
			)}
			<p className="text-gray-700">
				Essayez un autre mot (mariage, soirée, effets spéciaux…)
				{city ? ', une ville voisine ou la recherche sans ville' : ''}.
			</p>
			<ul className="flex flex-col items-center gap-2">
				{city && search && search.toLowerCase() !== city.toLowerCase() && (
					<li>
						<a href={searchPageUrl({ search })} className={LINK}>
							Chercher « {search} » partout
						</a>
					</li>
				)}
				{departements.map(code => (
					<li key={code}>
						<a href={searchPageUrl({ city: code })} className={LINK}>
							Voir les maquilleuses {inDepartment([code])}
						</a>
					</li>
				))}
			</ul>
			<p className="text-gray-700">
				Vous êtes maquilleuse professionnelle ?{' '}
				<a href="/auth/signup" className={LINK}>
					Créez votre profil
				</a>{' '}
				pour apparaître dans les résultats.
			</p>
		</div>
	)
}
