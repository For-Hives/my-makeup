/**
 * The makeup artists a page of text shows under its words (ticket 305): the page of a speciality shows six,
 * the foot of an article three. They come from the directory the search reads, so they obey the same
 * rules and the block points to the very search it summarises.
 *
 * - Only profiles that are listed (neither hidden, nor unavailable, nor empty: the directory) and
 *   publishable (`indexable`), and that show a way to be reached. A profile with no contact is not left
 *   last, it is left out: this block is a promise, not a list.
 * - The speciality is found as the search finds a word: the significant words of the title of the
 *   talent, in her speciality, her texts and her offers (src/lib/search/relevance.ts). A talent
 *   whose title reduces to nothing in the directory shows no block.
 * - Each card is the card of the search (`ProfileCard`): no contact detail, no coordinate.
 *
 * No `next` import: the module is read by the tests too. The caching is `cachedProfileBlock`.
 */

import { find } from '@/lib/search/results'
import type { DirectoryProfile, ProfileCard } from './profiles'

/** The cards under the page of a speciality, and under an article. */
export const TALENT_BLOCK_SIZE = 6
export const ARTICLE_BLOCK_SIZE = 3

/**
 * The cards of the block: the profiles that match `search` (every listed profile when it is empty), the
 * best match first, then the order of the directory (most complete first). At most `limit`.
 */
export function profileBlockCards(
	directory: readonly DirectoryProfile[],
	{ search, limit }: { search: string; limit: number }
): ProfileCard[] {
	return find(directory, { search, city: '' })
		.locaux.filter(profile => profile.indexable && !profile.unreachable)
		.slice(0, limit)
		.map(profile => profile.carte)
}

/** « Des maquilleuses pour votre maquillage de mariée »: the title of the block of a speciality. */
export function talentBlockTitle(talentTitle: string): string {
	const [first = ''] = talentTitle.trim()
	return `Des maquilleuses pour votre ${first.toLowerCase()}${talentTitle.trim().slice(first.length)}`
}

/**
 * The cards of « Mise en avant » (issue 1066): the profiles an admin ticked, in the order of the directory (most
 * complete first). Only those the block of a page of text also shows: publishable, and with a way to be reached; a
 * hidden, suspended or empty profile is not in the directory at all, so a ticked box never brings it back. At most
 * `limit` (FEATURED_MAX).
 */
export function featuredCards(directory: readonly DirectoryProfile[], limit: number): ProfileCard[] {
	return directory
		.filter(profile => profile.featured === true && profile.indexable && !profile.unreachable)
		.slice(0, limit)
		.map(profile => profile.carte)
}
