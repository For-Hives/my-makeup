import type { Payload } from 'payload'
import { type AvailabilityValues, availabilitySchema, isAvailable } from './availability'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/**
 * Saves the availability of the signed-in makeup artist (ticket 124), on the contract of ticket
 * 119: the request is read by the strict schema (one boolean, no other key), the profile written is
 * hers (found by her account), the write goes through the access rules as herself, and the value
 * given back is the one the database stored. A failure gives a message in French and no value.
 */
export async function saveAvailability(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<AvailabilityValues>> {
	const parsed = availabilitySchema.safeParse(saisie)
	if (!parsed.success) return { ok: false, message: FAILURE_MESSAGE }
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const stored = await payload.update({
			collection: 'profiles',
			data: { available: parsed.data.disponible },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { disponible: isAvailable(stored.available) } }
	} catch (error) {
		return payloadFailure(error, ['disponible'] as const, chemin => (chemin === 'available' ? 'disponible' : ''))
	}
}
