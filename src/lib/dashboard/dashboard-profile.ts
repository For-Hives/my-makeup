import type { Profile } from '@/payload-types'

/** What her pages read of her own profile: the fields of the owner, as `payload.find` gives them. */
export type DashboardProfile = Pick<
	Profile,
	| 'id'
	| 'firstName'
	| 'lastName'
	| 'artistName'
	| 'specialty'
	| 'description'
	| 'city'
	| 'radiusKm'
	| 'homeService'
	| 'zoneKind'
	| 'countries'
	| 'town'
	| 'zoneReview'
	| 'available'
	| 'status'
	| 'reason'
	| 'moderationAction'
	| 'mainPicture'
	| 'gallery'
	| 'skills'
	| 'courses'
	| 'experiences'
	| 'languages'
	| 'serviceOffers'
	| 'networks'
	| 'contactDetails'
	| 'publicContact'
	| 'consentedAt'
	| 'siret'
> &
	// The address of her public page (ticket 306): read by her space.
	Partial<Pick<Profile, 'slug'>>
