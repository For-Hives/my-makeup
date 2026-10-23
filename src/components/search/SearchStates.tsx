import type { SearchFilters } from '@/lib/search/filters'
import { type Search, searchPageUrl } from '@/lib/search/input'
import { inDepartment } from '@/lib/search/place'
import type { ProfileCard } from '@/services/public/profiles'
import { ResultList } from './ResultList'
import { SearchRefine } from './SearchRefine'

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center'
const COLUMN_ABOVE_CARDS = 'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 pt-24 pb-12 text-center'
const LINK = 'font-semibold text-indigo-900 underline'
/** A link on its own line: at least 44 px high to touch (ticket 295). */
const LIST_LINK = 'inline-flex min-h-[44px] items-center font-semibold text-indigo-900 underline'

/**
 * The search could not be read (the database is cut off or too slow, ticket 100): what happened in
 * words, and a link that asks the same search again. Never a blank page.
 */
export function SearchFailed({
	recherche,
}: {
	recherche: Pick<Search, 'search' | 'city' | 'page'> & Partial<SearchFilters>
}) {
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
	foreignCity = false,
	foreignCountry = null,
	loin = [],
}: {
	titre: string
	search: string
	city: string
	/** The codes of the département of the city typed, when they are known. */
	departements?: readonly string[]
	/** The postal codes typed (ticket 263): the page then says no commune of these codes has a makeup artist. */
	codesPostaux?: readonly string[]
	/** The city typed is not a commune of France (ticket 295): the page says only the countries are read. */
	foreignCity?: boolean
	/** The country of that city when it is a big one we know (« Suisse »): offered as the word to search. */
	foreignCountry?: string | null
	/** At most 4 profiles that go far (ticket 295), under « Elles se déplacent loin ». */
	loin?: readonly ProfileCard[]
}) {
	return (
		<>
			<div className={loin.length > 0 ? COLUMN_ABOVE_CARDS : COLUMN}>
				<h1 className="font-bold text-2xl text-gray-800">{titre}</h1>
				{codesPostaux.length > 0 && (
					<p className="text-gray-700">
						Aucune maquilleuse n’est inscrite dans les communes {codesPostaux.map(code => `du ${code}`).join(' et ')}{' '}
						pour le moment.
					</p>
				)}
				{foreignCity && (
					<p className="text-gray-700">
						Cette ville n’est pas une commune de France. Pour l’étranger, seuls les pays sont lus
						{foreignCountry ? (
							<>
								{' '}
								:{' '}
								<a href={searchPageUrl({ city: foreignCountry })} className={LINK}>
									cherchez « {foreignCountry} »
								</a>
							</>
						) : (
							' : cherchez par le nom du pays'
						)}
						.
					</p>
				)}
				<p className="text-gray-700">
					Essayez un autre mot (mariage, soirée, effets spéciaux…)
					{city ? ', une ville voisine ou la recherche sans ville' : ''}.
				</p>
				<ul className="flex flex-col items-center gap-2">
					{city && search && search.toLowerCase() !== city.toLowerCase() && (
						<li>
							<a href={searchPageUrl({ search })} className={LIST_LINK}>
								Chercher « {search} » partout
							</a>
						</li>
					)}
					{departements.map(code => (
						<li key={code}>
							<a href={searchPageUrl({ city: code })} className={LIST_LINK}>
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
			{loin.length > 0 && (
				<section aria-labelledby="recherche-titre-loin" className="w-full px-4 pb-16 md:px-16">
					<h2 id="recherche-titre-loin" className="mb-8 font-bold text-gray-800 text-xl">
						Elles se déplacent loin
					</h2>
					<ResultList cartes={loin} />
				</section>
			)}
		</>
	)
}

/**
 * The filters left nobody (issue 1011), while the search without them finds someone: the page says so, lets
 * the visitor change the filters, and links to the search without them. It never says nobody is registered.
 */
export function NoMatchForFilters({
	titre,
	recherche: query,
	filtres: filters,
}: {
	titre: string
	recherche: Pick<Search, 'search' | 'city'>
	filtres: SearchFilters
}) {
	return (
		<div className="w-full px-4 pb-16 md:px-16">
			<h1 className="mb-4 font-bold text-2xl text-gray-800">{titre}</h1>
			<p className="mb-8 text-gray-700">
				Changez le prix maximum, ou retirez les filtres pour voir toutes les maquilleuses.
			</p>
			<SearchRefine recherche={query} filtres={filters} />
			<a href={searchPageUrl(query)} className={LIST_LINK}>
				Voir toutes les maquilleuses de cette recherche
			</a>
		</div>
	)
}
