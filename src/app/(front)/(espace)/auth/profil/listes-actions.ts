'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { enregistrerListe } from '@/lib/espace/enregistrer-liste'
import { EXPERIENCES } from '@/lib/espace/experiences'
import { FORMATIONS } from '@/lib/espace/formations'
import type { DefinitionDeListe, ListeEnregistree } from '@/lib/espace/liste'
import { avecPassagePublicable } from '@/lib/espace/passage-publiable'
import { PRESTATIONS } from '@/lib/espace/prestations'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/espace/resultat'

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
