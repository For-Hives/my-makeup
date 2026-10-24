import type { Payload } from 'payload'
import { COLLECTION_PROS } from '../access'
import type { DashboardProfile } from './dashboard-profile'
import { checkAdminDoesNotHoldProfile } from './lock'

/** The makeup artist as Payload knows her: what the access rules of a request need. */
export type DashboardUser = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

/**
 * What the page reads of her profile: the cards' fields, and the status and the reason an admin wrote
 * when hiding it (ticket 292). Both are readable by her and the admin only (field access).
 */
const READ_FIELDS = {
	firstName: true,
	lastName: true,
	artistName: true,
	specialty: true,
	specialtyBullets: true,
	specialtyOther: true,
	description: true,
	city: true,
	radiusKm: true,
	homeService: true,
	zoneKind: true,
	countries: true,
	town: true,
	zoneReview: true,
	available: true,
	status: true,
	reason: true,
	moderationAction: true,
	mainPicture: true,
	gallery: true,
	skills: true,
	courses: true,
	experiences: true,
	languages: true,
	serviceOffers: true,
	networks: true,
	contactDetails: true,
	publicContact: true,
	consentedAt: true,
	// Optional, for her eyes only (issue 1004): her page shows it to her, and nobody else's.
	siret: true,
	slug: true,
} as const

/**
 * The identifier of her profile, found by her account. The field `pro` is closed to a query made
 * as herself (field access applies to the paths of a `where`), so this one lookup is made by the
 * server, and gives back an identifier and nothing else. `utilisateur` comes from the session
 * (`payload.auth`), never from the request.
 */
export async function profileId(payload: Payload, utilisateur: DashboardUser): Promise<number | null> {
	if (utilisateur.collection !== COLLECTION_PROS) return null
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		select: {},
		where: { pro: { equals: utilisateur.id } },
	})
	return docs[0]?.id ?? null
}

/**
 * The identifier of her profile for a write of her space: `profileId`, then a refusal
 * (`LockedProfile`) while an admin has the profile open in the administration (ticket 224). Null
 * when she has no profile, as `profileId`.
 */
export async function profileIdToWrite(payload: Payload, utilisateur: DashboardUser): Promise<number | null> {
	const id = await profileId(payload, utilisateur)
	if (id !== null) await checkAdminDoesNotHoldProfile(payload, id)
	return id
}

/**
 * The profile of this makeup artist, and hers only: found by her account (`profileId`),
 * never by an identifier that comes from the request, then read with the access rules on
 * (`overrideAccess: false`) as herself. Nobody else's profile can come out of it (U54).
 */
export async function artistProfile(payload: Payload, utilisateur: DashboardUser): Promise<DashboardProfile | null> {
	const id = await profileId(payload, utilisateur)
	if (id === null) return null
	// The rule of a field closed to the public (`contactDetails`, `publicContact`, `consentedAt`) reads the
	// account in `pro` of the document it is given: a selection without it would strip those fields
	// from her own page. `pro` is read for the rule and dropped before the page gets the profile.
	const profile = await payload.findByID({
		collection: 'profiles',
		depth: 0,
		disableErrors: true,
		id,
		overrideAccess: false,
		select: { ...READ_FIELDS, pro: true },
		user: utilisateur,
	})
	if (profile === null) return null
	const { pro: _account, ...visible } = profile
	return visible
}
