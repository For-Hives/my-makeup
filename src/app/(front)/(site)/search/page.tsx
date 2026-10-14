import Image from 'next/image'
import { BlocDeRecherche } from '@/components/blocs/BlocDeRecherche'
import { ListeDeResultats } from '@/components/recherche/ListeDeResultats'
import { sectionsParLieu } from '@/lib/recherche/lieu'
import { lireLaRecherche, rechercheParVille, titreDesResultats } from '@/lib/recherche/saisie'
import { metadonnees } from '@/lib/seo/metadonnees'
import { lAnnuaireEnCache } from '@/services/public/en-cache'

// The address is the search: read at each request. The directory it ranks is read through the cache
// of Next, tagged `profils` (ticket 047).
export const dynamic = 'force-dynamic'

// Never indexed: no canonical address, a noindex tag here and a noindex header from the proxy.
export const metadata = metadonnees({
	titre: 'Recherche de maquilleuse',
	description: 'Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup.',
	repli: 'Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup.',
	chemin: '/search',
	indexable: false,
})

/**
 * The search page (ticket 098): `/search?city=…`. The address is the only source of the search. A search by
 * city shows first the artists of the city or of the département typed, and counts only them in the
 * title; the others follow under their own headings. A profile that is hidden, unavailable or entirely
 * empty is not in the directory it ranks (src/lib/profil/visibilite.ts).
 *
 * A search by a word, alone or with a city, is ticket 099: until then it shows the same invitation as a
 * search without anything. The pages of 20, the error state and the brake are ticket 100.
 */
export default async function PageDeRecherche({ searchParams }: PageProps<'/search'>) {
	const recherche = lireLaRecherche(await searchParams)
	const { search, city } = recherche

	if (!rechercheParVille(recherche)) {
		return (
			<main className="relative flex flex-1 flex-col">
				<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
				<div className="flex w-full flex-col items-center justify-center gap-4 px-4 py-8 md:py-16 2xl:py-32">
					<h1 className="font-bold text-2xl text-gray-800">Rechercher une maquilleuse</h1>
					<div className="flex flex-col items-center justify-center gap-8">
						<Image src="/assets/vectorials-used/catSearch.svg" alt="" width={200} height={200} />
						<p className="px-8 text-center text-gray-700 text-lg md:text-xl">
							Indiquez une prestation, une ville, ou les deux, pour voir les maquilleuses
						</p>
					</div>
				</div>
			</main>
		)
	}

	const annuaire = await lAnnuaireEnCache()
	const { locaux, parLieu, sections } = sectionsParLieu(annuaire, city)
	const total = annuaire.length

	return (
		<main className="relative flex flex-1 flex-col">
			<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
			{total === 0 ? (
				<div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
					<h1 className="font-bold text-2xl text-gray-800">{titreDesResultats(recherche, 0)}</h1>
					<p className="text-gray-700">
						Essayez un autre mot (mariage, soirée, effets spéciaux…), une ville voisine ou la recherche sans ville.
					</p>
				</div>
			) : (
				<div className="w-full px-4 pb-16 md:px-16">
					<h1 className="mb-8 font-bold text-2xl text-gray-800">
						{titreDesResultats(recherche, parLieu ? locaux.length : total)}
					</h1>
					{parLieu && locaux.length === 0 && (
						<p className="-mt-4 mb-8 text-gray-700">
							Aucune maquilleuse n’indique « {city} » (ville ou département) dans son profil.
						</p>
					)}
					{locaux.length > 0 && (
						<section aria-labelledby="recherche-titre-locaux">
							<h2 id="recherche-titre-locaux" className="sr-only">
								Maquilleuses de « {city} »
							</h2>
							<ListeDeResultats cartes={locaux.map(({ carte }) => carte)} premiereDeLaPage />
						</section>
					)}
					{sections.map((section, rang) => (
						<section key={section.cle} aria-labelledby={`recherche-titre-${section.cle}`}>
							<h2
								id={`recherche-titre-${section.cle}`}
								className={`mb-8 font-bold text-gray-800 text-xl ${rang > 0 || locaux.length > 0 ? 'mt-12' : ''}`}
							>
								{section.titre}
							</h2>
							<ListeDeResultats
								cartes={section.profils.map(({ carte }) => carte)}
								premiereDeLaPage={rang === 0 && locaux.length === 0}
							/>
						</section>
					))}
				</div>
			)}
		</main>
	)
}
