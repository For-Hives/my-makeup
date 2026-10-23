import type { Payload } from 'payload'
import {
	errorsByField,
	IDENTITY_FIELDS,
	type IdentityField,
	type IdentityValues,
	strictIdentitySchema,
} from './identity'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/** The field of the form that each field of the profile belongs to: Payload names the paths of a refusal. */
const PATH_FIELD: Readonly<Record<string, IdentityField>> = {
	firstName: 'prenom',
	lastName: 'nom',
	artistName: 'nomArtiste',
	specialty: 'specialite',
}

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
 * It never reads `error.message`: see `payloadFailure`.
 */
export async function saveIdentity(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<IdentityValues>> {
	const parsed = strictIdentitySchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = errorsByField(parsed.error)
		return Object.keys(fields).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: fields }
			: { ok: false, message: FAILURE_MESSAGE }
	}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const stored = await payload.update({
			collection: 'profiles',
			data: {
				firstName: parsed.data.prenom,
				lastName: parsed.data.nom,
				artistName: parsed.data.nomArtiste,
				specialty: parsed.data.specialite,
			},
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const values: IdentityValues = {
			prenom: stored.firstName ?? '',
			nom: stored.lastName ?? '',
			nomArtiste: stored.artistName ?? '',
			specialite: stored.specialty ?? '',
		}
		return { ok: true, valeurs: values }
	} catch (error) {
		return payloadFailure(error, IDENTITY_FIELDS, chemin => PATH_FIELD[chemin] ?? '')
	}
}
