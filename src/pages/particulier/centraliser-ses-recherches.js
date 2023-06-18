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
function CentraliserSesRecherches(props) {
	return (
		<>
			<Head>
				<title>Centraliser ses recherches !</title>
				<meta
					name="description"
					content="Apprenez comment centraliser et organiser vos recherches pour comparer efficacement les maquilleuses et trouver celle qui vous correspond le mieux."
				/>
			</Head>
			<Nav />
			<div className={'relative'}>
				<Nav />
				<main className={'relative'}>
					<Hero
						title={
							<>
								Centraliser ses recherches avec&nbsp;
								<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
								&nbsp;{"ça n'a jamais été aussi simple !"}
							</>
						}
						description={
							<>
								Apprenez comment centraliser et organiser vos recherches pour
								comparer efficacement les maquilleuses et trouver celle qui vous
								correspond le mieux.
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
										Centraliser vos recherches pour trouver la maquilleuse qui
										vous correspond : Un guide complet
									</h1>
								</header>
								<div className="prose my-8 xl:prose-lg">
									<p>
										{`La recherche de la maquilleuse idéale peut parfois ressembler à la recherche d'une aiguille dans une botte de foin. Avec autant de
                                            maquilleuses professionnelles disponibles, il est essentiel de centraliser et d'organiser vos recherches pour trouver celle qui vous
                                            correspond le mieux. Voici un guide qui vous aidera à structurer vos recherches et à comparer efficacement les maquilleuses.`}
									</p>
									<ul>
										<li>
											<h2>Définissez vos besoins 🎯</h2>
											<p>
												{`La première étape consiste à définir clairement vos besoins et attentes. Quel type de maquillage recherchez-vous ? Pour quel type d'événement ? Quel est votre budget ? Quelles sont vos exigences spécifiques (allergies, préférences pour les produits bio, etc.) ? En répondant à ces questions, vous pourrez affiner vos recherches.`}
											</p>
										</li>
										<li>
											<h2>Utilisez une plateforme centralisée 🔍</h2>
											<p>
												{`Utilisez une plateforme comme My Makeup pour centraliser vos recherches. Grâce à ses filtres de recherche, vous pouvez trouver des maquilleuses en fonction de vos critères : localisation, spécialités, expérience, tarifs et évaluations des clients précédents.`}
											</p>
										</li>
										<li>
											<h2>Créez une shortlist 📝</h2>
											<p>
												{`Après avoir utilisé les filtres de recherche, créez une shortlist des maquilleuses qui correspondent le mieux à vos critères. Consultez attentivement leurs profils pour en savoir plus sur leur parcours, leurs compétences et leurs styles. Prenez en compte leurs photos de travail, leurs évaluations et leurs commentaires pour évaluer la qualité de leur travail.`}
											</p>
										</li>
										<li>
											<h2>Comparez les profils 🔄</h2>
											<p>
												{`Une fois votre shortlist établie, comparez les profils pour trouver la maquilleuse qui vous correspond le mieux. Prenez en compte tous les aspects : compétences, style, expérience, tarifs, avis des clients, etc. Cette comparaison vous aidera à prendre une décision éclairée.`}
											</p>
										</li>
										<li>
											<h2>Contactez les maquilleuses 💬</h2>
											<p>
												{`N'hésitez pas à contacter les maquilleuses de votre shortlist pour discuter de vos besoins et attentes. Posez-leur des questions sur leur disponibilité, leur manière de travailler, les produits qu'elles utilisent, etc. Cette interaction vous aidera à déterminer si vous vous sentez à l'aise avec elles et si elles peuvent répondre à vos attentes.`}
											</p>
										</li>
										<li>
											<h2>Prenez votre décision ✅</h2>
											<p>
												{`Après avoir comparé les profils et discuté avec les maquilleuses, il est temps de prendre votre décision. Choisissez la maquilleuse qui répond le mieux à vos critères et qui vous met le plus à l'aise.
                                                En centralisant et organisant vos recherches, vous pouvez efficacement comparer les maquilleuses et trouver celle qui correspond le mieux à vos besoins et attentes. Bonne chance dans vos recherches !`}
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

export default CentraliserSesRecherches
