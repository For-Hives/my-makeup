import type { Payload } from 'payload'
import { CHAMPS_DE_L_IDENTITE, erreursParChamp, schemaDeLIdentiteStrict, type ValeursDeLIdentite } from './identite'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the identity of the signed-in makeup artist (ticket 119), and tells the truth about it:
 *
 * - the request is read by the strict schema, so a reserved field (`statut`, `verifie`, `score`,
 *   `pro`, `slug`…) refuses it whole (U32), and the bounds are checked again here (U25, U26);
 * - the profile written is hers, found by her account: the request holds no identifier (I02);
 * - the write goes through the access rules and the hooks of the collection, as herself
 *   (`overrideAccess: false`): the slug is never touched (I19), nor anything but the four fields;
 * - the values given back are those the database stored, read from the document Payload returns,
 *   never the ones that were sent. A failure gives back a message in French and no value.
 *
 * It never reads `error.message`: see `echecDePayload`.
 */
export async function enregistrerIdentite(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLIdentite>> {
	const lue = schemaDeLIdentiteStrict.safeParse(saisie)
	if (!lue.success) {
		const champs = erreursParChamp(lue.error)
		return Object.keys(champs).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs }
			: { ok: false, message: MESSAGE_ECHEC }
	}
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const stocke = await payload.update({
			collection: 'profils',
			data: lue.data,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const valeurs = Object.fromEntries(
			CHAMPS_DE_L_IDENTITE.map(champ => [champ, stocke[champ] ?? ''])
		) as ValeursDeLIdentite
		return { ok: true, valeurs }
	} catch (erreur) {
		return echecDePayload(erreur, CHAMPS_DE_L_IDENTITE)
	}
}
