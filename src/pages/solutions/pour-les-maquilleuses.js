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
function PourLesMaquilleuses(props) {
	return (
		<>
			<Head>
				<title>Solutions My Makeup pour les Maquilleuses !</title>
				<meta
					name="description"
					content="Avec notre plateforme, donner un coup de boost à votre carrière n'a jamais été aussi simple !"
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/solutions/pour-les-maquilleuses"
				/>
			</Head>

			<Nav />

			<main className={'relative'}>
				<Hero
					title={
						<>
							La solution de vos rêves&nbsp;:&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
					description={
						<>
							{
								"Découvrez comment My Makeup peut aider les maquilleuses professionnelles à développer leur activité, à trouver de nouveaux clients et à découvrir de nouvelles opportunités. Avec notre plateforme, donner un coup de boost à votre carrière n'a jamais été aussi simple !"
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
									Solutions My Makeup pour les Maquilleuses : Le Seul Endroit
									pour Trouver des Clients, Développer Votre Activité et
									Découvrir des Opportunités
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`Vous êtes une maquilleuse professionnelle et vous cherchez à développer votre activité ? Avec My Makeup, vous disposez d'une plateforme conçue pour faciliter la connexion avec des clients potentiels, vous offrir de nouvelles opportunités et soutenir la croissance de votre activité. Voici comment.`}
								</p>
								<ul>
									<li>
										<h2>{'Accédez à une base de clients plus large 👥'}</h2>
										<p>
											{`Grâce à My Makeup, vous pouvez atteindre une vaste base de clients à la recherche de services de maquillage professionnels. Que vous soyez spécialisée en maquillage de mariage, en maquillage bio ou en maquillage artistique pour des événements spéciaux, notre plateforme vous permet de vous connecter facilement avec des clients à la recherche de vos compétences.`}
										</p>
									</li>
									<li>
										<h2>{'Présentez votre travail et vos compétences 🎨'}</h2>
										<p>
											{`My Makeup vous permet de créer un profil détaillé où vous pouvez présenter vos compétences, votre expérience, vos diplômes et votre portfolio. C'est l'endroit idéal pour montrer ce qui fait de vous une maquilleuse exceptionnelle et pour attirer des clients à la recherche de vos services spécifiques.`}
										</p>
									</li>
									<li>
										<h2>{'Gérez vos rendez-vous facilement 📅'}</h2>
										<p>
											{`Notre plateforme simplifie la gestion de vos rendez-vous. Vous pouvez définir vos disponibilités, accepter de nouvelles réservations et gérer vos rendez-vous existants, le tout à partir d'un seul endroit.`}
										</p>
									</li>
									<li>
										<h2>{'Un service client dédié à votre écoute 📞'}</h2>
										<p>
											{`Si vous avez des questions ou rencontrez un problème, notre équipe de service client est là pour vous aider. Nous sommes déterminés à faire de votre expérience avec My Makeup une expérience positive et productive. 
												En résumé, My Makeup est l'endroit idéal pour les maquilleuses qui cherchent à développer leur activité, à trouver de nouveaux clients et à découvrir de nouvelles opportunités. Rejoignez-nous aujourd'hui et commencez à transformer votre carrière de maquilleuse !`}
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

export default PourLesMaquilleuses
