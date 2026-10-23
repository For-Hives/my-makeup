import type { Payload } from 'payload'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { NETWORKS_FIELDS, type NetworkField, type NetworksValues, readNetworks, strictNetworksSchema } from './networks'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/** The field of the group `networks` each field of the form is stored in. */
const STORED_FIELD = {
	instagram: 'instagram',
	facebook: 'facebook',
	youtube: 'youtube',
	linkedin: 'linkedin',
	siteWeb: 'website',
} as const satisfies Record<NetworkField, string>

/** The field of the form that each field of the group `networks` belongs to. */
const PATH_FIELD: Readonly<Record<string, NetworkField>> = {
	instagram: 'instagram',
	facebook: 'facebook',
	youtube: 'youtube',
	linkedin: 'linkedin',
	website: 'siteWeb',
}

/**
 * Saves the networks and the website of the signed-in makeup artist (ticket 125), and tells the
 * truth about it, like the identity (src/lib/dashboard/save-identity.ts):
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
export async function saveNetworks(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<NetworksValues>> {
	const shape = strictNetworksSchema.safeParse(saisie)
	if (!shape.success) return { ok: false, message: FAILURE_MESSAGE }
	const parsed = readNetworks(shape.data)
	if (!parsed.ok)
		return {
			ok: false,
			message: 'Un lien n’est pas valide : corrige-le, puis enregistre à nouveau.',
			champs: parsed.champs,
		}
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const networks = Object.fromEntries(
			NETWORKS_FIELDS.map(champ => [STORED_FIELD[champ], parsed.valeurs[champ] || null])
		)
		const stored = await payload.update({
			collection: 'profiles',
			data: { networks },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const values = Object.fromEntries(
			NETWORKS_FIELDS.map(champ => [champ, stored.networks?.[STORED_FIELD[champ]] ?? ''])
		) as NetworksValues
		return { ok: true, valeurs: values }
	} catch (error) {
		return payloadFailure(error, NETWORKS_FIELDS, chemin =>
			chemin.startsWith('networks.') ? (PATH_FIELD[chemin.slice('networks.'.length)] ?? '') : ''
		)
	}
}
