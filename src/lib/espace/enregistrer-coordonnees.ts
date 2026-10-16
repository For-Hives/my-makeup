import type { Payload } from 'payload'
import { type CoordonneesEnregistrees, erreursDesCoordonnees, schemaDesCoordonneesStrict } from './coordonnees'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the contact details of the signed-in makeup artist and her choice to show them (ticket
 * 126), and tells the truth about it, like the identity:
 *
 * - the request is read by the strict schema: a key that is not one of the three fields
 *   (`consentiLe`, `sourceConsentement`, `statut`, `pro`…) refuses it whole, so she can never
 *   write the date of her own consent;
 * - the profile written is hers, found by her account (I02);
 * - the write goes through the access rules and the hooks of the collection, as herself: the
 *   server dates the choice when she shows them, and empties the date when she hides them
 *   (`consentementTrace`, src/collections/Profils.ts); it recomputes whether the profile is
 *   publishable, since a phone or an email counts as a channel of contact only while shown;
 * - the values given back, the date included, are those the database stored. A failure gives back
 *   a message in French and no value.
 */
export async function enregistrerCoordonnees(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<CoordonneesEnregistrees>> {
	const lue = schemaDesCoordonneesStrict.safeParse(saisie)
	if (!lue.success) {
		const champs = erreursDesCoordonnees(lue.error)
		return Object.keys(champs).length > 0 && !lue.error.issues.some(({ code }) => code === 'unrecognized_keys')
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs }
			: { ok: false, message: MESSAGE_ECHEC }
	}
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const { telephone, email, contactPublic } = lue.data
		const stocke = await payload.update({
			collection: 'profils',
			data: { coordonnees: { telephone: telephone || null, email: email || null }, contactPublic },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return {
			ok: true,
			valeurs: {
				telephone: stocke.coordonnees?.telephone ?? '',
				email: stocke.coordonnees?.email ?? '',
				contactPublic: stocke.contactPublic === true,
				consentiLe: stocke.consentiLe ?? null,
			},
		}
	} catch (erreur) {
		// Payload names the two fields of the group `coordonnees.telephone` and `coordonnees.email`.
		return echecDePayload(erreur, ['telephone', 'email'] as const, 'coordonnees.')
	}
}
