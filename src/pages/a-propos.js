import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import CTA from '@/components/Global/CTA'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'

/**
 * @param props
 * @constructor
 */
function APropos(props) {
	return (
		<>
			<Head>
				<title>My-Makeup la plateforme de recherche de maquilleuse !</title>
				<meta
					name="description"
					content="Apprenez-en plus sur My-Makeup, votre plateforme de mise en relation entre maquilleuses professionnelles et clients. "
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr/a-propos" />
			</Head>

			<Nav />

			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					title={
						<>
							La solution de vos rêves&nbsp;:&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
					description={
						<>
							{
								'Découvrez comment My-Makeup peut aider les personnes à trouver la maquilleuse professionnelle qui leur correspond. Et comment nous pouvons aider les maquilleuses professionnelles à présenter leur travail et à se faire connaître de nouveaux clients.'
							}
						</>
					}
					isSearchDisplayed={false}
					isCTALoginDisplayed={true}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<header className="flex flex-col">
								<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
									À Propos de My-Makeup : Votre Partenaire Beauté en ligne
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`Bienvenue chez My-Makeup, votre partenaire beauté en ligne. Nous sommes une plateforme dédiée à la mise en relation de maquilleuses professionnelles et de clients à la recherche de services de maquillage personnalisés. Notre mission est simple : rendre la beauté accessible à tous.`}
								</p>
								<ul>
									<li>
										<h2>{'Notre histoire 📜'}</h2>
										<p>
											{`Créée en 2023, My-Makeup est née de la volonté de faciliter la recherche de maquilleuses professionnelles. Nous avons identifié une lacune dans le marché : il était difficile pour les clients de trouver des maquilleuses professionnelles qualifiées et pour ces dernières de promouvoir leurs services. Nous avons donc décidé de combler ce vide en créant une plateforme où les maquilleuses peuvent montrer leur travail et les clients peuvent trouver le professionnel qui correspond à leurs besoins.`}
										</p>
									</li>
									<li>
										<h2>{'Nos valeurs 💖'}</h2>
										<p>
											{`Chez My-Makeup, nous croyons que la beauté est un droit et non un luxe. Nous nous engageons à démocratiser l'accès aux services de beauté professionnels en rendant la recherche de maquilleuses facile et accessible à tous. Nous valorisons l'authenticité, la diversité et l'inclusivité, et nous nous efforçons de créer une communauté où chacun se sent valorisé et respecté.`}
										</p>
									</li>
									<li>
										<h2>{'Ce que nous faisons 🖌️'}</h2>
										<p>
											{`My-Makeup permet aux maquilleuses professionnelles de créer gratuitement un profil détaillé, de présenter leur travail et d'afficher leurs propres tarifs. Les particuliers peuvent rechercher des maquilleuses par ville et par spécialité, comparer les profils et contacter directement la maquilleuse de leur choix.`}
										</p>
									</li>
									<li>
										<h2>{'Rejoignez-nous ! 🤝'}</h2>
										<p>
											{`Que vous soyez une maquilleuse professionnelle cherchant à développer votre activité ou un client à la recherche de services de maquillage professionnels, nous vous invitons à rejoindre la communauté My-Makeup. Ensemble, nous pouvons rendre la beauté accessible à tous.`}
										</p>
									</li>
								</ul>
							</div>
							<h3 className={'flex items-center text-base text-gray-400'}>
								<span className="h-4 w-0.5 rounded-full bg-gray-200" />
								<span className="ml-3">{"L'équipe My-Makeup"}</span>
							</h3>
						</article>
					</div>
				</div>
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default APropos
