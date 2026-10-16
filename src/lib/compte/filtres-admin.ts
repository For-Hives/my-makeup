import type { Where } from 'payload'

/** The three filters of the list of accounts of the admin panel (ticket 168). */
export type CleDeFiltre = 'non-confirmes' | 'sans-profil' | 'bloques'

export const LIBELLES_DES_FILTRES: Record<CleDeFiltre, string> = {
	'non-confirmes': 'non confirmés',
	'sans-profil': 'sans profil',
	bloques: 'bloqués',
}

/**
 * The `where` of each filter, on the accounts. « Without profile » is the accounts whose id is not the
 * owner of any profile: the panel cannot filter on the virtual field `profil` (its filter builder only
 * knows stored fields), so the clause names the owners of the profiles instead. With no owner at all,
 * every account is without a profile.
 */
export function whereDuFiltre(cle: CleDeFiltre, proprietaires: readonly (number | string)[]): Where {
	if (cle === 'non-confirmes') return { _verified: { equals: false } }
	if (cle === 'bloques') return { bloque: { equals: true } }
	return proprietaires.length > 0 ? { id: { not_in: [...proprietaires] } } : { id: { exists: true } }
}

/** The address of the list of accounts with a filter of the panel in it, as the panel writes its own. */
export function lienDuFiltre(cle: CleDeFiltre, proprietaires: readonly (number | string)[]): string {
	const base = '/admin/collections/pros'
	if (cle === 'non-confirmes') return `${base}?where[_verified][equals]=false`
	if (cle === 'bloques') return `${base}?where[bloque][equals]=true`
	if (proprietaires.length === 0) return `${base}?where[id][exists]=true`
	// One value with commas, as the REST API reads `in` and `not_in`: the panel parses its address with `qs`, which
	// turns an array of more than 20 entries (`[21]=…`) into an object, and the filter then drops them all.
	return `${base}?where[id][not_in]=${proprietaires.map(id => encodeURIComponent(String(id))).join(',')}`
}
