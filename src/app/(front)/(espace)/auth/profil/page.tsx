import type { Metadata } from 'next'
import Link from 'next/link'
import { BoutonsDeDeconnexion } from '@/components/auth/BoutonsDeDeconnexion'
import { AvancementDuProfil } from '@/components/espace/AvancementDuProfil'
import { CarteDeSection } from '@/components/espace/CarteDeSection'
import { EditeurDeCoordonnees } from '@/components/espace/EditeurDeCoordonnees'
import { EditeurDeDescription } from '@/components/espace/EditeurDeDescription'
import { EditeurDeLaPhoto } from '@/components/espace/EditeurDeLaPhoto'
import { EditeurDeLocalisation } from '@/components/espace/EditeurDeLocalisation'
import { EditeurDePuces } from '@/components/espace/EditeurDePuces'
import { EditeurDeReseaux } from '@/components/espace/EditeurDeReseaux'
import { EditeurDIdentite } from '@/components/espace/EditeurDIdentite'
import { EditeurDuPortfolio } from '@/components/espace/EditeurDuPortfolio'
import { EditeurDExperiences, EditeurDeFormations, EditeurDePrestations } from '@/components/espace/EditeursDeListes'
import { InterrupteurDeDisponibilite } from '@/components/espace/InterrupteurDeDisponibilite'
import { RafraichirSession } from '@/components/espace/RafraichirSession'
import { SuppressionDuCompte } from '@/components/espace/SuppressionDuCompte'
import { exigerMaquilleuse } from '@/lib/auth/session'
import { CHEMIN_DE_L_APERCU } from '@/lib/espace/apercu'
import { avancementDuProfil } from '@/lib/espace/avancement'
import { cartesDuProfil } from '@/lib/espace/cartes'
import { modeDeConfirmation } from '@/lib/espace/confirmation-suppression'
import { estDisponible } from '@/lib/espace/disponibilite'
import { EXPERIENCES } from '@/lib/espace/experiences'
import { FORMATIONS } from '@/lib/espace/formations'
import { lignesDuProfil } from '@/lib/espace/liste'
import { libelleDeLaCommune } from '@/lib/espace/localisation'
import { profilDeLaMaquilleuse } from '@/lib/espace/mon-profil'
import { lirePhotosDeLEspace } from '@/lib/espace/photos'
import { PRESTATIONS } from '@/lib/espace/prestations'
import { pucesDeLaListe } from '@/lib/espace/puces'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import { texte } from '@/lib/profil/nom-affiche'
import {
	enregistrerMaDescription,
	enregistrerMaDisponibilite,
	enregistrerMaPhotoPrincipale,
	enregistrerMesCompetences,
	enregistrerMesCoordonnees,
	enregistrerMesLangues,
	enregistrerMesReseaux,
	enregistrerMonIdentite,
	enregistrerMonPortfolio,
} from './actions'
import { enregistrerMesExperiences, enregistrerMesFormations, enregistrerMesPrestations } from './listes-actions'
import { chercherMesCommunes, enregistrerMaLocalisation } from './localisation-actions'
import { supprimerMonCompteAction } from './suppression-actions'

// Read per request: it depends on the session, and the build has no database. A page that reads
// the session is never shared nor stored (`private, no-store`, ticket 075).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon espace' }

/**
 * The space of the makeup artist (tickets 118 and 119): one card per section of her profile, with
 * the value stored or « à compléter ». Each section plugs its button « Modifier » into its card as
 * it arrives. The page hands the browser plain text and the identity she edits, nothing of the
 * account nor of the session.
 */
export default async function PageProfil() {
	const maquilleuse = await exigerMaquilleuse('/auth/profil')
	const contexte = await utilisatriceDeLaRequete()
	const profil = contexte === null ? null : await profilDeLaMaquilleuse(contexte.payload, contexte.utilisateur)
	const photos = contexte === null || profil === null ? null : await lirePhotosDeLEspace(contexte.payload, profil)

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<RafraichirSession expire={maquilleuse.expire} />
			<p>Bonjour {texte(maquilleuse.nom) || 'toi'}, tu es connectée.</p>
			{profil === null ? (
				<p className="rounded-md bg-amber-50 p-4 text-amber-900">
					Ton profil n’est pas encore créé. Écris-nous à{' '}
					<a className="underline" href="mailto:contact@my-makeup.fr">
						contact@my-makeup.fr
					</a>{' '}
					et on s’en occupe.
				</p>
			) : (
				<>
					<Link
						href={CHEMIN_DE_L_APERCU}
						data-testid="voir-mon-profil-public"
						className="flex min-h-[44px] w-fit items-center rounded-lg px-2 font-semibold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
					>
						Voir mon profil public
					</Link>
					<AvancementDuProfil avancement={avancementDuProfil(profil)} />
					{cartesDuProfil(profil).map(carte => (
						<CarteDeSection
							key={carte.section}
							carte={carte}
							action={
								carte.section === 'identite' ? (
									<EditeurDIdentite
										valeurs={{
											prenom: texte(profil.prenom),
											nom: texte(profil.nom),
											nomArtiste: texte(profil.nomArtiste),
											specialite: texte(profil.specialite),
										}}
										envoyer={enregistrerMonIdentite}
										proprietaire={String(maquilleuse.id)}
									/>
								) : carte.section === 'description' ? (
									<EditeurDeDescription
										valeurs={{ description: texte(profil.description) }}
										envoyer={enregistrerMaDescription}
									/>
								) : carte.section === 'localisation' ? (
									<EditeurDeLocalisation
										valeurs={{
											codeInsee: texte(profil.commune?.codeInsee),
											libelle: libelleDeLaCommune(profil.commune ?? {}),
											rayonKm: typeof profil.rayonKm === 'number' ? profil.rayonKm : null,
											aDomicile: profil.aDomicile === true,
										}}
										envoyer={enregistrerMaLocalisation}
										chercher={chercherMesCommunes}
									/>
								) : carte.section === 'disponibilite' ? (
									<InterrupteurDeDisponibilite
										disponible={estDisponible(profil.disponible)}
										envoyer={enregistrerMaDisponibilite}
									/>
								) : carte.section === 'langues' ? (
									<EditeurDePuces
										liste="langues"
										puces={pucesDeLaListe(profil.langues)}
										envoyer={enregistrerMesLangues}
									/>
								) : carte.section === 'competences' ? (
									<EditeurDePuces
										liste="competences"
										puces={pucesDeLaListe(profil.competences)}
										envoyer={enregistrerMesCompetences}
									/>
								) : carte.section === 'photo' ? (
									<EditeurDeLaPhoto photo={photos?.photo ?? null} envoyer={enregistrerMaPhotoPrincipale} />
								) : carte.section === 'portfolio' ? (
									<EditeurDuPortfolio photos={photos?.galerie ?? []} envoyer={enregistrerMonPortfolio} />
								) : carte.section === 'reseaux' ? (
									<EditeurDeReseaux
										valeurs={{
											instagram: texte(profil.reseaux?.instagram),
											facebook: texte(profil.reseaux?.facebook),
											youtube: texte(profil.reseaux?.youtube),
											linkedin: texte(profil.reseaux?.linkedin),
											siteWeb: texte(profil.reseaux?.siteWeb),
										}}
										envoyer={enregistrerMesReseaux}
									/>
								) : carte.section === 'coordonnees' ? (
									<EditeurDeCoordonnees
										valeurs={{
											telephone: texte(profil.coordonnees?.telephone),
											email: texte(profil.coordonnees?.email),
											contactPublic: profil.contactPublic === true,
										}}
										envoyer={enregistrerMesCoordonnees}
									/>
								) : carte.section === 'experiences' ? (
									<EditeurDExperiences
										lignes={lignesDuProfil(EXPERIENCES, profil)}
										envoyer={enregistrerMesExperiences}
									/>
								) : carte.section === 'formations' ? (
									<EditeurDeFormations lignes={lignesDuProfil(FORMATIONS, profil)} envoyer={enregistrerMesFormations} />
								) : carte.section === 'prestations' ? (
									<EditeurDePrestations
										lignes={lignesDuProfil(PRESTATIONS, profil)}
										envoyer={enregistrerMesPrestations}
									/>
								) : null
							}
						/>
					))}
				</>
			)}
			<div className="mt-4 flex justify-center">
				<BoutonsDeDeconnexion />
			</div>
			<SuppressionDuCompte
				mode={contexte === null ? 'mot-de-passe' : modeDeConfirmation(contexte.utilisateur)}
				envoyer={supprimerMonCompteAction}
			/>
		</main>
	)
}
