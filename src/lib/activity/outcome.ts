/**
 * What the activity check knows of the SIRET of a profile (issue 1004). One word per answer the business
 * registry can give, and `pending` while no answer was ever read. Shared by the collection, the task and the
 * public read; no `next` import.
 */
export const ACTIVITY_OUTCOMES = ['pending', 'active', 'ceased', 'not-found'] as const
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number]

export const ACTIVITY_OUTCOME_LABELS: Readonly<Record<ActivityOutcome, string>> = {
	pending: 'À contrôler',
	active: 'Activité en cours',
	ceased: 'Activité cessée',
	'not-found': 'Introuvable dans l’annuaire',
}

/** The only outcome that gives the badge. */
export const BADGE_OUTCOME: ActivityOutcome = 'active'
