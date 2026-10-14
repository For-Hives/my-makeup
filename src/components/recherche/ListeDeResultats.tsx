import type { CarteDeProfil } from '@/services/public/profils'
import { CarteDeResultat } from './CarteDeResultat'

/** One list of cards. The first card of the page loads at once: it is the biggest picture above the fold of a phone. */
export function ListeDeResultats({
	cartes,
	premiereDeLaPage = false,
}: {
	cartes: readonly CarteDeProfil[]
	premiereDeLaPage?: boolean
}) {
	return (
		<ul className="grid w-full grid-cols-1 gap-8 md:grid-cols-3 2xl:grid-cols-6">
			{cartes.map((carte, rang) => (
				<li key={carte.slug} className="col-span-1">
					<CarteDeResultat carte={carte} prioritaire={premiereDeLaPage && rang === 0} />
				</li>
			))}
		</ul>
	)
}
