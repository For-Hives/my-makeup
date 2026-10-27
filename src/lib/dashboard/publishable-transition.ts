import type { Payload } from 'payload'
import { type DashboardUser, profileId } from './my-profile'
import type { SaveResult } from './result'

/** The two flags the server computes at every save, as stored: « publiable » and « indexable » (a richer profile). */
interface Standing {
	publishable: boolean
	indexable: boolean
}

/** The stored flags of the profile, or nothing when they cannot be read. */
async function standingToday(payload: Payload, id: number): Promise<Standing | undefined> {
	try {
		const profile = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			id,
			overrideAccess: true,
			select: { publishable: true, indexable: true },
		})
		return { publishable: profile.publishable === true, indexable: profile.indexable === true }
	} catch {
		return undefined
	}
}

/**
 * Runs a save of her space and says, in its answer, when that very save made her profile
 * « publiable » (ticket 147, event `profile_publiable`) or « indexable » (27/10/2026, event `profile_indexable`).
 *
 * Each flag is set only on a successful save that takes the stored state from « not » to « yes »: a save of a profile
 * that already was, a save that fails, and a save that makes it lose the state all give no flag, so the event is sent
 * once and never for the way back. A profile can become both with one save. When the state cannot be read, nothing is said.
 */
export async function withPublishableTransition<Valeurs extends Record<string, unknown>>(
	payload: Payload,
	utilisateur: DashboardUser,
	enregistrer: () => Promise<SaveResult<Valeurs>>
): Promise<SaveResult<Valeurs>> {
	const id = await profileId(payload, utilisateur).catch(() => null)
	const before = id === null ? undefined : await standingToday(payload, id)
	const result = await enregistrer()
	if (!result.ok || id === null || before === undefined) return result
	const publishable = before.publishable === false
	const indexable = before.indexable === false
	if (!publishable && !indexable) return result
	const after = await standingToday(payload, id)
	if (after === undefined) return result
	const becamePublishable = publishable && after.publishable
	const becameIndexable = indexable && after.indexable
	return {
		...result,
		...(becamePublishable && { devenuPublicable: true as const }),
		...(becameIndexable && { devenuIndexable: true as const }),
	}
}
