import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Image from 'next/image'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'

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
					content="Community et Partenariat chez My Makeup : Votre développement est notre priorité"
				/>
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
								Communauté et partenariats ... avec&nbsp;
								<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
								&nbsp;
								{'vous avez accès à un réseau très largement avantageux !'}
							</>
						}
						description={
							<>
								{
									'Découvrez comment My Makeup, avec son approche axée sur la communauté et le partenariat, soutient les maquilleuses professionnelles dans leur développement et leur croissance.'
								}
							</>
						}
					/>
					<div className={'relative mx-auto my-48 max-w-7xl'}>
						<div className="mx-auto max-w-2xl">
							<article>
								<header className="flex flex-col">
									<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:text-4xl">
										Community et Partenariat chez My Makeup : Nous sommes là
										pour accompagner votre développement
									</h1>
								</header>
								<div className="prose my-8 xl:prose-lg">
									<p>
										{`Chez My Makeup, nous avons à cœur de soutenir les maquilleuses professionnelles dans leur parcours et leur croissance. Avec une approche centrée sur la communauté et le partenariat, nous sommes là pour vous accompagner dans chaque étape de votre développement. Voici comment.`}
									</p>
									<ul>
										<li>
											<h2>{"Communauté : Vous n'êtes pas seule 🌐"}</h2>
											<p>
												{`En rejoignant My Makeup, vous devenez membre d'une communauté dynamique et solidaire de maquilleuses professionnelles. Vous pouvez échanger des idées, partager des conseils, discuter des dernières tendances et même trouver un soutien lors des moments difficiles. En plus, notre plateforme offre des opportunités de réseautage et de collaborations enrichissantes.`}
											</p>
										</li>
										<li>
											<h2>
												Partenariat : Nous travaillons ensemble pour votre
												succès 🏆
											</h2>
											<p>
												{`Nous considérons chaque maquilleuse sur notre plateforme comme une partenaire. Nous travaillons main dans la main avec vous pour vous aider à atteindre vos objectifs. Qu'il s'agisse d'accroître votre visibilité, d'élargir votre clientèle, d'augmenter vos revenus ou de vous perfectionner dans votre art, nous mettons à votre disposition les ressources et le soutien nécessaires.`}
											</p>
										</li>
										<li>
											<h2>
												Développement professionnel : Nous vous aidons à vous
												améliorer 🚀
											</h2>
											<p>
												{`Chez My Makeup, nous ne nous contentons pas de vous mettre en relation avec des clients. Nous nous engageons à vous aider à vous développer en tant que professionnelle. Grâce à nos ateliers, nos formations en ligne et nos ressources pédagogiques, vous pouvez améliorer vos compétences, vous tenir au courant des dernières techniques de maquillage et même apprendre à gérer votre activité de manière plus efficace.`}
											</p>
										</li>
										<li>
											<h2>Votre voix compte : Nous sommes à votre écoute 👂</h2>
											<p>
												{`Votre expérience, vos idées et vos opinions sont importantes pour nous. Nous vous encourageons à partager vos feedbacks et vos suggestions pour améliorer notre plateforme. En tant que partenaire, vous avez une voix dans la façon dont nous évoluons et grandissons. 
												En résumé, My Makeup n'est pas seulement une plateforme de mise en relation, c'est une communauté et un partenaire dédié à votre réussite. Nous sommes là pour vous accompagner, vous soutenir et vous aider à prospérer en tant que maquilleuse professionnelle.`}
											</p>
										</li>
									</ul>
								</div>
								<h3 className={'flex items-center text-base text-gray-400'}>
									<span className="h-4 w-0.5 rounded-full bg-gray-200 dark:bg-gray-500" />
									<span className="ml-3">{"L'équipe My-Makeup"}</span>
								</h3>
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

export default Partenariats
