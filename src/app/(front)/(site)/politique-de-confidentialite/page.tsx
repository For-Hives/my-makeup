import Link from 'next/link'
import { AnalyticsOptOut } from '@/components/analytics/AnalyticsOptOut'
import { LegalPage } from '@/components/legal/LegalPage'
import { formatSiret, PUBLISHER } from '@/lib/legal'
import { PHOTO_ERASURE_DAYS, PROVIDERS } from '@/lib/providers'
import { pageMetadata } from '@/lib/seo/metadata'
import { PURGE_DELAY_DAYS } from '@/lib/tasks/unconfirmed-accounts'

// Static: the text is in the code, and the page reads no cookie and no data (ticket 112).
export const metadata = pageMetadata({
	titre: 'Politique de confidentialité',
	description:
		'Quelles données My-Makeup traite, pourquoi, combien de temps, avec quels prestataires, et comment exercer vos droits.',
	repli:
		'Quelles données My-Makeup traite, pourquoi, combien de temps, avec quels prestataires, et comment exercer vos droits.',
	chemin: '/politique-de-confidentialite',
})

export default function PrivacyPolicyPage() {
	return (
		<LegalPage
			titre={
				<>
					Politique de confidentialité de&nbsp;
					<span className="text-indigo-900">My&nbsp;Makeup</span>
				</>
			}
			description="Vos données, en clair."
			titreDuTexte="Politique de confidentialité"
		>
			<p>{`Dernière mise à jour : octobre 2026.`}</p>
			<p>
				{`Cette page explique quelles données personnelles My-Makeup traite, pourquoi, combien de temps, avec quels prestataires, et comment exercer vos droits, conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.`}
			</p>

			<h2>Responsable du traitement</h2>
			<p>
				{`${PUBLISHER.nom}, ${PUBLISHER.forme} (SIRET ${formatSiret(PUBLISHER.siret)}), ${PUBLISHER.adresse}. Contact : `}
				<a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>
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
				{`Confirmation de l'adresse email : à l'inscription, nous envoyons à l'adresse indiquée un email contenant un lien. Tant que vous ne l'avez pas suivi, le compte ne permet pas de se connecter, et un compte jamais confirmé est supprimé, avec son profil vide, au bout de ${PURGE_DELAY_DAYS} jours.`}
			</p>
			<p>
				{`Durée : tant que votre compte existe. Vous pouvez supprimer votre compte et votre profil depuis votre espace : votre profil, vos informations et vos photos disparaissent du site aussitôt. Une photo retirée ou remplacée, comme celles d'un compte supprimé, est ensuite effacée définitivement de notre stockage au bout de ${PHOTO_ERASURE_DAYS} jours ; pendant ce délai, elle n'est plus affichée (le cache du service de stockage peut cependant la servir encore quelques heures).`}
			</p>
			<p>
				{`Si vous choisissez « Se connecter avec Google », Google nous transmet votre nom et votre adresse email pour créer ou ouvrir votre compte.`}
			</p>

			<h2>Formulaire de contact</h2>
			<p>
				{`Données : nom, prénom, email, téléphone et message. Le message est enregistré sur notre serveur, puis envoyé par email à l'équipe via le service Resend, pour vous répondre (intérêt légitime). Seuls les administrateurs de My Makeup peuvent le lire. Durée : 12 mois après sa réception, puis suppression automatique de notre serveur. La copie reçue par email est effacée de notre boîte dans le même délai.`}
			</p>

			<h2>Mesure d&apos;audience</h2>
			<p>
				{`Nous mesurons la fréquentation du site avec Umami, un outil que nous installons et administrons nous-mêmes, sur un serveur loué (voir « Hébergement et prestataires »). Il ne dépose aucun cookie, n'enregistre aucun identifiant sur votre appareil et ne conserve pas votre adresse IP. Il compte les pages vues, le site de provenance, le type d'appareil et de navigateur, le pays, la rapidité d'affichage des pages, et les clics sur certains boutons (contact d'une maquilleuse, recherche) sans jamais enregistrer ce que vous saisissez, ni votre identité, ni vos coordonnées.`}
			</p>
			<p>
				{`À l'inscription d'une maquilleuse, la réponse choisie à la question facultative « Comment as-tu connu My Makeup ? » est envoyée à Umami de la même façon, sans cookie, et sert seulement à compter d'où viennent les inscriptions. Elle n'est enregistrée ni dans le compte ni dans le profil de la maquilleuse.`}
			</p>
			{/* the mark of markGoogleSignIn (src/lib/analytics.js): sessionStorage,
								    the value « 1 », taken by the next page load */}
			<p>
				{`Lors d'une connexion avec Google, un simple repère « connexion en cours », sans identifiant ni donnée sur vous, est gardé dans l'onglet de votre navigateur le temps de l'aller-retour, pour compter si la connexion a abouti. Ce n'est pas un cookie : il est effacé à votre retour sur le site, et au plus tard à la fermeture de l'onglet.`}
			</p>
			<p>
				{`La mesure passe par notre propre site, qui transmet à Umami votre adresse IP, sans vos cookies, pour en déduire le pays et distinguer les visiteurs ; Umami ne la conserve pas.`}
			</p>
			{/* TODO(Andy): 25 months is the CNIL ceiling for audience
								    measurement. Self-hosted Umami keeps events until they are
								    deleted: schedule the purge (see the deploy notes) before
								    this page ships, or change the duration here. */}
			<p>
				{`Pourquoi : savoir ce qui aide vraiment les maquilleuses à être contactées (intérêt légitime). Cette mesure est limitée à des statistiques anonymes et ne nécessite donc pas votre consentement. Durée : les statistiques sont conservées 25 mois au plus, puis supprimées. Nous n'utilisons plus Google Analytics. Vous pouvez vous y opposer sur ce navigateur :`}
			</p>
			<div>
				<AnalyticsOptOut />
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
			{/* The list comes from src/lib/providers.ts, which a test compares to the configured
			    services: edit it there, never here. */}
			<ul>
				{PROVIDERS.map(({ id, nom, phrase }) => (
					<li key={id}>{`${nom} : ${phrase}`}</li>
				))}
			</ul>
			<p>
				{`Lorsque l'un de ces prestataires est établi hors de l'Union européenne, le transfert est encadré par le cadre de protection des données UE–États-Unis (Data Privacy Framework) ou par des clauses contractuelles types de la Commission européenne. Nous ne vendons ni ne louons aucune donnée personnelle.`}
			</p>

			<h2>Vos droits</h2>
			<p>
				{`Vous pouvez accéder à vos données, les rectifier, les faire effacer, en recevoir une copie, vous opposer à un traitement, en demander la limitation ou retirer votre consentement à tout moment. Écrivez-nous à `}
				<a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>
				{` : nous répondons dans un délai d'un mois. Vous pouvez aussi adresser une réclamation à la CNIL (`}
				<a href={'https://www.cnil.fr'} rel={'noopener nofollow noreferrer'} target={'_blank'}>
					www.cnil.fr
				</a>
				{').'}
			</p>

			<h2>Modifications</h2>
			<p>
				{`Si cette politique change de façon importante, nous l'indiquerons sur le site et, pour les maquilleuses inscrites, par email.`}
			</p>
		</LegalPage>
	)
}
