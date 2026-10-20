import { SuiviDeLaSoumission } from '@/components/analytics/SuiviDeLaSoumission'
import { MagnifierIcon, PlaceIcon } from './icons'

const FIELD =
	'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pr-6 pl-12 text-indigo-900 text-sm leading-6'

interface SearchBlockProps {
	/** What the fields hold: the search of the address on the search page, nothing on the home page. */
	search?: string
	city?: string
	/** The search page's own form: flat, full width. Otherwise the card that floats over the home page's picture. */
	surLaPageDeRecherche?: boolean
}

/**
 * The search form: a plain form that goes to the search page with the two parameters of the site
 * online, `search` and `city`. It needs no JavaScript. A field left empty is sent empty, and the
 * search page reads an empty field as none; a city alone is a search.
 */
export function SearchBlock({ search = '', city = '', surLaPageDeRecherche = false }: SearchBlockProps) {
	const prefix = surLaPageDeRecherche ? 'recherche' : 'bloc'
	const width = surLaPageDeRecherche ? 'lg:w-96' : 'lg:w-80'
	return (
		<div
			className={
				surLaPageDeRecherche
					? 'mb-12 flex w-full items-center justify-center bg-white px-4 py-8 shadow-2xl sm:px-12 lg:border-gray-300 lg:border-b'
					: 'mb-4 flex w-full max-w-5xl justify-between rounded-2xl bg-white px-4 py-8 shadow-2xl md:mb-10 lg:mb-20 lg:px-12'
			}
		>
			<div className="flex w-full max-w-5xl justify-between">
				{/* biome-ignore lint/a11y/useSemanticElements: a <search> element is no landmark before Safari 17 and Chrome 118 */}
				<form
					action="/search"
					method="get"
					role="search"
					className="flex w-full flex-col items-center justify-between gap-6 sm:gap-4 md:flex-row md:flex-wrap lg:gap-6"
				>
					<SuiviDeLaSoumission />
					<div className="flex w-full flex-col gap-4 px-2 md:w-full md:flex-row lg:w-auto lg:gap-6 lg:px-0">
						<div className="relative w-full md:w-full lg:w-auto">
							<label htmlFor={`${prefix}-prestation`} className="sr-only">
								Prestation recherchée
							</label>
							<MagnifierIcon className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform text-indigo-900" />
							<input
								id={`${prefix}-prestation`}
								name="search"
								type="search"
								maxLength={100}
								defaultValue={search}
								className={`${FIELD} ${width}`}
								placeholder="Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
							/>
						</div>
						<div className="relative w-full md:w-full lg:w-auto">
							<label htmlFor={`${prefix}-ville`} className="sr-only">
								Ville de la prestation
							</label>
							<PlaceIcon className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform text-indigo-900" />
							<input
								id={`${prefix}-ville`}
								name="city"
								type="text"
								maxLength={100}
								defaultValue={city}
								autoComplete="address-level2"
								className={`${FIELD} ${width}`}
								placeholder="Lieu de la mission (ex: Paris, Lyon, Marseille...)"
							/>
						</div>
					</div>
					<div className="flex h-full w-full items-center justify-center px-2 md:h-auto md:w-full md:items-center lg:w-auto">
						<button type="submit" className="btn-primary w-full">
							Trouver une maquilleuse
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
