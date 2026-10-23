import type { Payload } from 'payload'
import { DESCRIPTION_FIELDS, type DescriptionValues, descriptionErrors, strictDescriptionSchema } from './description'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/**
 * Saves the description of the signed-in makeup artist (ticket 122), the way her identity is saved
 * (ticket 119):
 *
 * - the request is read by the strict schema: HTML is removed, 2 001 characters are refused (U27),
 *   a key that is not `description` refuses the whole request (U32);
 * - the profile written is hers, found by her account, through the access rules and the hooks of
 *   the collection (`overrideAccess: false`): nothing but the description changes;
 * - the value given back is the one the database stored, never the one that was sent. A failure
 *   gives back a message in French, and the old text stays.
 *
 * It never reads `error.message`: see `payloadFailure`.
 */
export async function saveDescription(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<DescriptionValues>> {
	const parsed = strictDescriptionSchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = descriptionErrors(parsed.error)
		return Object.keys(fields).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: fields }
			: { ok: false, message: FAILURE_MESSAGE }
	}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const stored = await payload.update({
			collection: 'profiles',
			data: parsed.data,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { description: stored.description ?? '' } }
	} catch (error) {
		return payloadFailure(error, DESCRIPTION_FIELDS)
	}
}
