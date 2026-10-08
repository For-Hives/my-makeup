import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Link from 'next/link'
import Hero from '@/components/Global/Hero'
import { EDITEUR } from '@/lib/legal'

/**
 * @param props
 * @constructor
 */
function Cgu(props) {
	return (
		<>
			<Head>
				<title>Conditions générales d&apos;utilisation - My-Makeup</title>
				<meta
					name="description"
					content="Les conditions générales d'utilisation de My-Makeup, l'annuaire gratuit de maquilleuses professionnelles."
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr/cgu" />
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					title={
						<>
							CGU&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
					description={<>{"Les règles d'utilisation de la plateforme."}</>}
					isSearchDisplayed={false}
					isCTALoginDisplayed={false}
					isSimpleVersionDisplayed={true}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<header className="flex flex-col">
								<h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
									Conditions générales d&apos;utilisation
								</h2>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>{`Dernière mise à jour : octobre 2026.`}</p>

								<h2>1. Objet</h2>
								<p>
									{`My-Makeup (my-makeup.fr) est un annuaire en ligne de maquilleuses professionnelles, édité par ${EDITEUR.nom} (voir les `}
									<Link href={'/mentions-legales'}>mentions légales</Link>
									{`). Ces conditions s'appliquent à toute personne qui consulte le site ou y crée un compte. Créer un compte vaut acceptation de ces conditions.`}
								</p>

								<h2>2. Ce que propose My-Makeup</h2>
								<ul>
									<li>
										{`Aux maquilleuses : une page professionnelle publique (présentation, spécialités, expériences, formations, portfolio, tarifs, coordonnées) qu'elles créent et modifient elles-mêmes.`}
									</li>
									<li>
										{`Aux particuliers : la recherche de maquilleuses par mot-clé et par ville, la consultation des profils et des articles, et le contact direct avec la maquilleuse choisie.`}
									</li>
									<li>
										{`Lorsqu'il est proposé sur un profil, un formulaire « Demander un devis » qui transmet la demande à la maquilleuse concernée.`}
									</li>
								</ul>
								<p>
									{`My-Makeup met en relation, sans être partie aux prestations : le devis, le prix, la date, le règlement et le déroulement de la prestation sont convenus directement entre la cliente ou le client et la maquilleuse. My-Makeup ne gère ni les rendez-vous, ni les règlements, n'affiche pas d'avis clients et ne prélève aucun montant sur les prestations.`}
								</p>

								<h2>3. Gratuité</h2>
								<p>
									{`Pour les maquilleuses, le cœur du service est gratuit, sans limite de durée : la page professionnelle, le portfolio, la publication des tarifs et la réception des demandes de devis. Si des services payants sont proposés un jour, ils seront facultatifs, annoncés à l'avance, et ne retireront rien à ce cœur gratuit. La consultation du site et l'envoi de demandes sont gratuits pour les particuliers.`}
								</p>

								<h2>4. Compte maquilleuse</h2>
								<p>
									{`L'inscription est réservée aux maquilleuses et maquilleurs professionnels ou en formation. Vous vous engagez à fournir des informations exactes, à les tenir à jour et à garder votre mot de passe confidentiel. Un compte correspond à une seule personne. Vous pouvez supprimer votre compte et votre profil à tout moment depuis votre espace.`}
								</p>

								<h2>5. Contenus publiés</h2>
								<p>
									{`Chaque maquilleuse est responsable de son profil. Elle garantit détenir les droits sur les textes et les photos qu'elle publie, et avoir l'accord des personnes photographiées. Elle autorise My-Makeup, gratuitement et pour la durée de la publication, à afficher ces contenus sur le site et dans les aperçus de partage de sa page. Les profils ne sont pas vérifiés par My-Makeup à ce jour.`}
								</p>

								<h2>6. Règles de conduite</h2>
								<p>{`Il est interdit :`}</p>
								<ul>
									<li>
										{`de publier un contenu illicite, trompeur, injurieux ou portant atteinte aux droits d'autrui ;`}
									</li>
									<li>{`de se faire passer pour une autre personne ;`}</li>
									<li>
										{`de collecter de façon automatisée les profils ou les coordonnées publiées, ou de les utiliser pour de la prospection non sollicitée ;`}
									</li>
									<li>
										{`de perturber le fonctionnement du site ou de tenter d'accéder aux comptes d'autres personnes.`}
									</li>
								</ul>
								<p>
									{`En cas de manquement, My-Makeup peut retirer un contenu, masquer un profil ou fermer un compte.`}
								</p>

								<h2>7. Demandes de devis</h2>
								<p>
									{`La demande envoyée par le formulaire est transmise à la maquilleuse concernée avec l'accord de la personne qui l'envoie. My-Makeup en assure le suivi mais ne garantit ni la disponibilité de la maquilleuse, ni sa réponse, ni la conclusion d'une prestation. Les données des demandes sont conservées 12 mois (voir la `}
									<Link href={'/politique-de-confidentialite'}>
										politique de confidentialité
									</Link>
									{`).`}
								</p>

								<h2>8. Signalement</h2>
								<p>
									{`Pour signaler un contenu ou un comportement contraire à ces conditions, écrivez à `}
									<a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
									{` en indiquant l'adresse de la page concernée et le motif.`}
								</p>

								<h2>9. Disponibilité et responsabilité</h2>
								<p>
									{`Le site est fourni en l'état : nous faisons de notre mieux pour qu'il soit disponible et exact, sans pouvoir le garantir. My-Makeup n'est pas responsable des prestations convenues entre les particuliers et les maquilleuses, ni des informations publiées par les maquilleuses.`}
								</p>

								<h2>10. Modification des conditions</h2>
								<p>
									{`Ces conditions peuvent évoluer. En cas de changement important, les maquilleuses inscrites sont prévenues par email avant son entrée en vigueur.`}
								</p>

								<h2>11. Droit applicable</h2>
								<p>
									{`Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ; à défaut, les tribunaux compétents sont ceux désignés par la loi.`}
								</p>
							</div>
						</article>
					</div>
				</div>
			</main>

			<Footer />
		</>
	)
}

export default Cgu
