import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Link from 'next/link'
import Hero from '@/components/Global/Hero'
import MeasureOptOut from '@/components/Global/MeasureOptOut'
import { EDITEUR, formatSiret } from '@/lib/legal'

function PolitiqueDeConfidentialite() {
	return (
		<>
			<Head>
				<title>Politique de confidentialité - My-Makeup</title>
				<meta
					name="description"
					content="Quelles données My-Makeup traite, pourquoi, combien de temps, avec quels prestataires, et comment exercer vos droits."
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/politique-de-confidentialite"
				/>
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					title={
						<>
							Politique de confidentialité de&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
					description={<>{'Vos données, en clair.'}</>}
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
									Politique de confidentialité
								</h2>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<p>{`Dernière mise à jour : octobre 2026.`}</p>
								<p>
									{`Cette page explique quelles données personnelles My-Makeup traite, pourquoi, combien de temps, avec quels prestataires, et comment exercer vos droits, conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.`}
								</p>

								<h2>Responsable du traitement</h2>
								<p>
									{`${EDITEUR.nom}, ${EDITEUR.forme} (SIRET ${formatSiret(EDITEUR.siret)}), ${EDITEUR.adresse}. Contact : `}
									<a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
									{'. Voir aussi les '}
									<Link href={'/mentions-legales'}>mentions légales</Link>
									{'.'}
								</p>

								<h2>Comptes et profils des maquilleuses</h2>
								<p>
									{`Données : adresse email, nom de compte, mot de passe (enregistré sous forme chiffrée, jamais en clair) et les informations que vous choisissez de publier sur votre profil (nom, prénom, nom d'artiste, ville et zone de déplacement, spécialité, description, expériences, formations, langues, tarifs, photos, coordonnées et réseaux sociaux).`}
								</p>
								<p>
									{`Pourquoi : créer votre compte et afficher votre page professionnelle. Votre profil est public : les informations et coordonnées que vous y publiez sont visibles par tous les visiteurs. Nous pouvons aussi vous écrire au sujet de votre page et du service (nouveautés, conseils, rappels) ; chaque email permet de se désinscrire.`}
								</p>
								<p>
									{`Base légale : l'exécution des conditions d'utilisation que vous acceptez à l'inscription ; notre intérêt légitime pour les emails liés au service.`}
								</p>
								<p>
									{`Durée : tant que votre compte existe. Vous pouvez supprimer votre compte et votre profil depuis votre espace ; pour faire effacer aussi les photos déjà envoyées, écrivez-nous.`}
								</p>
								<p>
									{`Si vous choisissez « Se connecter avec Google », Google nous transmet votre nom et votre adresse email pour créer ou ouvrir votre compte.`}
								</p>

								<h2>Formulaire de contact</h2>
								<p>
									{`Données : nom, prénom, email, téléphone et message. Ils nous sont envoyés par email via le service Mailgun pour vous répondre (intérêt légitime). Durée : 12 mois après notre dernier échange.`}
								</p>

								<h2>Demandes de devis</h2>
								<p>
									{`Lorsque le bouton « Demander un devis » est proposé sur un profil, il ouvre un formulaire en ligne fourni par un prestataire hébergé dans l'Union européenne, qui agit pour notre compte en tant que sous-traitant, avec un contrat conforme à l'article 28 du RGPD.`}
								</p>
								<p>
									{`Données : type de prestation, date, commune, nombre de personnes, essai, budget indicatif, message, prénom, email et téléphone (facultatif), ainsi que le profil depuis lequel la demande est faite et la provenance de la visite (paramètres de campagne, nom du site précédent, sans l'adresse complète de la page).`}
								</p>
								<p>
									{`Pourquoi : transmettre votre demande à la maquilleuse choisie, avec votre accord donné dans le formulaire, et suivre qu'une réponse vous a bien été apportée. Si elle n'est pas disponible, nous pouvons vous proposer une autre maquilleuse, toujours avec votre accord.`}
								</p>
								<p>
									{`Durée : 12 mois, puis suppression, y compris dans notre boîte email et dans l'outil de formulaire. Nos statistiques de suivi ne contiennent aucune donnée permettant de vous identifier.`}
								</p>

								<h2>Mesure d&apos;audience</h2>
								<p>
									{`Nous mesurons la fréquentation du site avec Umami, un outil que nous installons et administrons nous-mêmes, sur un serveur loué (voir « Hébergement et prestataires »). Il ne dépose aucun cookie, n'enregistre aucun identifiant sur votre appareil et ne conserve pas votre adresse IP. Il compte les pages vues, le site de provenance, le type d'appareil et de navigateur, le pays, et les clics sur certains boutons (contact d'une maquilleuse, demande de devis, recherche) sans jamais enregistrer ce que vous saisissez, ni votre identité, ni vos coordonnées.`}
								</p>
								<p>
									{`Pourquoi : savoir ce qui aide vraiment les maquilleuses à être contactées (intérêt légitime). Cette mesure est limitée à des statistiques anonymes et ne nécessite donc pas votre consentement. Nous n'utilisons plus Google Analytics. Vous pouvez vous y opposer sur ce navigateur :`}
								</p>
								<div>
									<MeasureOptOut />
								</div>

								<h2>Journaux techniques</h2>
								<p>
									{`Nos serveurs enregistrent les requêtes reçues (adresse IP, date, page demandée) pour assurer la sécurité du service et diagnostiquer les pannes (intérêt légitime). Ces journaux sont conservés 90 jours au plus.`}
								</p>

								<h2>Cookies</h2>
								<p>
									{`Le site n'utilise que les cookies nécessaires à la connexion à l'espace maquilleuse (session et protection des formulaires de connexion). Aucun cookie publicitaire ni de mesure d'audience n'est déposé : aucun bandeau de consentement n'est donc nécessaire.`}
								</p>

								<h2>Hébergement et prestataires</h2>
								{/* TODO(Andy): keep this list true on the day it ships.
								    - Database (D8): if Strapi's database runs on the old Contabo VPS, add it to the Contabo line until URG-10.
								    - Umami (MES-10): once Umami runs in Coolify at netcup, drop the Contabo line.
								    - Mailgun: once MAILGUN_REGION=eu is live, say the emails leave from its EU servers. */}
								<ul>
									<li>{`netcup GmbH (Allemagne) : hébergement du site.`}</li>
									<li>
										{`Contabo GmbH (Allemagne) : hébergement de notre outil de mesure d'audience (Umami).`}
									</li>
									<li>
										{`Cloudflare (service R2) : stockage des photos des profils.`}
									</li>
									<li>
										{`Mailgun Technologies, Inc. (États-Unis) : envoi des emails du site. Le passage à ses serveurs situés dans l'Union européenne est en cours ; d'ici là, le transfert est encadré comme indiqué ci-dessous.`}
									</li>
									<li>
										{`Lorsque le bouton « Demander un devis » est proposé : outil de formulaire de devis, hébergé dans l'Union européenne (sous-traitant).`}
									</li>
									<li>
										{`Google : uniquement si vous choisissez de vous connecter avec Google.`}
									</li>
								</ul>
								<p>
									{`Lorsque l'un de ces prestataires est établi hors de l'Union européenne, le transfert est encadré par le cadre de protection des données UE–États-Unis (Data Privacy Framework) ou par des clauses contractuelles types de la Commission européenne. Nous ne vendons ni ne louons aucune donnée personnelle.`}
								</p>

								<h2>Vos droits</h2>
								<p>
									{`Vous pouvez accéder à vos données, les rectifier, les faire effacer, en recevoir une copie, vous opposer à un traitement, en demander la limitation ou retirer votre consentement à tout moment. Écrivez-nous à `}
									<a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
									{` : nous répondons dans un délai d'un mois. Vous pouvez aussi adresser une réclamation à la CNIL (`}
									<a
										href={'https://www.cnil.fr'}
										rel={'noopener nofollow noreferrer'}
										target={'_blank'}
									>
										www.cnil.fr
									</a>
									{').'}
								</p>

								<h2>Modifications</h2>
								<p>
									{`Si cette politique change de façon importante, nous l'indiquerons sur le site et, pour les maquilleuses inscrites, par email.`}
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

export default PolitiqueDeConfidentialite
