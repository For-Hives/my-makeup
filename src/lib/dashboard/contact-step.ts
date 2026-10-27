/**
 * How a client can reach her. Instagram first, then a
 * phone or an email she chooses to show. The two saves are those of her space (the networks, the
 * contact details); this file only decides what to send, so that the step never erases what an import or
 * an earlier visit stored.
 *
 * - Instagram is read by the rule of the networks (`normalizeNetwork`): « @pseudo » or an address.
 * - The server replaces the five networks as a whole: the list sent is the stored one with Instagram
 *   changed, so Facebook, YouTube, LinkedIn and her site stay.
 * - Nothing is sent for a part she did not change. A part she left empty and that was empty is not sent.
 * - A phone or an email counts as a way to reach her only when she shows them (`publicContact`): the
 *   step says it under the case, in the words of the contact block.
 */

import {
	CONTACT_DETAILS_FIELDS,
	type ContactDetailsField,
	type ContactDetailsValues,
	contactDetailsErrors,
	contactDetailsSchema,
} from './contact-details'
import { type NetworksValues, normalizeNetwork } from './networks'

export interface ContactStepValues {
	instagram: string
	telephone: string
	email: string
	contactPublic: boolean
}

export type ContactStepField = 'instagram' | ContactDetailsField

export const CONTACT_STEP_MESSAGES = {
	empty: 'Ajoute ton Instagram, ou un téléphone ou un email. Tu peux aussi choisir « Plus tard ».',
} as const

export type ContactStepReading =
	| {
			ok: true
			/** The five networks to save, or null when Instagram did not change. */
			networks: NetworksValues | null
			/** The contact details to save, or null when she did not change them. */
			contact: ContactDetailsValues | null
	  }
	| { ok: false; champs: Partial<Record<ContactStepField, string>> }
	| { ok: 'empty'; message: string }

/** Reads what she typed against what is stored. */
export function readContactStep(
	typed: ContactStepValues,
	stored: { networks: NetworksValues; contact: ContactDetailsValues }
): ContactStepReading {
	const fields: Partial<Record<ContactStepField, string>> = {}
	const instagram = normalizeNetwork('instagram', typed.instagram)
	if (!instagram.ok) fields.instagram = instagram.message
	const contact = contactDetailsSchema.safeParse({
		telephone: typed.telephone,
		email: typed.email,
		contactPublic: typed.contactPublic,
	})
	if (!contact.success) Object.assign(fields, contactDetailsErrors(contact.error))
	if (!instagram.ok || !contact.success) return { ok: false, champs: fields }

	const typedNothing = instagram.valeur === '' && contact.data.telephone === '' && contact.data.email === ''
	const storedNothing =
		stored.networks.instagram === '' && stored.contact.telephone === '' && stored.contact.email === ''
	if (typedNothing && storedNothing) return { ok: 'empty', message: CONTACT_STEP_MESSAGES.empty }

	const networksChanged = instagram.valeur !== stored.networks.instagram
	const contactChanged = CONTACT_DETAILS_FIELDS.some(field => contact.data[field] !== stored.contact[field])
	return {
		ok: true,
		networks: networksChanged ? { ...stored.networks, instagram: instagram.valeur } : null,
		contact: contactChanged ? contact.data : null,
	}
}
