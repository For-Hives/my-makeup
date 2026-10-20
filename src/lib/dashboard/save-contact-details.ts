import type { Payload } from 'payload'
import { contactDetailsErrors, type SavedContactDetails, strictContactDetailsSchema } from './contact-details'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/**
 * Saves the contact details of the signed-in makeup artist and her choice to show them (ticket
 * 126), and tells the truth about it, like the identity:
 *
 * - the request is read by the strict schema: a key that is not one of the three fields
 *   (`consentedAt`, `consentSource`, `status`, `pro`…) refuses it whole, so she can never
 *   write the date of her own consent;
 * - the profile written is hers, found by her account (I02);
 * - the write goes through the access rules and the hooks of the collection, as herself: the
 *   server dates the choice when she shows them, and empties the date when she hides them
 *   (`consentTrace`, src/collections/Profiles.ts); it recomputes whether the profile is
 *   publishable, since a phone or an email counts as a channel of contact only while shown;
 * - the values given back, the date included, are those the database stored. A failure gives back
 *   a message in French and no value.
 */
export async function saveContactDetails(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<SavedContactDetails>> {
	const parsed = strictContactDetailsSchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = contactDetailsErrors(parsed.error)
		return Object.keys(fields).length > 0 && !parsed.error.issues.some(({ code }) => code === 'unrecognized_keys')
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: fields }
			: { ok: false, message: FAILURE_MESSAGE }
	}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const { telephone: phone, email, contactPublic } = parsed.data
		const stored = await payload.update({
			collection: 'profiles',
			data: { contactDetails: { phone: phone || null, email: email || null }, publicContact: contactPublic },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return {
			ok: true,
			valeurs: {
				telephone: stored.contactDetails?.phone ?? '',
				email: stored.contactDetails?.email ?? '',
				contactPublic: stored.publicContact === true,
				consentiLe: stored.consentedAt ?? null,
			},
		}
	} catch (error) {
		// Payload names the two fields of the group `contactDetails.phone` and `contactDetails.email`.
		return payloadFailure(error, ['telephone', 'email'] as const, chemin =>
			chemin === 'contactDetails.phone' ? 'telephone' : chemin === 'contactDetails.email' ? 'email' : ''
		)
	}
}
