import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Accueil } from '@/components/dashboard/onboarding/Onboarding'
import { ACCOUNT_ONBOARDING_PAGE, signInUrl } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { libelleDeLaCommune } from '@/lib/dashboard/location'
import { profilDeLaMaquilleuse } from '@/lib/dashboard/my-profile'
import { positionDAccueil } from '@/lib/dashboard/onboarding'
import { garantirLeProfil } from '@/lib/dashboard/empty-profile'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/request'
import { texte } from '@/lib/profil/nom-affiche'
import { chercherMesCommunes, enregistrerMaLocalisation } from '../profil/location-actions'
import { enregistrerMaPhotoDAccueil, enregistrerMonIdentiteDAccueil } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Prépare ton profil' }

/**
 * The onboarding of a new account (ticket 140): identity, zone, main photo. The step shown is read
 * from her stored profile, so she resumes where she left. An account that came without a profile
 * (some accounts of the old site) gets an empty one here, made by the server. A profile that is
 * already active has nothing left to do here: she goes to her space.
 */
export default async function PageDAccueilDuCompte() {
	await requireArtist(ACCOUNT_ONBOARDING_PAGE)
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return redirect(signInUrl(ACCOUNT_ONBOARDING_PAGE))
	await garantirLeProfil(contexte.payload, contexte.utilisateur)
	const profil = await profilDeLaMaquilleuse(contexte.payload, contexte.utilisateur)
	if (profil === null) throw new Error('Le profil de la maquilleuse n’a pas pu être créé.')
	const position = positionDAccueil(profil)
	if (position === 'terminee') return redirect('/auth/profil')

	return (
		<main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
			<Accueil
				etapeInitiale={position}
				identite={{
					prenom: texte(profil.firstName),
					nom: texte(profil.lastName),
					nomArtiste: texte(profil.artistName),
					specialite: texte(profil.specialty),
				}}
				localisation={{
					codeInsee: texte(profil.city?.inseeCode),
					libelle: libelleDeLaCommune({ nom: profil.city?.name, departement: profil.city?.department }),
					rayonKm: typeof profil.radiusKm === 'number' ? profil.radiusKm : null,
					aDomicile: profil.homeService === true,
				}}
				envoyerIdentite={enregistrerMonIdentiteDAccueil}
				envoyerLocalisation={enregistrerMaLocalisation}
				chercherCommunes={chercherMesCommunes}
				envoyerPhoto={enregistrerMaPhotoDAccueil}
			/>
		</main>
	)
}
