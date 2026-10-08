import Head from 'next/head'
import React, { useEffect, useRef, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'
import Image from 'next/image'
import FullSearchBloc from '@/components/Global/Search/FullSearchBloc'
import { CatSearch } from '@/components/Global/Search/CatSearch'
import Loader from '@/components/Global/Loader/Loader'
import { BadgeSuperMaquilleuse } from '@/components/Global/BadgeSuperMaquilleuse'
import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { isRepeat, resultsBucket, track } from '@/lib/analytics'
import { signalAvecDelai } from '@/lib/delai'
import { formatZone } from '@/lib/format-zone'
import { separerParLieu } from '@/lib/lieu'
import { nomAffiche, photoPrincipale, texte } from '@/lib/profil/vue-publique'
import {
	cleRecherche,
	DELAI_RECHERCHE_MS,
	GRILLE_RESULTATS,
	HAUTEUR_PHOTO_CARTE,
	lireRecherche,
	paginer,
	rechercheValide,
	resultatsRecherche,
	sectionsDeLaPage,
	titreResultats,
	urlApiRecherche,
	urlPageRecherche,
} from '@/lib/recherche'
import { QUALITE_PHOTO, ratioMedia, sizesGrille } from '@/lib/taille-image'

/**
 * Search (UI-07): the URL is the search (/search?search=…&city=…&page=…). A
 * city alone is enough; one API call per search, never for a page change;
 * empty, error (API cut off: message within 8 s) and paged states, each
 * with its h1. Never indexed (noindex from _app.js and next.config.js).
 * With a city (UI-10), the API still answers for all of France: the
 * profiles of that city or département come first and are the only ones
 * counted in the title, the others follow under their own heading.
 */
function SearchPage() {
	const router = useRouter()
	const { search, city, page } = lireRecherche(router.query)
	const pret = router.isReady && rechercheValide({ search, city })

	// { cle, statut: 'chargement' | 'ok' | 'erreur', resultats }
	const [etat, setEtat] = useState(null)
	const [essai, setEssai] = useState(0)
	// the form of this page changed the URL (`search_submit` from)
	const origine = useRef('lien')
	// last search counted as `search_submit`
	const lastCounted = useRef(null)

	useEffect(() => {
		if (!pret) return
		const recherche = { search, city }
		const cle = cleRecherche(recherche)
		const from = origine.current
		origine.current = 'lien'
		let abandonnee = false
		setEtat({ cle, statut: 'chargement', resultats: [] })

		fetch(urlApiRecherche(process.env.NEXT_PUBLIC_API_URL, recherche), {
			signal: signalAvecDelai(DELAI_RECHERCHE_MS),
		})
			.then(reponse => {
				if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
				return reponse.json()
			})
			.then(corps => {
				const resultats = resultatsRecherche(corps)
				if (resultats === null) throw new Error('réponse inattendue')
				if (abandonnee) return
				const now = Date.now()
				if (!isRepeat(lastCounted.current, cle, now)) {
					lastCounted.current = { key: cle, at: now }
					// never the typed text: only whether a city was given and a bucket
					track('search_submit', {
						has_city: !!city,
						results: resultsBucket(resultats.length),
						from,
					})
				}
				setEtat({ cle, statut: 'ok', resultats })
			})
			.catch(() => {
				if (!abandonnee) setEtat({ cle, statut: 'erreur', resultats: [] })
			})

		return () => {
			abandonnee = true
		}
	}, [pret, search, city, essai])

	// the form of this page: a new search goes to its URL; the same one is
	// asked again (same URL, nothing else would run it)
	function rechercher(nouvelle) {
		const meme =
			pret &&
			cleRecherche(lireRecherche(nouvelle)) === cleRecherche({ search, city })
		if (meme && page > 1) return router.push(urlPageRecherche(nouvelle))
		origine.current = 'formulaire'
		if (meme) setEssai(n => n + 1)
		else router.push(urlPageRecherche(nouvelle))
	}

	const statut = !pret
		? 'repos'
		: etat?.cle === cleRecherche({ search, city })
			? etat.statut
			: 'chargement'
	const resultats = statut === 'ok' ? etat.resultats : []
	const { locaux, autres, parLieu } = separerParLieu(resultats, city)
	const pagination = paginer([...locaux, ...autres], page)
	const sections = sectionsDeLaPage(pagination, locaux.length)

	return (
		<>
			<Head>
				<title>Recherche de maquilleuse - My-Makeup</title>
				<meta
					name="description"
					content="Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup."
				/>
			</Head>
			<div className={'relative'}>
				<Nav isFindMakeupArtistBtnVisible={false} />
				<main className={'relative'}>
					<FullSearchBloc search={search} city={city} onSearch={rechercher} />
					{statut === 'repos' && (
						<div
							className={
								'flex w-full flex-col items-center justify-center gap-4 py-8 md:py-16 2xl:py-32'
							}
						>
							<h1 className={'text-2xl font-bold text-gray-800'}>
								Rechercher une maquilleuse
							</h1>
							<CatSearch />
						</div>
					)}
					{statut === 'chargement' && (
						<div
							className={
								'flex w-full flex-col items-center justify-center gap-8 py-32'
							}
							role="status"
						>
							<h1 className={'text-2xl font-bold text-gray-800'}>
								Recherche en cours…
							</h1>
							<Loader />
						</div>
					)}
					{statut === 'erreur' && (
						<div
							className={
								'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center'
							}
							data-cy="search-error"
						>
							<h1 className={'text-2xl font-bold text-gray-800'}>
								La recherche n’a pas abouti
							</h1>
							<p role="alert" className={'text-gray-700'}>
								Le service de recherche ne répond pas pour le moment. Réessayez
								dans quelques instants.
							</p>
							<button
								type="button"
								data-cy="search-retry"
								className={'btn-primary'}
								onClick={() => setEssai(n => n + 1)}
							>
								Réessayer
							</button>
						</div>
					)}
					{statut === 'ok' && pagination.total === 0 && (
						<div
							className={
								'mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center'
							}
							data-cy="search-empty"
						>
							<h1 className={'text-2xl font-bold text-gray-800'}>
								{titreResultats({ search, city }, 0)}
							</h1>
							<p className={'text-gray-700'}>
								Essayez un autre mot (mariage, soirée, effets spéciaux…)
								{city ? ', une ville voisine ou la recherche sans ville' : ''}.
							</p>
							{city &&
								search &&
								search.toLowerCase() !== city.toLowerCase() && (
									<Link
										href={urlPageRecherche({ search })}
										className={'font-semibold text-indigo-900 underline'}
									>
										Chercher « {search} » partout
									</Link>
								)}
						</div>
					)}
					{statut === 'ok' && pagination.total > 0 && (
						<div className={'w-full px-4 md:px-16'}>
							<h1
								className={'mb-8 text-2xl font-bold text-gray-800'}
								data-cy="search-title"
							>
								{titreResultats(
									{ search, city },
									parLieu ? locaux.length : pagination.total
								)}
							</h1>
							{parLieu && locaux.length === 0 && (
								<p
									className={'-mt-4 mb-8 text-gray-700'}
									data-cy="search-aucun-local"
								>
									Aucune maquilleuse n’indique « {city} » (ville ou département)
									dans son profil.
								</p>
							)}
							{sections.locaux.length > 0 && (
								<ListeResultats
									resultats={sections.locaux}
									premier={pagination.premier}
									premierDeLaPage={pagination.premier}
									dataCy="search-results-locaux"
								/>
							)}
							{sections.autres.length > 0 && (
								<section aria-labelledby="search-autres-titre">
									<h2
										id="search-autres-titre"
										className={`mb-8 text-xl font-bold text-gray-800 ${
											sections.locaux.length > 0 ? 'mt-12' : ''
										}`}
										data-cy="search-autres-titre"
									>
										Autres maquilleuses qui se déplacent
									</h2>
									<ListeResultats
										resultats={sections.autres}
										premier={pagination.premier + sections.locaux.length}
										premierDeLaPage={pagination.premier}
										dataCy="search-results-autres"
									/>
								</section>
							)}
							{pagination.pages > 1 && (
								<nav
									aria-label="Pages de résultats"
									className={
										'mt-12 flex items-center justify-center gap-6 text-indigo-900'
									}
									data-cy="search-pagination"
								>
									{pagination.page > 1 && (
										<Link
											href={urlPageRecherche({
												search,
												city,
												page: pagination.page - 1,
											})}
											className={'min-h-[44px] px-2 py-2 font-semibold'}
										>
											Page précédente
										</Link>
									)}
									<span>
										Page {pagination.page} sur {pagination.pages}
									</span>
									{pagination.page < pagination.pages && (
										<Link
											href={urlPageRecherche({
												search,
												city,
												page: pagination.page + 1,
											})}
											className={'min-h-[44px] px-2 py-2 font-semibold'}
										>
											Page suivante
										</Link>
									)}
								</nav>
							)}
						</div>
					)}
				</main>
				<Footer />
			</div>
		</>
	)
}

/**
 * One list of result cards, ranked from `premier` (search_result_click).
 * The first card of the page is the largest picture above the fold on a
 * phone (its LCP): loaded at once and first; the others stay lazy.
 */
function ListeResultats({ resultats, premier, premierDeLaPage, dataCy }) {
	return (
		<ul
			className={'grid w-full grid-cols-1 gap-8 md:grid-cols-3 2xl:grid-cols-6'}
			data-cy={dataCy}
		>
			{resultats.map((result, index) => (
				<li key={result.id ?? premier + index} className={'col-span-1'}>
					<CarteResultat
						result={result}
						rang={premier + index}
						prioritaire={premier + index === premierDeLaPage}
					/>
				</li>
			))}
		</ul>
	)
}

function CarteResultat({ result, rang, prioritaire }) {
	const nom = nomAffiche(result)
	const zone = formatZone({ city: result.city, radius: result.action_radius })
	const competences = (Array.isArray(result.skills) ? result.skills : [])
		.map(skill => texte(skill?.name))
		.filter(Boolean)
		.slice(0, 7)
	const photo = photoPrincipale(result)
	const username = texte(result.username)

	return (
		<Link
			// the old URL of the profile answers a 308 to its slug
			href={`/profil/${encodeURIComponent(username)}`}
			data-cy={`search-result`}
			onClick={() =>
				track('search_result_click', { rank: rang, pid: result.id })
			}
			className={
				'flex w-full flex-col items-center rounded border border-gray-300 bg-white'
			}
		>
			<div className={'relative h-[350px] w-full'}>
				{/* UI-09: asked at the width it is drawn at (cover in a cell of
				    GRILLE_RESULTATS), sharp on a 3x phone as on a 2x screen */}
				<Image
					src={photo?.url || '/assets/pp_makeup.webp'}
					alt={photo ? `Photo de ${nom}` : ''}
					fill={true}
					sizes={sizesGrille(GRILLE_RESULTATS, {
						hauteur: HAUTEUR_PHOTO_CARTE,
						// the default picture is square
						ratio: photo ? ratioMedia(photo) : 1,
					})}
					quality={QUALITE_PHOTO}
					loading={prioritaire ? 'eager' : 'lazy'}
					fetchPriority={prioritaire ? 'high' : 'auto'}
					className={'rounded-b-none rounded-t object-cover object-center'}
				/>
				{result.pro === true && (
					<div
						className={
							'absolute left-0 top-0 flex items-center justify-center pt-4'
						}
					>
						<BadgeSuperMaquilleuse />
					</div>
				)}
				<div
					className={
						'absolute bottom-0 left-0 flex w-full flex-col bg-gradient-to-t from-black to-black/0 p-4'
					}
				>
					<div className={'flex flex-row items-baseline'}>
						<h2 className="text-2xl font-extrabold text-white">{nom}</h2>
						{result.pro === true && (
							<span className={'ml-2 translate-y-0.5 transform'}>
								<CheckCircleIcon className="h-5 w-5 text-white" />
							</span>
						)}
					</div>
					<div
						className={
							'flex flex-row items-center gap-2 text-sm font-light text-white'
						}
						data-cy="search-result-zone"
					>
						<span
							className="material-icons-round text-sm text-white"
							aria-hidden="true"
						>
							directions_run
						</span>
						{/* UI-10: an empty city is said, never left blank */}
						<span className={zone ? 'font-bold' : 'italic'}>
							{zone || 'Zone non renseignée'}
						</span>
					</div>
				</div>
			</div>
			<div className={'flex w-full flex-col gap-4 p-4 pt-6'}>
				{texte(result.speciality) && (
					<p className="text-lg font-bold text-gray-900">
						{texte(result.speciality)}
					</p>
				)}
				<div className={'flex flex-wrap items-center gap-1'}>
					{competences.length > 0 ? (
						competences.map((competence, index) => (
							<span
								key={index}
								className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
							>
								{competence}
							</span>
						))
					) : (
						<span
							className={
								'inline-flex flex-nowrap items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700'
							}
						>
							Aucune compétence renseignée
						</span>
					)}
				</div>
			</div>
		</Link>
	)
}

export default SearchPage
