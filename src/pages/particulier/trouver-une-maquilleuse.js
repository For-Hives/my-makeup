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
function TrouverUneMaquilleuse(props) {
	return (
		<>
			<Head>
				<title>Trouver une maquilleuse !</title>
				<meta
					name="description"
					content="Découvrez comment vous pouvez trouver une maquilleuse simplement, et qui correspondra parfaitement à tout vos besoins !"
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/particulier/trouver-une-maquilleuse"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_africaine_white.webp'}
					title={
						<>
							Trouver une maquilleuse, avec&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
							&nbsp;{"ça n'a jamais été aussi simple !"}
						</>
					}
					description={
						<>
							Découvrez comment naviguer parmi les profils disponibles sur My
							Makeup et trouver la maquilleuse qui correspond à vos besoins et
							attentes.
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
									Trouver la maquilleuse qui vous correspond parmi les profils
									disponibles : Un guide complet
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									Que vous prépariez votre mariage, un événement spécial ou que
									vous souhaitiez simplement vous offrir une session de
									maquillage professionnel, le choix de la bonne maquilleuse est
									essentiel pour obtenir le look que vous désirez. Mais avec un
									si grand nombre de professionnels disponibles, comment faire
									le bon choix ? Ce guide vous aidera à naviguer parmi les
									profils disponibles et à trouver la maquilleuse qui vous
									correspond le mieux.
								</p>
								<ul>
									<li>
										<h2>Comprendre vos besoins 🤔</h2>
										<p>
											{`Avant de commencer votre recherche, il est important
														de comprendre ce que vous attendez d'une maquilleuse.
														Quel est l'événement ? Quel style de maquillage
														préférez-vous ? Avez-vous des allergies ou des
														préférences spécifiques en matière de produits ?
														Prenez le temps de répondre à ces questions avant de
														commencer votre recherche.`}
										</p>
									</li>
									<li>
										<h2>Utilisez des filtres de recherche 🔍</h2>
										<p>
											{`Sur la plateforme My-Makeup, vous pouvez utiliser des filtres de recherche pour affiner 
												votre sélection en fonction de critères spécifiques. Par exemple, vous pouvez 
												filtrer les maquilleuses par localisation, spécialités, formation, expérience et 
												évaluations. Ces filtres vous aideront à réduire le nombre de résultats de 
												recherche et à trouver plus facilement la maquilleuse qui vous correspond.`}
										</p>
									</li>
									<li>
										<h2>Consultez les profils 👀</h2>
										<p>
											{`Chaque maquilleuse sur My-Makeup a un profil détaillé où vous pouvez en apprendre plus sur son parcours, ses compétences et ses spécialités. Prenez le temps de lire attentivement ces profils pour comprendre ce que chaque maquilleuse a à offrir. Vous pouvez également consulter les photos de leur travail pour avoir une idée de leur style.`}
										</p>
									</li>
									<li>
										<h2>Lisez les avis 🌟</h2>
										<p>
											{`Les avis des clients précédents peuvent être une ressource précieuse pour choisir la bonne maquilleuse. Ils peuvent vous donner une idée de la qualité du travail de la maquilleuse, de son professionnalisme et de sa relation avec les clients. Sur My-Makeup, vous pouvez lire des avis vérifiés pour vous aider à prendre votre décision.`}
										</p>
									</li>
									<li>
										<h2>Discutez avec la maquilleuse 💬</h2>
										<p>
											{`Une fois que vous avez sélectionné quelques maquilleuses potentielles, prenez le temps de les contacter pour discuter de vos besoins et de vos attentes. C'est l'occasion de poser des questions, de discuter du tarif et de comprendre si vous vous sentez à l'aise avec cette personne. Après tout, le maquillage est une expérience personnelle et il est important de se sentir à l'aise avec la personne qui vous maquillera.
												
												En suivant ces étapes, vous serez en mesure de naviguer avec succès parmi les nombreux profils disponibles et de trouver la maquilleuse qui correspond parfaitement à vos besoins et à vos attentes. Bonne recherche !`}
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

export default TrouverUneMaquilleuse
