import type { Metadata } from 'next'
import { BoutonsDeDeconnexion } from '@/components/auth/BoutonsDeDeconnexion'
import { CarteDeSection } from '@/components/espace/CarteDeSection'
import { EditeurDeDescription } from '@/components/espace/EditeurDeDescription'
import { EditeurDIdentite } from '@/components/espace/EditeurDIdentite'
import { RafraichirSession } from '@/components/espace/RafraichirSession'
import { exigerMaquilleuse } from '@/lib/auth/session'
import { cartesDuProfil } from '@/lib/espace/cartes'
import { profilDeLaMaquilleuse } from '@/lib/espace/mon-profil'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import { texte } from '@/lib/profil/nom-affiche'
import { enregistrerMaDescription, enregistrerMonIdentite } from './actions'

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
				cartesDuProfil(profil).map(carte => (
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
							) : null
						}
					/>
				))
			)}
			<div className="mt-4 flex justify-center">
				<BoutonsDeDeconnexion />
			</div>
		</main>
	)
}
