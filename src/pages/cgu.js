import React from 'react'

import Head from 'next/head'

import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

/**
 * @param props
 * @constructor
 */
function Cgu(props) {
	return (
		<>
			<Head>
				<title>CGU My-Makeup !</title>
				<meta
					content="Les conditions générales d'utilisation de My-Makeup, votre plateforme de mise en relation entre maquilleuses professionnelles et clients."
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link href="https://my-makeup.fr/cgu" rel="canonical" />
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					description={<>{"Tout l'aspect légal de la plateforme."}</>}
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					isCTALoginDisplayed={false}
					isSearchDisplayed={false}
					isSimpleVersionDisplayed={true}
					title={
						<>
							CGU&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
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
									{
										"La plateforme appartient à l'entreprise Andy Cinquin, micro-entreprise."
									}
								</h1>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>
									{`
                                            SIRET : 880 505 276 00019
										`}
								</p>
								<p>
									{`
											Siège social : 72 Avenue Camus, Nantes
										`}
								</p>
								<p>
									{`
											Directeur de la publication : Andy Cinquin
										`}
								</p>
								<p>
									{`
											Hébergé par : Contabo GmbH, Aschauer Straße 32a, 81549 Munich, Germany
										`}
								</p>
								<h3>{`Contact`}</h3>
								<p>
									{`support@my-makeup.fr`}
									<br />
									{`+33(0)6 21 58 26 84`}
								</p>
								<h3>{`Abus`}</h3>
								<p>
									{`Pour signaler un contenu litigieux ou si vous êtes victime d'une utilisation frauduleuse d'un service My-Makeup, veuillez nous contacter via
                                            l'email support@my-makeup.fr.`}
								</p>
								<h3>{`Propriété intellectuelle`}</h3>
								<p>
									{`Ce site web et tous ses contenus (y compris les données, informations, photos, logos et marques) sont la propriété exclusive de My-Makeup
                                            ou
                                            de ses partenaires. Toute reproduction, représentation, traduction, adaptation ou citation, intégrale ou partielle, quel que soit le procédé
                                            ou
                                            le support, est strictement interdite sauf disposition légale ou autorisation expresse de leur propriétaire. Les photos ne sont pas
                                            contractuelles.`}
								</p>
								<h3>{`Données personnelles`}</h3>
								<p>
									{`Vous pouvez visiter notre site internet sans avoir à dévoiler votre identité ou à fournir des informations personnelles vous concernant.
                                            Cependant, nous pouvons parfois vous demander des informations pour traiter une commande, identifier une demande de support, établir une
                                            correspondance, fournir un abonnement, ou postuler à un poste.`}
								</p>
								<h3>{`Avis et procédure pour faire des réclamations en cas de violation de droits d'auteur`}</h3>
								<p>
									{`Si vous estimez que votre œuvre a été copiée de manière à constituer une violation des droits d'auteur, veuillez fournir à notre agent de
                                            droits
                                            d'auteur les informations écrites spécifiées ci-dessous. Veuillez noter que cette procédure est exclusivement destinée à notifier à
                                            My-Makeup
                                            que votre matériel protégé par le droit d'auteur a été violé.`}
								</p>
								<p>
									{`Une signature électronique ou physique de la personne autorisée à agir au nom du propriétaire des droits d'auteur ;`}
									<br />
									{`Une description de l'œuvre protégée par le droit d'auteur que vous estimez avoir été violée ;`}
									<br />
									{`Une description de l'endroit où le matériel que vous estimez être en violation se trouve sur le Site ;`}
									<br />
									{`Votre adresse, numéro de téléphone, et adresse e-mail ;`}
									<br />
									{`Une déclaration de votre part que vous avez une croyance de bonne foi que l'utilisation contestée n'est pas autorisée par le propriétaire du
                                            droit d'auteur, son agent, ou la loi ;`}
									<br />
									{`Une déclaration de votre part, faite sous peine de parjure, que les informations ci-dessus dans votre avis sont précises et que vous êtes le
                                            propriétaire du droit d'auteur ou autorisé à agir au nom du propriétaire du droit d'auteur.`}
								</p>
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

export default Cgu
