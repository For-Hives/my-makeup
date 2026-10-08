import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import { urlAbsolue } from '@/lib/seo/url'

/**
 * @param props
 * @constructor
 */
function Partenariats(props) {
	return (
		<>
			<Head>
				<title>Communauté et partenariats !</title>
				<meta
					name="description"
					content="Communauté et partenariat chez My-Makeup : une page professionnelle gratuite pour présenter votre travail, et une équipe à l'écoute des maquilleuses."
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href={urlAbsolue('/maquilleuse/partenariats')} />
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_italienne_white.webp'}
					title={
						<>
							Communauté et partenariats, avec&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
							&nbsp;
							{'présentez votre travail gratuitement !'}
						</>
					}
					description={
						<>
							{
								'Découvrez comment My-Makeup aide les maquilleuses professionnelles à présenter leur travail et à se faire connaître des particuliers.'
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
									Communauté et partenariat chez My-Makeup : une plateforme
									construite avec les maquilleuses
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`Chez My-Makeup, nous voulons aider les maquilleuses professionnelles à se faire connaître des particuliers qui cherchent une maquilleuse. Voici ce que la plateforme vous apporte aujourd'hui.`}
								</p>
								<ul>
									<li>
										<h2>{'Une page professionnelle gratuite 🌐'}</h2>
										<p>
											{`En rejoignant les maquilleuses professionnelles inscrites sur My-Makeup, vous créez gratuitement votre page : présentation, spécialités, portfolio, tarifs et coordonnées. Les particuliers qui cherchent une maquilleuse par mot-clé et par ville peuvent la trouver et vous contacter directement.`}
										</p>
									</li>
									<li>
										<h2>Partenariat : vous restez libre 🏆</h2>
										<p>
											{`Nous considérons chaque maquilleuse inscrite comme une partenaire. Vous fixez vos tarifs, vous choisissez les coordonnées que vous affichez et vous convenez directement avec vos clientes de vos prestations : My-Makeup ne prélève aucun montant sur vos prestations. De notre côté, nous travaillons à faire connaître la plateforme auprès des particuliers.`}
										</p>
									</li>
									<li>
										<h2>Mettez en valeur votre parcours 🚀</h2>
										<p>
											{`Votre page présente vos expériences, vos formations, vos compétences, vos langues et les photos de vos réalisations. Vous la mettez à jour quand vous le souhaitez depuis votre espace, et vous pouvez la partager sur vos réseaux sociaux ou dans votre bio Instagram : c'est votre vitrine professionnelle.`}
										</p>
									</li>
									<li>
										<h2>Votre voix compte : Nous sommes à votre écoute 👂</h2>
										<p>
											{`Votre expérience, vos idées et vos opinions sont importantes pour nous. Écrivez-nous depuis la page Contact pour partager vos retours et vos suggestions : ils nous aident à décider des prochaines améliorations de la plateforme.
												En résumé, My-Makeup est une plateforme de mise en relation gratuite pour les maquilleuses : une page pour présenter votre travail, des particuliers qui vous contactent directement, et une équipe à votre écoute.`}
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

export default Partenariats
