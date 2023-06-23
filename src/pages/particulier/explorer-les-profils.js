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
function ExplorerLesProfils(props) {
	return (
		<>
			<Head>
				<title>Explorer les profils !</title>
				<meta
					name="description"
					content="Découvrez comment utiliser les critères de recherche et la fonction de recherche par ville de My Makeup
                    pour explorer les profils de maquilleuses et trouver celle qui vous correspond le mieux."
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/particulier/explorer-les-profils"
				/>
			</Head>

			<Nav />

			<main className={'relative'}>
				<Hero
					title={
						<>
							Explorer les profils avec&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
							&nbsp;{"ça n'a jamais été aussi simple !"}
						</>
					}
					description={
						<>
							{
								"Apprenez comment My-Makeup peut vous permettre, via l'exploration des profils des maquilleuses, de trouver celle qui vous correspond le mieux."
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
									Explorer les profils de maquilleuses sur My Makeup : Recherche
									par critères et par ville
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`La recherche de la maquilleuse idéale peut sembler intimidante, mais My Makeup facilite ce processus grâce à des critères de recherche précis et une navigation par ville. Voici un guide pour vous aider à naviguer et à explorer les profils des maquilleuses sur notre plateforme.`}
								</p>
								<ul>
									<li>
										<h2>Définissez vos besoins et vos critères 📌</h2>
										<p>
											{`Avant de commencer votre recherche, prenez un moment pour définir vos besoins. Cherchez-vous une maquilleuse pour un mariage, une séance photo, un tutoriel de maquillage ou simplement pour un relooking quotidien ? Quel est votre budget ? Quelles sont vos préférences en termes de style de maquillage ? Quels sont vos besoins spécifiques (allergies, préférences pour les produits bio, etc.) ?`}
										</p>
									</li>
									<li>
										<h2>Utilisez les filtres de recherche 🔎</h2>
										<p>
											{`My Makeup propose une variété de filtres de recherche pour vous aider à trouver la maquilleuse idéale. Vous pouvez rechercher par spécialités (maquillage de mariage, maquillage de soirée, etc.), par expérience (nombre d'années d'expérience, diplômes, etc.), par tarifs.`}
										</p>
									</li>
									<li>
										<h2>Créez une shortlist 📝</h2>
										<p>
											{`Après avoir utilisé les filtres de recherche, créez une shortlist des maquilleuses qui correspondent le mieux à vos critères. Consultez attentivement leurs profils pour en savoir plus sur leur parcours, leurs compétences et leurs styles. Prenez en compte leurs photos de travail, leurs évaluations pour évaluer la qualité de leur travail.`}
										</p>
									</li>
									<li>
										<h2>Recherche par ville 🏙️</h2>
										<p>
											{`Une des fonctionnalités les plus pratiques de My Makeup est la possibilité de rechercher par ville. Cela vous permet de trouver des maquilleuses disponibles dans votre localité. C'est particulièrement utile si vous recherchez une maquilleuse pour un événement spécifique ou si vous préférez avoir un rendez-vous en personne plutôt que virtuel.`}
										</p>
									</li>
									<li>
										<h2>Explorez les profils 📖</h2>
										<p>
											{`Une fois que vous avez utilisé les filtres de recherche pour affiner vos résultats, prenez le temps d'explorer les profils des maquilleuses. Chaque maquilleuse sur My Makeup a un profil détaillé où vous pouvez en savoir plus sur son parcours, ses compétences, son style et sa philosophie de travail. Vous pouvez également voir des photos de son travail, et voir ses tarifs.`}
										</p>
									</li>
									<li>
										<h2>Contactez la maquilleuse 💬</h2>
										<p>
											{`N'hésitez pas à contacter la maquilleuse qui vous intéresse pour discuter de vos besoins et de vos attentes. C'est l'occasion de lui poser des questions sur son approche du maquillage, ses disponibilités, les produits qu'elle utilise, etc. Cela vous aidera à déterminer si elle est la bonne personne pour vous. 
												En utilisant ces stratégies, vous pouvez explorer les profils sur My Makeup, effectuer une recherche efficace par critères et par ville, et trouver la maquilleuse idéale pour répondre à vos besoins.`}
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

export default ExplorerLesProfils
