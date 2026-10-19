import type { Payload } from 'payload'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { CHAMPS_DES_RESEAUX, lireLesReseaux, schemaDesReseauxStrict, type ValeursDesReseaux } from './reseaux'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the networks and the website of the signed-in makeup artist (ticket 125), and tells the
 * truth about it, like the identity (src/lib/espace/enregistrer-identite.ts):
 *
 * - the request is read by the strict schema (a key that is not one of the five fields refuses it
 *   whole), then each field is normalised by the rule the form uses (U28): « @pseudo » and the
 *   full address give the same stored value, an address of another site is refused (E30);
 * - the profile written is hers, found by her account: the request holds no identifier (I02);
 * - an empty field removes the network (`null`), the others are written together;
 * - the write goes through the access rules and the hooks of the collection, as herself, so the
 *   server recomputes whether the profile is publishable (a network is a channel of contact);
 * - the values given back are those the database stored. A failure gives back a message in French
 *   and no value (E31).
 */
export async function enregistrerReseaux(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDesReseaux>> {
	const forme = schemaDesReseauxStrict.safeParse(saisie)
	if (!forme.success) return { ok: false, message: MESSAGE_ECHEC }
	const lue = lireLesReseaux(forme.data)
	if (!lue.ok)
		return {
			ok: false,
			message: 'Un lien n’est pas valide : corrige-le, puis enregistre à nouveau.',
			champs: lue.champs,
		}
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const reseaux = Object.fromEntries(CHAMPS_DES_RESEAUX.map(champ => [champ, lue.valeurs[champ] || null]))
		const stocke = await payload.update({
			collection: 'profiles',
			data: { reseaux },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const valeurs = Object.fromEntries(
			CHAMPS_DES_RESEAUX.map(champ => [champ, stocke.reseaux?.[champ] ?? ''])
		) as ValeursDesReseaux
		return { ok: true, valeurs }
	} catch (erreur) {
		return echecDePayload(erreur, CHAMPS_DES_RESEAUX, 'reseaux.')
	}
}
