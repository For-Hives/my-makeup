import type { Payload } from 'payload'
import { type DashboardUser, profileId } from './my-profile'
import type { SaveResult } from './result'

/** Whether the stored profile is « publiable » (the flag the server computes at every save), or nothing when unknown. */
async function publishableToday(payload: Payload, id: number): Promise<boolean | undefined> {
	try {
		const profile = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			id,
			overrideAccess: true,
			select: { publishable: true },
		})
		return profile.publishable === true
	} catch {
		return undefined
	}
}

/**
 * Runs a save of her space and says, in its answer, when that very save made her profile
 * « publiable » (ticket 147, event `profile_publiable`).
 *
 * The flag is set only on a successful save that takes the stored state from « not publiable » to
 * « publiable »: a save of a profile that already was, a save that fails, and a save that makes it
 * lose the state all give no flag, so the event is sent once and never for the way back. When the
 * state cannot be read, nothing is said.
 */
export async function withPublishableTransition<Valeurs extends Record<string, unknown>>(
	payload: Payload,
	utilisateur: DashboardUser,
	enregistrer: () => Promise<SaveResult<Valeurs>>
): Promise<SaveResult<Valeurs>> {
	const id = await profileId(payload, utilisateur).catch(() => null)
	const before = id === null ? undefined : await publishableToday(payload, id)
	const result = await enregistrer()
	if (!result.ok || id === null || before !== false) return result
	return (await publishableToday(payload, id)) === true ? { ...result, devenuPublicable: true } : result
}
