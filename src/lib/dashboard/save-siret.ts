import type { Payload } from 'payload'
import { normalizeSiret } from '../profile/siret'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'
import { type SiretValues, siretErrors, strictSiretSchema } from './siret'

/**
 * Saves the SIRET of the signed-in makeup artist (issue 1004), on the same terms as her other fields: the request
 * is read by the strict schema (one key, nothing else), the profile written is hers, found by her account, and the
 * write goes through the access rules and the hooks of the collection, as herself. The hooks start the check of the
 * new number over (src/collections/Profiles.ts); nothing here asks the registry.
 *
 * Empty clears it. The values given back are those the database stored. A failure gives back a message in French
 * and no value; the SIRET is in no log line and no message of a failure.
 */
export async function saveSiret(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<SiretValues>> {
	const parsed = strictSiretSchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = siretErrors(parsed.error)
		return Object.keys(fields).length > 0 && !parsed.error.issues.some(({ code }) => code === 'unrecognized_keys')
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: fields }
			: { ok: false, message: FAILURE_MESSAGE }
	}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const siret = normalizeSiret(parsed.data.siret)
		const stored = await payload.update({
			collection: 'profiles',
			data: { siret: siret === '' ? null : siret },
			depth: 0,
			id,
			overrideAccess: false,
			select: { siret: true, pro: true },
			user: utilisateur,
		})
		return { ok: true, valeurs: { siret: stored.siret ?? '' } }
	} catch (error) {
		return payloadFailure(error, ['siret'] as const, chemin => (chemin === 'siret' ? 'siret' : ''))
	}
}
