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
							Trouvez Votre Maquilleuse Idéale avec My-Makeup
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
											{`Sur My-Makeup, vous pouvez consulter les profils détaillés des maquilleuses, y compris leurs portfolios, leurs spécialités, leurs tarifs et leurs évaluations. Cela vous permet de comparer facilement les différentes options et de choisir celle qui vous convient le mieux.`}
										</p>
									</li>
									<li>
										<h2>{'Prenez rendez-vous en toute simplicité 📅'}</h2>
										<p>
											{`Une fois que vous avez trouvé la maquilleuse qui vous convient, vous pouvez prendre rendez-vous directement sur notre plateforme. Pas besoin d'échanger des dizaines de mails ou d'appels, tout se fait en quelques clics !`}
										</p>
									</li>
									<li>
										<h2>{"Profitez d'un service sécurisé 💼"}</h2>
										<p>
											{`Avec My-Makeup, la sécurité est notre priorité. Toutes les maquilleuses sur notre plateforme sont vérifiées et vous pouvez lire les commentaires des autres clients pour vous assurer de la qualité de leur service. De plus, notre système de paiement sécurisé vous garantit une transaction sans tracas.`}
										</p>
									</li>
									<li>
										<h2>{'Un service client dédié à votre écoute 📞'}</h2>
										<p>
											{`Si vous avez des questions ou rencontrez un problème, notre équipe de service client est là pour vous aider. Nous sommes déterminés à faire de votre expérience avec My-Makeup une expérience positive et sans stress.
												
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
