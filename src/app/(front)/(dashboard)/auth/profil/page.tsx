import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignOutButtons } from '@/components/auth/SignOutButtons'
import { AvancementDuProfil } from '@/components/dashboard/ProfileProgress'
import { CarteDeSection } from '@/components/dashboard/SectionCard'
import { EditeurDeCoordonnees } from '@/components/dashboard/ContactDetailsEditor'
import { EditeurDeDescription } from '@/components/dashboard/DescriptionEditor'
import { EditeurDeLaPhoto } from '@/components/dashboard/PhotoEditor'
import { EditeurDeLocalisation } from '@/components/dashboard/LocationEditor'
import { EditeurDePuces } from '@/components/dashboard/BulletsEditor'
import { EditeurDeReseaux } from '@/components/dashboard/NetworksEditor'
import { EditeurDIdentite } from '@/components/dashboard/IdentityEditor'
import { EditeurDuPortfolio } from '@/components/dashboard/PortfolioEditor'
import { EditeurDExperiences, EditeurDeFormations, EditeurDePrestations } from '@/components/dashboard/ListsEditors'
import { InterrupteurDeDisponibilite } from '@/components/dashboard/AvailabilitySwitch'
import { LienDeVue } from '@/components/dashboard/ViewLink'
import { RafraichirSession } from '@/components/dashboard/RefreshSession'
import { SuppressionDuCompte } from '@/components/dashboard/AccountDeletion'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { CHEMIN_DE_L_APERCU } from '@/lib/dashboard/preview'
import { avancementDuProfil } from '@/lib/dashboard/progress'
import { cartesDuProfil } from '@/lib/dashboard/cards'
import { modeDeConfirmation } from '@/lib/dashboard/deletion-confirmation'
import { estDisponible } from '@/lib/dashboard/availability'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import { FORMATIONS } from '@/lib/dashboard/courses'
import { lignesDuProfil } from '@/lib/dashboard/list'
import { libelleDeLaCommune } from '@/lib/dashboard/location'
import { profilDeLaMaquilleuse } from '@/lib/dashboard/my-profile'
import { lirePhotosDeLEspace } from '@/lib/dashboard/photos'
import { PRESTATIONS } from '@/lib/dashboard/service-offers'
import { pucesDeLaListe } from '@/lib/dashboard/bullets'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/request'
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
import { enregistrerMesExperiences, enregistrerMesFormations, enregistrerMesPrestations } from './lists-actions'
import { chercherMesCommunes, enregistrerMaLocalisation } from './location-actions'
import { supprimerMonCompteAction } from './deletion-actions'

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
	const maquilleuse = await requireArtist('/auth/profil')
	const contexte = await utilisatriceDeLaRequete()
	const profil = contexte === null ? null : await profilDeLaMaquilleuse(contexte.payload, contexte.utilisateur)
	// An account that came without a profile (some accounts of the old site) gets one in the onboarding (ticket 140).
	if (contexte === null || profil === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	const photos = await lirePhotosDeLEspace(contexte.payload, profil)

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<RafraichirSession expire={maquilleuse.expire} />
			<p>Bonjour {texte(maquilleuse.nom) || 'toi'}, tu es connectée.</p>
			{profil === null ? null : (
				<>
					<LienDeVue
						vue="publique"
						href={CHEMIN_DE_L_APERCU}
						data-testid="voir-mon-profil-public"
						className="flex min-h-[44px] w-fit items-center rounded-lg px-2 font-semibold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
					>
						Voir mon profil public
					</LienDeVue>
					<AvancementDuProfil avancement={avancementDuProfil(profil)} />
					{cartesDuProfil(profil).map(carte => (
						<CarteDeSection
							key={carte.section}
							carte={carte}
							action={
								carte.section === 'identite' ? (
									<EditeurDIdentite
										valeurs={{
											prenom: texte(profil.firstName),
											nom: texte(profil.lastName),
											nomArtiste: texte(profil.artistName),
											specialite: texte(profil.specialty),
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
											codeInsee: texte(profil.city?.inseeCode),
											libelle: libelleDeLaCommune({ nom: profil.city?.name, departement: profil.city?.department }),
											rayonKm: typeof profil.radiusKm === 'number' ? profil.radiusKm : null,
											aDomicile: profil.homeService === true,
										}}
										envoyer={enregistrerMaLocalisation}
										chercher={chercherMesCommunes}
									/>
								) : carte.section === 'disponibilite' ? (
									<InterrupteurDeDisponibilite
										disponible={estDisponible(profil.available)}
										envoyer={enregistrerMaDisponibilite}
									/>
								) : carte.section === 'langues' ? (
									<EditeurDePuces
										liste="languages"
										puces={pucesDeLaListe(profil.languages)}
										envoyer={enregistrerMesLangues}
									/>
								) : carte.section === 'competences' ? (
									<EditeurDePuces
										liste="skills"
										puces={pucesDeLaListe(profil.skills)}
										envoyer={enregistrerMesCompetences}
									/>
								) : carte.section === 'photo' ? (
									<EditeurDeLaPhoto photo={photos.photo} envoyer={enregistrerMaPhotoPrincipale} />
								) : carte.section === 'portfolio' ? (
									<EditeurDuPortfolio photos={photos.galerie} envoyer={enregistrerMonPortfolio} />
								) : carte.section === 'reseaux' ? (
									<EditeurDeReseaux
										valeurs={{
											instagram: texte(profil.networks?.instagram),
											facebook: texte(profil.networks?.facebook),
											youtube: texte(profil.networks?.youtube),
											linkedin: texte(profil.networks?.linkedin),
											siteWeb: texte(profil.networks?.website),
										}}
										envoyer={enregistrerMesReseaux}
									/>
								) : carte.section === 'coordonnees' ? (
									<EditeurDeCoordonnees
										valeurs={{
											telephone: texte(profil.contactDetails?.phone),
											email: texte(profil.contactDetails?.email),
											contactPublic: profil.publicContact === true,
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
				<SignOutButtons />
			</div>
			<SuppressionDuCompte
				mode={contexte === null ? 'mot-de-passe' : modeDeConfirmation(contexte.utilisateur)}
				envoyer={supprimerMonCompteAction}
			/>
		</main>
	)
}
