import type { Payload } from 'payload'
import { enregistrerIdentite } from './save-identity'
import { enregistrerPhotoPrincipale } from './save-photo'
import { erreursParChamp, type ValeursDeLIdentite } from './identity'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from './my-profile'
import { type PositionDAccueil, positionDAccueil, schemaDeLIdentiteDAccueilStrict } from './onboarding'
import type { ValeursDeLaPhoto } from './main-picture'
import type { ResultatDEnregistrement } from './result'

/**
 * The saves of the onboarding (ticket 140). They are those of the space (tickets 119, 123, 134),
 * with the same guards and the same contract; only two differ:
 *
 * - the identity also requires the speciality, because a profile without one cannot be active;
 * - the main photo gives back where she stands once it is saved, read from the profile the
 *   database now holds (`positionDAccueil`), so that « Bienvenue » is said only when the server
 *   has seen the three steps done, and never from what the browser believes.
 */

/** Saves the identity, speciality required. The shared save does the rest, strict schema included. */
export async function enregistrerIdentiteDAccueil(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLIdentite>> {
	const lue = schemaDeLIdentiteDAccueilStrict.safeParse(saisie)
	if (!lue.success) {
		const champs = erreursParChamp(lue.error)
		// A refusal that names no field (a reserved key) is the shared save's to answer.
		if (Object.keys(champs).length > 0)
			return { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs }
	}
	return enregistrerIdentite(payload, utilisateur, saisie)
}

/** Said when the photo is saved but the profile could not be read back: the page must be read again. */
export const MESSAGE_PHOTO_NON_VERIFIEE =
	'Ta photo est peut-être enregistrée, mais nous n’avons pas pu le vérifier. Recharge la page pour voir où tu en es.'

export interface ValeursDeLaPhotoDAccueil extends ValeursDeLaPhoto {
	/** Where she stands after this save. */
	position: PositionDAccueil
}

/** Saves the main photo, and says where she stands as the database now holds her profile. */
export async function enregistrerPhotoDAccueil(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaPhotoDAccueil>> {
	const resultat = await enregistrerPhotoPrincipale(payload, utilisateur, saisie)
	if (!resultat.ok) return resultat
	try {
		const profil = await profilDeLaMaquilleuse(payload, utilisateur)
		if (profil === null) return { ok: false, message: MESSAGE_PHOTO_NON_VERIFIEE }
		return { ok: true, valeurs: { ...resultat.valeurs, position: positionDAccueil(profil) } }
	} catch {
		// The photo is saved but the reading failed: the browser must not claim a welcome it cannot see.
		return { ok: false, message: MESSAGE_PHOTO_NON_VERIFIEE }
	}
}
