'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { enregistrerLocalisation } from '@/lib/dashboard/save-location'
import {
	MESSAGE_SERVICE_DES_COMMUNES,
	type ResultatDeRecherche,
	type ValeursDeLaLocalisation,
} from '@/lib/dashboard/location'
import { avecPassagePublicable } from '@/lib/dashboard/publishable-transition'
import { chercherDesCommunes, proposition } from '@/lib/dashboard/city-reference'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/request'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/dashboard/result'

/** Searches of communes a minute for one account: far above what typing needs, below a script's pace. */
const RECHERCHES_PAR_MINUTE = 120
const freinDesRecherches = createRateLimit({ nom: 'communes-espace', limite: RECHERCHES_PAR_MINUTE, fenetreMs: 60_000 })

/** Whether the origin of the request is one Payload trusts (an action is a public endpoint). */
async function origineDeConfiance(trusted: readonly string[]): Promise<boolean> {
	const origine = (await headers()).get('origin')
	return origine === null || trusted.includes(origine)
}

/**
 * The communes that match the text she types (ticket 123). The session is read again here and the
 * origin checked: the list of communes is asked for signed-in makeup artists only, never for the
 * browser of a visitor. An account is braked, not an address. The text is cut by the search itself
 * (length, characters, an address is never sent on).
 */
export async function chercherMesCommunes(texte: unknown): Promise<ResultatDeRecherche> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION }
	if (!(await origineDeConfiance(contexte.payload.config.csrf)) || typeof texte !== 'string')
		return { ok: false, message: MESSAGE_ECHEC }
	if (!freinDesRecherches.prendre(`${contexte.utilisateur.id}`).autorise) return { ok: false, message: MESSAGE_ECHEC }

	const reponse = await chercherDesCommunes(texte)
	if (reponse.genre === 'panne') return { ok: false, message: MESSAGE_SERVICE_DES_COMMUNES }
	if (reponse.genre === 'rien') return { ok: true, communes: [], motif: reponse.motif }
	return { ok: true, communes: reponse.communes.map(proposition) }
}

/**
 * Saves the location of the signed-in makeup artist (ticket 123), as `enregistrerMonIdentite` saves
 * her identity: session read again, origin checked, the profile of her account, the values the
 * database stored given back, or a message in French. It never redirects.
 */
export async function enregistrerMaLocalisation(
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaLocalisation>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	if (!(await origineDeConfiance(payload.config.csrf))) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await avecPassagePublicable(payload, utilisateur, () =>
		enregistrerLocalisation(payload, utilisateur, saisie)
	)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}
