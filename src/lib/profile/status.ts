/**
 * Where a profile stands for the public (plan 01 §6.1; docs/migration/SCHEMA.md, §9).
 *
 * - `draft`: not shown. A new profile starts here, empty; the rule of ticket 044
 *   (src/lib/profile/state.ts) moves it to `published` as soon as it is no longer entirely empty, and
 *   back when it is again, while an admin has chosen nothing else (`chosenStatus`).
 * - `published`: shown. The only status the public reads (U53).
 * - `hidden`: hidden by an admin. No save brings it back: only an admin does.
 *
 * No API writes the status itself: the server computes it at every save. An admin chooses it
 * (`chosenStatus`); what a makeup artist sends on either field is ignored.
 */
export const PROFILE_STATUSES = ['draft', 'published', 'hidden'] as const
export type ProfileStatus = (typeof PROFILE_STATUSES)[number]

/** The status of a new profile: nothing is public until a rule or an admin says so. */
export const INITIAL_STATUS: ProfileStatus = 'draft'

/** The one status the public reads. */
export const PUBLISHED_STATUS: ProfileStatus = 'published'

/** What the admin panel shows for each status. */
export const STATUS_LABELS: Record<ProfileStatus, string> = {
	draft: 'Brouillon',
	published: 'Publié',
	hidden: 'Masqué',
}

/**
 * What an admin chooses for the status of a profile (ticket 044): the rule (`automatic`), or one
 * of the three statuses, which the profile then keeps whatever is saved.
 */
export const STATUS_CHOICES = ['automatic', ...PROFILE_STATUSES] as const
export type StatusChoice = (typeof STATUS_CHOICES)[number]

/** The choice of a new profile: the rule. */
export const INITIAL_CHOICE: StatusChoice = 'automatic'

/** What the admin panel shows for each choice. */
export const CHOICE_LABELS: Record<StatusChoice, string> = {
	automatic: 'Automatique : brouillon si le profil est vide, publié sinon',
	draft: 'Toujours brouillon',
	published: 'Toujours publié',
	hidden: 'Masqué',
}
