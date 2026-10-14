import Image from 'next/image'
import { BlocDeRecherche } from '@/components/blocs/BlocDeRecherche'
import { AucunResultat } from '@/components/recherche/EtatsDeRecherche'
import { ListeDeResultats } from '@/components/recherche/ListeDeResultats'
import { sectionsParLieu } from '@/lib/recherche/lieu'
import { chercher } from '@/lib/recherche/resultats'
import { lireLaRecherche, rechercheParMot, rechercheParVille, titreDesResultats } from '@/lib/recherche/saisie'
import { metadonnees } from '@/lib/seo/metadonnees'
import { lAnnuaireAvecLesTextesEnCache, lAnnuaireEnCache } from '@/services/public/en-cache'

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
 * The search page: `/search?search=…&city=…&page=…`. The address is the only source of the search.
 *
 * - By city (ticket 098): the artists of the city or of the département typed come first and are the
 *   only ones the title counts; the others follow under their own headings.
 * - By a word, alone or with a city (ticket 099): the listed profiles that hold the words, best first
 *   (src/lib/recherche/pertinence.ts); with a city, hers come first, as above.
 * - The pages of 20, the error state and the brake by address are ticket 100.
 *
 * A profile that is hidden, unavailable or entirely empty is not in the directory it ranks
 * (src/lib/profil/visibilite.ts). The text typed is never logged and never measured.
 */
export default async function PageDeRecherche({ searchParams }: PageProps<'/search'>) {
	const recherche = lireLaRecherche(await searchParams)
	const { search, city } = recherche

	if (!rechercheParVille(recherche) && !rechercheParMot(recherche)) {
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

	const annuaire = await (rechercheParMot(recherche) ? lAnnuaireAvecLesTextesEnCache : lAnnuaireEnCache)()
	const { locaux, parLieu, sections } = chercher(annuaire, recherche)
	const tous = [...locaux, ...sections.flatMap(section => section.profils)]
	const locauxDeLaPage = locaux
	const groupes = sections
		.map(section => ({ section, profils: section.profils }))
		.filter(({ profils }) => profils.length > 0)

	return (
		<main className="relative flex flex-1 flex-col">
			<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
			{tous.length === 0 ? (
				<AucunResultat
					titre={titreDesResultats(recherche, 0)}
					search={search}
					city={city}
					departements={city ? sectionsParLieu(annuaire, city).departements : []}
				/>
			) : (
				<div className="w-full px-4 pb-16 md:px-16">
					<h1 className="mb-8 font-bold text-2xl text-gray-800">
						{titreDesResultats(recherche, parLieu ? locaux.length : tous.length)}
					</h1>
					{parLieu && locaux.length === 0 && (
						<p className="-mt-4 mb-8 text-gray-700">
							Aucune maquilleuse n’indique « {city} » (ville ou département) dans son profil.
						</p>
					)}
					{locauxDeLaPage.length > 0 && (
						<section aria-labelledby="recherche-titre-locaux">
							<h2 id="recherche-titre-locaux" className="sr-only">
								{parLieu ? `Maquilleuses de « ${city} »` : 'Résultats'}
							</h2>
							<ListeDeResultats cartes={locauxDeLaPage.map(({ carte }) => carte)} premiereDeLaPage />
						</section>
					)}
					{groupes.map(({ section, profils }, rang) => (
						<section key={section.cle} aria-labelledby={`recherche-titre-${section.cle}`}>
							<h2
								id={`recherche-titre-${section.cle}`}
								className={`mb-8 font-bold text-gray-800 text-xl ${rang > 0 || locauxDeLaPage.length > 0 ? 'mt-12' : ''}`}
							>
								{section.titre}
							</h2>
							<ListeDeResultats
								cartes={profils.map(({ carte }) => carte)}
								premiereDeLaPage={rang === 0 && locauxDeLaPage.length === 0}
							/>
						</section>
					))}
				</div>
			)}
		</main>
	)
}
