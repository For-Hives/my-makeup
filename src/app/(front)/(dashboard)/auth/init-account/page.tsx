import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Onboarding } from '@/components/dashboard/onboarding/Onboarding'
import { ACCOUNT_ONBOARDING_PAGE, signInUrl } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { ensureProfile } from '@/lib/dashboard/empty-profile'
import { cityLabel } from '@/lib/dashboard/location'
import { artistProfile } from '@/lib/dashboard/my-profile'
import { onboardingPosition } from '@/lib/dashboard/onboarding'
import { requestUser } from '@/lib/dashboard/request'
import { texte } from '@/lib/profile/display-name'
import { findMyCities, saveMyLocation } from '../profil/location-actions'
import { saveMyOnboardingIdentity, saveMyOnboardingPhoto } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Prépare ton profil' }

/**
 * The onboarding of a new account (ticket 140): identity, zone, main photo. The step shown is read
 * from her stored profile, so she resumes where she left. An account that came without a profile
 * (some accounts of the old site) gets an empty one here, made by the server. A profile that is
 * already active has nothing left to do here: she goes to her space.
 */
export default async function AccountOnboardingPage() {
	await requireArtist(ACCOUNT_ONBOARDING_PAGE)
	const context = await requestUser()
	if (context === null) return redirect(signInUrl(ACCOUNT_ONBOARDING_PAGE))
	await ensureProfile(context.payload, context.utilisateur)
	const profile = await artistProfile(context.payload, context.utilisateur)
	if (profile === null) throw new Error('Le profil de la maquilleuse n’a pas pu être créé.')
	const position = onboardingPosition(profile)
	if (position === 'terminee') return redirect('/auth/profil')

	return (
		<main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
			<Onboarding
				etapeInitiale={position}
				identite={{
					prenom: texte(profile.firstName),
					nom: texte(profile.lastName),
					nomArtiste: texte(profile.artistName),
					specialite: texte(profile.specialty),
				}}
				localisation={{
					codeInsee: texte(profile.city?.inseeCode),
					libelle: cityLabel({ nom: profile.city?.name, departement: profile.city?.department }),
					rayonKm: typeof profile.radiusKm === 'number' ? profile.radiusKm : null,
					aDomicile: profile.homeService === true,
				}}
				envoyerIdentite={saveMyOnboardingIdentity}
				envoyerLocalisation={saveMyLocation}
				chercherCommunes={findMyCities}
				envoyerPhoto={saveMyOnboardingPhoto}
			/>
		</main>
	)
}
