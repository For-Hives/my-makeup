import type { Payload } from 'payload'
import { errorsByField, type IdentityValues } from './identity'
import type { PhotoValues } from './main-picture'
import { artistProfile, type DashboardUser } from './my-profile'
import { type OnboardingPosition, onboardingPosition, strictOnboardingIdentitySchema } from './onboarding'
import type { SaveResult } from './result'
import { saveIdentity } from './save-identity'
import { saveMainPicture } from './save-photo'

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

/** Said when the photo is saved but the profile could not be read back: the page must be read again. */
export const UNVERIFIED_PHOTO_MESSAGE =
	'Ta photo est peut-être enregistrée, mais nous n’avons pas pu le vérifier. Recharge la page pour voir où tu en es.'

export interface OnboardingPhotoValues extends PhotoValues {
	/** Where she stands after this save. */
	position: OnboardingPosition
}

/** Saves the main photo, and says where she stands as the database now holds her profile. */
export async function saveOnboardingPhoto(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<OnboardingPhotoValues>> {
	const result = await saveMainPicture(payload, utilisateur, saisie)
	if (!result.ok) return result
	try {
		const profile = await artistProfile(payload, utilisateur)
		if (profile === null) return { ok: false, message: UNVERIFIED_PHOTO_MESSAGE }
		return { ok: true, valeurs: { ...result.valeurs, position: onboardingPosition(profile) } }
	} catch {
		// The photo is saved but the reading failed: the browser must not claim a welcome it cannot see.
		return { ok: false, message: UNVERIFIED_PHOTO_MESSAGE }
	}
}
