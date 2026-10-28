/**
 * The two badges an admin gives a profile (badges du 28/10/2026), said once: « Super maquilleuse » (`profiles.superArtist`) and
 * « Vérifiée » (`profiles.verified`, src/lib/profile/verified.ts). The cards, the head of a profile, the page
 * `/classement` and the admin read their words here, and a test compares the page with this file.
 *
 * They are not « Activité vérifiée » (the SIRET, src/lib/activity/badge-text.ts): another badge, another box, another
 * meaning, and the two never merge.
 *
 * What they do for the ranking is a small bonus of order, never a filter (`badgeTier`): the search reads only the
 * tier, a number, so that nothing of the ranking code names a badge.
 *
 * The texts are the French of the pages. No import: read by components, the collections (relative import) and tests.
 */

export const SUPER_LABEL = 'Super maquilleuse'
export const VERIFIED_LABEL = 'Vérifiée'

/** The anchor of the legend in the page that explains the ranking, and the link a badge of a profile points to. */
export const BADGES_ANCHOR = 'badges'
export const BADGES_HELP_PATH = `/classement#${BADGES_ANCHOR}`
export const BADGES_HELP_LINK = 'Que veulent dire ces badges ?'

/** The title of the section of `/classement`. */
export const BADGES_TITLE = 'Les badges « Super maquilleuse » et « Vérifiée »'

/** The paragraphs of the legend. Each one is checked against the page by tests/unit/profile-badges.test.tsx. */
export const BADGES_EXPLANATION = [
	'Le badge « Super maquilleuse » est posé par l’équipe de My Makeup sur certains profils. Il ne s’achète pas et une maquilleuse ne peut pas le demander en payant.',
	'Le badge « Vérifiée » veut dire que l’équipe de My Makeup a relu le profil. Il ne dit rien de la qualité du travail, des tarifs ni des prestations.',
	'Un profil peut avoir les deux badges. Les deux sont un léger coup de pouce dans l’ordre des résultats, jamais un filtre : une maquilleuse sans badge reste trouvable, et rien ne la cache.',
	'Ces badges sont différents du badge « Activité vérifiée », qui concerne le numéro SIRET et qui est expliqué plus bas.',
] as const

/** The tiers of the bonus of order: 2 for « Super maquilleuse » (with or without « Vérifiée »), 1 for « Vérifiée » alone, 0 for the others. */
export type BadgeTier = 0 | 1 | 2

/** The tier of a profile from its two boxes. A box that is not exactly `true` counts for nothing. */
export function badgeTier(boxes: { superArtist?: unknown; verified?: unknown }): BadgeTier {
	if (boxes.superArtist === true) return 2
	return boxes.verified === true ? 1 : 0
}

/** The sentence under the box « Super maquilleuse » in the admin. */
export const SUPER_ADMIN_DESCRIPTION =
	'Pose le badge « Super maquilleuse » sur ses cartes (recherche, accueil, pages de zone) et sur sa page. Elle passe aussi avant les autres, à pertinence égale, dans la recherche et dans les zones : un léger coup de pouce, jamais un filtre. Si elle est aussi « Vérifiée », elle est favorisée dans le tirage de la Mise en avant de l’accueil. Public : la case s’affiche sur le site, ne la coche que pour une maquilleuse que l’équipe a choisie.'

/** The sentence under the box « Vérifiée » in the admin. */
export const VERIFIED_ADMIN_DESCRIPTION =
	'Pose le badge « Vérifiée » sur ses cartes et sur sa page, et la fait passer avant les profils sans badge, à pertinence égale, dans la recherche et dans les zones (jamais un filtre). Elle reste la condition pour être tirée au hasard dans la Mise en avant de l’accueil. Public : la case s’affiche sur le site. Elle veut dire « profil relu par l’équipe », pas davantage : ne la coche qu’après avoir relu le profil.'
