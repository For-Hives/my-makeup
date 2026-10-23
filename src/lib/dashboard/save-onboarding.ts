import type { Payload } from 'payload'
import { errorsByField, type IdentityValues } from './identity'
import type { DashboardUser } from './my-profile'
import { strictOnboardingIdentitySchema } from './onboarding'
import type { SaveResult } from './result'
import { saveIdentity } from './save-identity'

/**
 * The save of the onboarding that differs from the space's (ticket 140; issue 1009): the identity also
 * requires the speciality, because a profile without one cannot be active. The other steps are saved by
 * the saves of the space, with the same guards and the same contract. Where she stands is read from the
 * stored profile by the page, never given by a save.
 */

/** Saves the identity, speciality required. The shared save does the rest, strict schema included. */
export async function saveOnboardingIdentity(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<IdentityValues>> {
	const parsed = strictOnboardingIdentitySchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = errorsByField(parsed.error)
		// A refusal that names no field (a reserved key) is the shared save's to answer.
		if (Object.keys(fields).length > 0)
			return {
				ok: false,
				message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.',
				champs: fields,
			}
	}
	return saveIdentity(payload, utilisateur, saisie)
}
