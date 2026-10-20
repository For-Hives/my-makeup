'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { enregistrerListe } from '@/lib/dashboard/save-list'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import { FORMATIONS } from '@/lib/dashboard/courses'
import type { DefinitionDeListe, ListeEnregistree } from '@/lib/dashboard/list'
import { avecPassagePublicable } from '@/lib/dashboard/publishable-transition'
import { PRESTATIONS } from '@/lib/dashboard/service-offers'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/request'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/dashboard/result'

/**
 * Saves a list of the signed-in makeup artist: same guards as her identity (the session read again,
 * the origin checked against the origins Payload trusts, the profile found by her account), and the
 * values the database stored given back. It never redirects: the panel keeps what she typed.
 */
async function enregistrerMaListe(
	definition: DefinitionDeListe,
	saisie: unknown
): Promise<ResultatDEnregistrement<ListeEnregistree>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await avecPassagePublicable(payload, utilisateur, () =>
		enregistrerListe(payload, utilisateur, saisie, definition)
	)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/** Her experiences (ticket 129). */
export async function enregistrerMesExperiences(saisie: unknown): Promise<ResultatDEnregistrement<ListeEnregistree>> {
	return enregistrerMaListe(EXPERIENCES, saisie)
}

/** Her courses (ticket 130). */
export async function enregistrerMesFormations(saisie: unknown): Promise<ResultatDEnregistrement<ListeEnregistree>> {
	return enregistrerMaListe(FORMATIONS, saisie)
}

/** Her offers (ticket 131). */
export async function enregistrerMesPrestations(saisie: unknown): Promise<ResultatDEnregistrement<ListeEnregistree>> {
	return enregistrerMaListe(PRESTATIONS, saisie)
}
