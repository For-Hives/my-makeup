/**
 * The candidates of « Mise en avant » on the home page (issue 1066). Apart from `profile-block.ts` on purpose: the
 * block of a page of text ranks by what a search ranks by (a test refuses any notion of verification or of payment
 * there), while this choice is the team's: the profiles it verified.
 *
 * No `next` import: the module is read by the tests too. The caching is `cachedFeaturedProfiles`.
 */

import { sampleCandidates } from '@/lib/profile/featured'
import type { DirectoryProfile, ProfileCard } from './profiles'

/**
 * The candidates of « Mise en avant » (issue 1066): the verified profiles (the box « Vérifiée » an admin
 * ticks), the « Super maquilleuse » ones first, then in the order of the directory (most complete first). Only those the block of a page of text also shows:
 * publishable, and with a way to be reached; a hidden, suspended or empty profile is not in the directory at all, so
 * a ticked box never brings it back. The page carries `limit` of them at most (FEATURED_CANDIDATES_MAX; beyond it a
 * random sample, `random` being what the tests replace) and the browser draws FEATURED_MAX among them.
 */
export function featuredCandidates(
	directory: readonly DirectoryProfile[],
	limit: number,
	random: () => number = Math.random
): ProfileCard[] {
	const pool = directory.filter(profile => profile.verified === true && profile.publishable && !profile.unreachable)
	// Badges du 28/10/2026: the « Super maquilleuse » ones are kept first when the pool is cut, and the draw of the browser gives
	// each of them a double weight (src/lib/profile/featured.ts). The rest is the random sample of before.
	const supers = pool.filter(profile => profile.carte.superMaquilleuse)
	const others = pool.filter(profile => !profile.carte.superMaquilleuse)
	const kept = supers.length >= limit ? sampleCandidates(supers, limit, random) : supers
	return [...kept, ...sampleCandidates(others, limit - kept.length, random)].map(profile => profile.carte)
}
