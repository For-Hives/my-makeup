import type { Payload, RequiredDataFromCollectionSlug } from 'payload'
import { type DashboardUser, profileId } from './my-profile'

/**
 * The profile of this makeup artist, created by the server when she has none (ticket 140). An
 * account comes with its empty profile (`profileOnAccountCreation`), but some accounts of the old
 * site were imported without one: the space makes it on her first visit, so that she is never told to write to us.
 *
 * - Only her own account is read: `utilisateur` comes from the session, never from the request.
 * - It is idempotent. `profils.pro` is unique, so two renders at the same moment cannot make two
 *   profiles: the loser of the race finds the winner's profile and gives its identifier.
 * - The slug is made by the collection (`slugOnCreate`), from the name of her account.
 *
 * Gives back the identifier of her profile, or `null` when it could not be found nor created.
 */
export async function ensureProfile(payload: Payload, utilisateur: DashboardUser): Promise<number | null> {
	const existing = await profileId(payload, utilisateur)
	if (existing !== null) return existing
	try {
		const created = await payload.create({
			collection: 'profiles',
			data: { pro: Number(utilisateur.id) } as RequiredDataFromCollectionSlug<'profiles'>,
			depth: 0,
			overrideAccess: true,
			select: {},
		})
		return created.id
	} catch {
		// The other render won: its profile is the one.
		return profileId(payload, utilisateur)
	}
}
