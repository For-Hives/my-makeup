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
					content="Découvrez comment utiliser la recherche par mot-clé et par ville de My-Makeup pour explorer les profils de maquilleuses et trouver celle qui vous correspond le mieux."
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
					imgBackgroundSrc={'/assets/back/maquilleuse_africaine_white.webp'}
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
									Explorer les profils de maquilleuses sur My-Makeup : Recherche
									par mot-clé et par ville
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`La recherche de la maquilleuse idéale peut sembler intimidante, mais My-Makeup facilite ce processus grâce à une recherche par mot-clé et par ville. Voici un guide pour vous aider à explorer les profils des maquilleuses sur notre plateforme.`}
								</p>
								<ul>
									<li>
										<h2>Définissez vos besoins et vos critères 📌</h2>
										<p>
											{`Avant de commencer votre recherche, prenez un moment pour définir vos besoins. Cherchez-vous une maquilleuse pour un mariage, une séance photo, un tutoriel de maquillage ou simplement pour un relooking quotidien ? Quel est votre budget ? Quelles sont vos préférences en termes de style de maquillage ? Quels sont vos besoins spécifiques (allergies, préférences pour les produits bio, etc.) ?`}
										</p>
									</li>
									<li>
										<h2>Lancez une recherche par mot-clé 🔎</h2>
										<p>
											{`Saisissez un mot-clé, par exemple une spécialité ou un type de prestation (mariage, soirée, artistique...), et, si vous le souhaitez, une ville. My-Makeup vous affiche les profils de maquilleuses qui correspondent à votre recherche.`}
										</p>
									</li>
									<li>
										<h2>Créez une shortlist 📝</h2>
										<p>
											{`Après votre recherche, créez une shortlist des maquilleuses qui correspondent le mieux à vos besoins. Consultez attentivement leurs profils pour en savoir plus sur leur parcours, leurs compétences et leurs styles. Les photos de leurs réalisations sont le meilleur moyen de juger de leur travail.`}
										</p>
									</li>
									<li>
										<h2>Recherche par ville 🏙️</h2>
										<p>
											{`Indiquer une ville vous permet de trouver des maquilleuses qui exercent près de chez vous ou là où se déroule votre événement. Pensez aussi à vérifier sur chaque profil la zone de déplacement indiquée par la maquilleuse.`}
										</p>
									</li>
									<li>
										<h2>Explorez les profils 📖</h2>
										<p>
											{`Une fois vos résultats affichés, prenez le temps d'explorer les profils des maquilleuses. Chaque maquilleuse présente elle-même sur sa page son parcours, ses compétences et son style, ainsi que des photos de son travail et ses tarifs lorsqu'elle les a renseignés.`}
										</p>
									</li>
									<li>
										<h2>Contactez la maquilleuse 💬</h2>
										<p>
											{`N'hésitez pas à contacter la maquilleuse qui vous intéresse pour discuter de vos besoins et de vos attentes. C'est l'occasion de lui poser des questions sur son approche du maquillage, ses disponibilités, les produits qu'elle utilise, etc. Cela vous aidera à déterminer si elle est la bonne personne pour vous. 
												En utilisant ces stratégies, vous pouvez explorer les profils sur My-Makeup, effectuer une recherche efficace par mot-clé et par ville, et trouver la maquilleuse idéale pour répondre à vos besoins.`}
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
