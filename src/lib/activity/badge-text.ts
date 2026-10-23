/**
 * The words of the badge « Activité vérifiée » (issue 1004), said once. The profile, the cards and the page
 * `/classement` (which explains the badge, src/components/ranking/RankingExplainer.tsx) all read them here, and a
 * test compares the page with this file. The badge says exactly what is checked: that an establishment exists and
 * is active in the public business registry. Never the quality of the work.
 *
 * The texts are the French of the pages. No import: read by components and tests.
 */

export const BADGE_LABEL = 'Activité vérifiée'

/** The sentence of the link beside the badge on a profile. */
export const BADGE_HELP_LINK = 'Qu’est-ce que c’est ?'

/** The anchor of the explanation, in the page that explains the ranking. */
export const BADGE_ANCHOR = 'activite-verifiee'
export const BADGE_HELP_PATH = `/classement#${BADGE_ANCHOR}`

/** The title of the section of `/classement`. */
export const BADGE_TITLE = 'Le badge « Activité vérifiée »'

/** The words under the badge on a profile: what was checked, and when. */
export const badgeChecked = (date: string | null): string =>
	date === null
		? 'Établissement en activité d’après l’annuaire public des entreprises.'
		: `Établissement en activité d’après l’annuaire public des entreprises, contrôlé le ${date}.`

/** The paragraphs of the explanation. Each one is checked against the page by tests/unit/activity-badge.test.tsx. */
export const BADGE_EXPLANATION = [
	'Le badge « Activité vérifiée » veut dire une seule chose : la maquilleuse nous a donné le numéro SIRET de son entreprise, et l’annuaire public des entreprises (le service de l’État qui recense les établissements) y trouve un établissement en activité.',
	'Il ne dit rien de la qualité de son travail, de ses tarifs ni de son talent : My Makeup ne contrôle ni les diplômes ni les prestations, et ne note personne.',
	'Le contrôle est automatique et se refait chaque jour : si l’entreprise cesse son activité, ou si le numéro change, le badge disparaît. Le numéro SIRET n’est jamais affiché sur le site.',
	'Donner son SIRET est facultatif. Une maquilleuse qui n’en donne pas n’est ni moins bien classée ni moins bien placée dans la recherche : le badge ne change aucun ordre.',
] as const

/** The sentence « no bonus » of the list of what does not count (src/lib/search/ranking.ts). */
export const BADGE_NO_BONUS =
	'Le badge « Activité vérifiée » n’accorde aucun avantage : une maquilleuse qui n’a pas donné son SIRET n’est ni pénalisée ni placée après les autres.'
