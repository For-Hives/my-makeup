import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'

/**
 * @param props
 * @constructor
 */
function PourLesParticuliers(props) {
	return (
		<>
			<Head>
				<title>Solutions My-Makeup pour les Particuliers !</title>
				<meta
					name="description"
					content="Découvrez comment My-Makeup simplifie la recherche de la maquilleuse professionnelle idéale. Grâce à notre plateforme intuitive, trouver la maquilleuse de vos rêves n'a jamais été aussi simple !"
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/solutions/pour-les-particuliers"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_asiatique_white.webp'}
					title={
						<>
							Trouvez Votre Maquilleuse Idéale avec&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup&nbsp;</span>
							La solution de vos rêves&nbsp;!
						</>
					}
					description={
						<>
							{
								'Découvrez comment My-Makeup vous donne accès à un large éventail de maquilleuses professionnelles pour trouver celle qui vous correspond le mieux.'
							}
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
									{`Solutions My-Makeup pour les Particuliers : Trouver la
											Maquilleuse de vos Rêves n'a Jamais été Aussi Simple !`}
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`Nous savons à quel point il peut être difficile de trouver la maquilleuse professionnelle qui répond parfaitement à vos besoins. C'est pourquoi chez My-Makeup, nous avons simplifié ce processus pour vous. Voici comment notre plateforme rend la recherche de la maquilleuse de vos rêves plus facile que jamais.`}
								</p>
								<ul>
									<li>
										<h2>{'Une recherche simplifiée 🕵️‍♀️'}</h2>
										<p>
											{`Avec notre moteur de recherche avancé, vous pouvez trouver la maquilleuse professionnelle qui correspond à vos critères en un clin d'œil. Que vous cherchiez une experte en maquillage de mariage, une spécialiste du maquillage bio ou une artiste maquilleuse pour un événement spécial, notre plateforme vous donne accès à un large éventail de profils pour trouver votre perle rare.`}
										</p>
									</li>
									<li>
										<h2>{'Comparez et choisissez 🔄'}</h2>
										<p>
											{`Sur My-Makeup, vous pouvez consulter les profils détaillés des maquilleuses, y compris leurs portfolios, leurs spécialités et leurs tarifs. Cela vous permet de comparer facilement les différentes options et de choisir celle qui vous convient le mieux.`}
										</p>
									</li>
									<li>
										<h2>{'Contactez directement la maquilleuse 📅'}</h2>
										<p>
											{`Une fois que vous avez trouvé la maquilleuse qui vous convient, contactez-la directement avec les coordonnées indiquées sur son profil pour convenir ensemble de la prestation, de la date et du tarif.`}
										</p>
									</li>
									<li>
										<h2>{'Des profils présentés par les maquilleuses 💼'}</h2>
										<p>
											{`Chaque maquilleuse présente elle-même son parcours, ses formations et ses réalisations. My-Makeup ne gère ni les rendez-vous ni les règlements : vous convenez directement avec elle du devis et des modalités.`}
										</p>
									</li>
									<li>
										<h2>{'Une question ? 📞'}</h2>
										<p>
											{`Si vous avez des questions ou rencontrez un problème, écrivez-nous depuis la page Contact. Nous sommes déterminés à faire de votre expérience avec My-Makeup une expérience positive et sans stress.
												
												En somme, My-Makeup simplifie votre recherche de la maquilleuse parfaite. Avec nous, trouver la maquilleuse de vos rêves n'a jamais été aussi simple !`}
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

export default PourLesParticuliers
