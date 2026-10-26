import { LineDrawing, PrintMark } from '@/components/art/graphics'
import { pillClassName } from '@/components/art/Pill'
import { RankingLink } from '@/components/ranking/RankingLink'
import type { Layout, PriceBand, SearchFilters } from '@/lib/search/filters'
import { type Search, searchPageUrl } from '@/lib/search/input'
import { inDepartment } from '@/lib/search/place'
import type { ProfileCard } from '@/services/public/profiles'
import { SearchGrid } from './SearchGrid'
import { SearchRefine } from './SearchRefine'

const COLUMN = 'relative mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-20 text-center md:py-28'
const COLUMN_ABOVE_CARDS =
	'relative mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 pt-20 pb-12 text-center md:pt-28'
const LINK = 'font-semibold text-indigo-800 underline underline-offset-4'
/** A link on its own line: at least 44 px high to touch (ticket 295). */
const LIST_LINK = 'inline-flex min-h-11 items-center font-semibold text-indigo-800 underline underline-offset-4'
/** The title of a state: the kit's Bodoni. */
const STATE_TITLE = 'enter-mask text-balance font-display font-medium text-4xl text-ink leading-[1.05] md:text-5xl'
const STATE_TEXT = 'text-mute'

/** A line drawing and a print mark above the title of an empty state: decoration, hidden from screen readers. */
function EmptyArt() {
	return (
		<div aria-hidden="true" className="relative mb-2 h-24 w-40 text-art-line">
			<LineDrawing name="lips" className="h-full w-full" />
			<PrintMark kind="ring" className="absolute -top-1 -right-4 h-4 w-4" />
		</div>
	)
}

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
			<h1 className={STATE_TITLE}>La recherche n’a pas abouti</h1>
			<p role="alert" className={STATE_TEXT}>
				Le service de recherche ne répond pas pour le moment. Réessayez dans quelques instants.
			</p>
			<a href={searchPageUrl(recherche)} className={pillClassName({ variant: 'filled' })}>
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
				<EmptyArt />
				<h1 className={STATE_TITLE}>{titre}</h1>
				{codesPostaux.length > 0 && (
					<p className={STATE_TEXT}>
						Aucune maquilleuse n’est inscrite dans les communes {codesPostaux.map(code => `du ${code}`).join(' et ')}{' '}
						pour le moment.
					</p>
				)}
				{foreignCity && (
					<p className={STATE_TEXT}>
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
				<p className={STATE_TEXT}>
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
				<p className={STATE_TEXT}>
					Vous êtes maquilleuse professionnelle ?{' '}
					<a href="/auth/signup" className={LINK}>
						Créez votre profil
					</a>{' '}
					pour apparaître dans les résultats.
				</p>
			</div>
			{loin.length > 0 && (
				<section aria-labelledby="recherche-titre-loin" className="page-frame pb-20">
					<h2 id="recherche-titre-loin" className="mb-6 font-display font-medium text-2xl text-ink md:text-3xl">
						Elles se déplacent loin
					</h2>
					<SearchGrid cartes={loin} layout="grid" />
					<RankingLink />
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
	specialites,
	tranches,
	layout = 'list',
	baselineTotal = 0,
}: {
	titre: string
	recherche: Pick<Search, 'search' | 'city'>
	filtres: SearchFilters
	specialites?: readonly { value: string; label: string }[]
	tranches?: readonly PriceBand[]
	layout?: Layout
	/** What the search finds without the filters: the way out is worth that many. */
	baselineTotal?: number
}) {
	return (
		<div className="page-frame pt-10 pb-20 md:pt-14">
			<h1 className={`${STATE_TITLE} mb-4`}>{titre}</h1>
			<p className="mb-8 max-w-2xl text-mute">
				Changez les filtres, ou retirez-les pour voir {baselineTotal > 0 ? `les ${baselineTotal} ` : 'toutes les '}
				maquilleuses de cette recherche.
			</p>
			<SearchRefine
				recherche={query}
				filtres={filters}
				specialites={specialites}
				tranches={tranches}
				layout={layout}
				total={0}
				baselineTotal={baselineTotal}
			/>
			<a
				href={searchPageUrl({ ...query, layout })}
				className={`${pillClassName({ variant: 'outline' })} whitespace-normal! py-3 text-balance`}
			>
				Voir toutes les maquilleuses de cette recherche
			</a>
		</div>
	)
}
