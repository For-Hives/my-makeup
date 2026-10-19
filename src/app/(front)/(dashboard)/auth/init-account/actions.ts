'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import {
	enregistrerIdentiteDAccueil,
	enregistrerPhotoDAccueil,
	type ValeursDeLaPhotoDAccueil,
} from '@/lib/dashboard/enregistrer-accueil'
import type { ValeursDeLIdentite } from '@/lib/dashboard/identite'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/requete'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/dashboard/resultat'

/**
 * The saves of the onboarding that differ from those of the space (ticket 140). An action is a
 * public endpoint: the session is read again, the origin is checked against the origins Payload
 * trusts, and the profile written is the one of her account. The location is saved by
 * `enregistrerMaLocalisation`, as in her space.
 */
async function contexteDeConfiance() {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false as const, message: MESSAGE_SESSION, session: 'expiree' as const }
	const origine = (await headers()).get('origin')
	if (origine !== null && !contexte.payload.config.csrf.includes(origine))
		return { ok: false as const, message: MESSAGE_ECHEC }
	return contexte
}

/** Saves the first step: her identity, speciality required. */
export async function enregistrerMonIdentiteDAccueil(
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLIdentite>> {
	const contexte = await contexteDeConfiance()
	if ('ok' in contexte) return contexte
	const resultat = await enregistrerIdentiteDAccueil(contexte.payload, contexte.utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/** Saves the last step: her main photo, and says where she stands once it is saved. */
export async function enregistrerMaPhotoDAccueil(
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaPhotoDAccueil>> {
	const contexte = await contexteDeConfiance()
	if ('ok' in contexte) return contexte
	const resultat = await enregistrerPhotoDAccueil(contexte.payload, contexte.utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}
