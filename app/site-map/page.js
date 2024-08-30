import Link from 'next/link'

import getAllArticle from '@/services/getAllArticle'
import getAllTalent from '@/services/getAllTalent'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

export const metadata = {
	// seo tag canonical link
	alternates: {
		canonical: 'https://my-makeup.fr/site-map',
	},
	description: 'Le plan du site de My-Makeup',
	title: 'Site Map My-Makeup !',
}

async function SiteMap() {
	const articles = await getAllArticle()
	const talents = await getAllTalent()

	return (
		<>
			<Nav />

			<main className={'relative'}>
				<Hero
					description={
						<>
							{
								"La globalité de toutes les pages qui sont présentes dans l'arborescence du site !"
							}
						</>
					}
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					isCTALoginDisplayed={false}
					isSearchDisplayed={false}
					isSimpleVersionDisplayed={true}
					title={
						<>
							Le plan du site&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<header className="flex flex-col">
								<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
									{'My-Makeup la plateforme pour les maquilleuses !'}
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<h2>My-Makeup</h2>
								<ul>
									<li>
										<Link href={'/a-propos'}>À propos</Link>
									</li>
									<li>
										<Link href={'/contact'}>Contact</Link>
									</li>
								</ul>
								<h2>Pour les particulier</h2>
								<ul>
									<li>
										<Link
											href={
												'/pourquoi-utiliser-my-makeup-en-tant-que-particulier'
											}
										>
											Pourquoi My-Makeup ?
										</Link>
									</li>
									<li>
										<Link href={'/particulier/trouver-une-maquilleuse'}>
											Trouver une maquilleuse
										</Link>
									</li>
									<li>
										<Link href={'/particulier/centraliser-ses-recherches'}>
											Centraliser ses recherches
										</Link>
									</li>
									<li>
										<Link href={'/particulier/explorer-les-profils'}>
											Explorer les profils
										</Link>
									</li>
								</ul>
								<h3>Pour les maquilleuses</h3>
								<ul>
									<li>
										<Link
											href={
												'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse'
											}
										>
											Pourquoi My-Makeup ?
										</Link>
									</li>
									<li>
										<Link href={'/maquilleuse/partenariats'}>
											Communautés & Partenariats
										</Link>
									</li>
								</ul>
								<h3>Par rapport à la solution</h3>
								<ul>
									<li>
										<Link href={'/solutions/pour-les-particuliers'}>
											Solution pour les particuliers
										</Link>
									</li>
									<li>
										<Link href={'/solutions/pour-les-maquilleuses'}>
											Solution pour les maquilleuses
										</Link>
									</li>
									<li>
										<Link href={'/blog'}>Blog</Link>
									</li>
								</ul>
								<h3>Légal</h3>
								<ul>
									<li>
										<Link href={'/cgu'}>CGU</Link>
									</li>
									<li>
										<Link href={'/cgu'}>Mentions légales</Link>
									</li>
									<li>
										<Link href={'/politique-de-confidentialite'}>
											Politique de confidentialité
										</Link>
									</li>
								</ul>
								<h3>Blog</h3>
								<ul>
									{articles
										? articles.map(element => {
												return (
													<li key={element.id}>
														<Link href={`/blog/${element?.attributes?.slug}`}>
															{element?.attributes?.title}
														</Link>
													</li>
												)
											})
										: null}
								</ul>
								<h3>Talents</h3>
								<ul>
									{talents
										? talents.map(element => {
												return (
													<li key={element.id}>
														<Link href={`/talent/${element?.attributes?.slug}`}>
															{element?.attributes?.title}
														</Link>
													</li>
												)
											})
										: null}
								</ul>
							</div>
						</article>
					</div>
				</div>
				<CTA />
			</main>
			<Footer />
		</>
	)
}

export default SiteMap
