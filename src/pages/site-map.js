import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Head from 'next/head'
import Image from 'next/image'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import Link from 'next/link'

/**
 * @param props
 * @constructor
 */
function SiteMap({ articles, talents }) {
	return (
		<>
			<Head>
				<title>Site Map My Makeup !</title>
				<meta name="description" content="Le plan du site de My Makeup" />
			</Head>

			<Nav />

			<div className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				<Nav />
				<main className={'relative'}>
					<ResponsiveTemporary />
					<Hero
						title={
							<>
								Le plan du site&nbsp;
								<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
							</>
						}
						description={
							<>
								{
									"La globalité de toutes les pages qui sont présentes dans l'arborescence du site !"
								}
							</>
						}
					/>
					<div className={'relative mx-auto my-48 max-w-7xl'}>
						<div className="mx-auto max-w-2xl">
							<article>
								<header className="flex flex-col">
									<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:text-4xl">
										{'My Makeup la plateforme pour les maquilleuses !'}
									</h1>
								</header>
								<div className="prose my-8 xl:prose-lg">
									<h2>My Makeup</h2>
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
											<Link href={'/particulier'}>Pourquoi My Makeup ?</Link>
										</li>
										<li>
											<Link href={'/particulier/trouver-une-maquilleuse'}>
												Trouver des maquilleuses
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
											<Link href={'/maquilleuse'}>Pourquoi My Makeup ?</Link>
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
															<Link href={element?.attributes?.slug}>
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
															<Link href={element?.attributes?.slug}>
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
			</div>
			<Footer />
		</>
	)
}

export default SiteMap

async function fetchAPI(url) {
	const res = await fetch(url, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	})
	return res.json()
}

export async function getStaticProps() {
	const articles = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}api/articles`
	)
	const talents = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}api/talents`
	)

	return {
		props: { articles: articles.data, talents: talents.data },
	}
}
