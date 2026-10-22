/**
 * What the list of profiles of the admin panel shows of a person (ticket 308; audit UX no. 25): her name
 * first, then her zone as the public pages write it (`formatZone`, countries included). No server code
 * here: the cells are React components, and the rule is tested alone.
 *
 * Relative imports on purpose: the Payload CLI loads the collections that name these cells.
 */

import { formatZone } from '../format-zone'
import { fullName, text } from './display-name'

/** What the profile gives to read a name and a zone from: the fields of the v3. */
export interface AdminListProfile {
	readonly firstName?: string | null
	readonly lastName?: string | null
	readonly artistName?: string | null
	readonly city?: { readonly name?: string | null } | null
	readonly radiusKm?: number | null
	readonly zoneKind?: string | null
	readonly countries?: readonly string[] | null
	readonly town?: string | null
	readonly zoneReview?: { readonly reason?: string | null; readonly postalCode?: string | null } | null
}

/** Shown when the profile holds no name at all. */
export const NO_NAME_LABEL = 'Sans nom'

/** Shown when the profile holds no zone and no review of its zone. */
export const NO_ZONE_LABEL = 'Pas de zone'

/** « Prénom Nom », else the artist name, else « Sans nom » : never a blank cell, never « null ». */
export function adminProfileName(profile: AdminListProfile): string {
	return fullName(profile) || text(profile.artistName) || NO_NAME_LABEL
}

/** The zone as a page writes it; for a profile with none, « Zone à revoir » when the import left a review. */
export function adminProfileZone(profile: AdminListProfile): string {
	const zone = formatZone({
		city: profile.city?.name,
		radius: profile.radiusKm,
		zoneKind: profile.zoneKind,
		countries: profile.countries,
		town: profile.town,
	})
	if (zone !== '') return zone
	const review = profile.zoneReview
	if (typeof review?.reason !== 'string' || review.reason === '') return NO_ZONE_LABEL
	return typeof review.postalCode === 'string' && /^\d{5}$/.test(review.postalCode)
		? `Zone à revoir (code postal ${review.postalCode})`
		: 'Zone à revoir'
}
