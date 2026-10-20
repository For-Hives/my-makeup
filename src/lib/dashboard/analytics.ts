/**
 * What the space of the makeup artist tells the measure (ticket 147; plan 04 §3.3, events 13 to 15,
 * 18 and 19). Browser side, through the one door `track` (src/lib/analytics/track.ts).
 *
 * - `profile_save { section, ok }`: once per answer of the server to a save, with the outcome the
 *   server gave. The editors lock while a save is under way (a double click or a held Enter sends
 *   one request), so one gesture is one answer is one event.
 * - `profile_publiable`: only when the server says that this very save made the profile publiable
 *   (`devenuPublicable`, src/lib/espace/passage-publiable.ts): once, never for the way back.
 * - `upload_error { kind }`: the real cause of a refused photo.
 * - `account_delete`: only once the server has deleted the account.
 * - `profile_visibility { public }`: when she switches between her space and her public view.
 *
 * Nothing typed ever travels: the properties are words of closed lists (events.ts).
 */

import type { EvenementsMyMakeup } from '../analytics/events'
import { type Suivre, track } from '../analytics/track'
import type { PhotoRefusal } from './photo'
import type { RefusalCause } from './photos-upload'
import type { SaveResult } from './result'

/**
 * Where the events go. Always `track` in the pages; a test swaps `porte.suivre` for a spy (and puts
 * it back), which is how the components of the space are tested without giving each a property.
 */
export const holder: { suivre: Suivre } = { suivre: track }

export type TrackedSection = EvenementsMyMakeup['profile_save']['section']

/** The answer of the server to a save, as the event sees it. */
type SaveResponse = Pick<SaveResult<Record<string, unknown>>, 'ok'> & {
	devenuPublicable?: true
}

/** The section of the event for a list of her space: her service offers are the « offres » of the plan, her courses the « formations ». */
export const trackedListSection = (
	section: 'experiences' | 'courses' | 'serviceOffers' | 'options'
): TrackedSection => {
	if (section === 'serviceOffers' || section === 'options') return 'offres'
	return section === 'courses' ? 'formations' : section
}

/** Counts one save: its section and outcome, then the passage to « publiable » when the server reports it. */
export function trackSave(section: TrackedSection, reponse: SaveResponse, suivre: Suivre = holder.suivre): void {
	suivre('profile_save', { section, ok: reponse.ok })
	if (reponse.ok && reponse.devenuPublicable === true) suivre('profile_publiable')
}

/** Counts a refused photo. A session that ended is not a refusal of the photo: nothing is counted. */
export function trackPhotoRefusal(cause: RefusalCause, suivre: Suivre = holder.suivre): void {
	suivre('upload_error', { kind: cause })
}

/** The cause of a photo the browser refused before sending it. */
export const localRefusalCause = (refus: Pick<PhotoRefusal, 'raison'>): RefusalCause =>
	refus.raison === 'taille' ? 'size' : 'type'

/** Counts the deletion of the account, which the server has done. */
export function trackAccountDeletion(suivre: Suivre = holder.suivre): void {
	suivre('account_delete')
}

/** Counts a switch of view: `true` towards her public page, `false` back to her space. */
export function trackViewChange(publique: boolean, suivre: Suivre = holder.suivre): void {
	suivre('profile_visibility', { public: publique })
}
