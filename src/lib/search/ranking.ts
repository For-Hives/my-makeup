/**
 * How the results are ranked, said once (issue 1012). The page `/classement` is written from this file and
 * from nothing else, and `tests/unit/ranking-transparency.test.ts` plays every rule below against the code
 * that ranks (src/lib/search/results.ts, place.ts, relevance.ts, and the sort of the directory read in
 * src/services/public/profiles.ts): a rule the code does not follow, or a rule of the code that is not
 * here, fails a test. Nothing paid enters the ranking, and the page says so.
 *
 * The texts are the French of the page. The numbers in them are the constants of the code.
 *
 * No `next` import: read by the page and by the tests.
 */

import { BADGE_NO_BONUS } from '@/lib/activity/badge-text'
import { FAR_REACH_KM } from '@/services/public/profiles'
import { PER_PAGE } from './pagination'
import { NEARBY_MAX_KM } from './place'
import { THRESHOLD } from './relevance'
import { FAR_TRAVELLERS_MAX } from './results'

/** One typo is tolerated for this many letters of a word. */
const LETTERS_PER_TYPO = Math.round(1 / THRESHOLD)

/**
 * How the directory is read before any search touches it: the most complete profile first, then the one changed
 * most recently, then by address. It is the last word of the order of a search without a recognised city. The
 * read in src/services/public/profiles.ts writes the same list as a literal (the check of the keys of the
 * queries cannot follow a constant), and the test compares the two.
 */
export const DIRECTORY_SORT = ['-completeness', '-updatedAt', 'slug'] as const

/** The address of the page that explains the ranking. */
export const RANKING_PATH = '/classement'

/** The sentence of the link under each list. */
export const RANKING_LINK_TEXT = 'Comment sont classées les maquilleuses ?'

export const RANKING_GROUPS = [
	{ id: 'listed', title: 'Qui apparaît dans les résultats' },
	{ id: 'sections', title: 'Les rubriques, quand vous indiquez une ville' },
	{ id: 'order', title: 'L’ordre à l’intérieur d’une rubrique' },
	{ id: 'other', title: 'Les autres listes du site' },
] as const

export type RankingGroup = (typeof RANKING_GROUPS)[number]['id']

export interface RankingRule {
	readonly id: string
	readonly group: RankingGroup
	readonly text: string
}

/**
 * The rules, in the order they apply: inside a group the first rule wins over the next. The ids are the keys
 * of the checks of the test, which has one for each.
 */
export const RANKING_RULES = [
	{
		id: 'listed',
		group: 'listed',
		text: 'Une maquilleuse est listée quand son profil n’est pas masqué par l’équipe, qu’elle ne s’est pas mise en pause et que son profil n’est pas entièrement vide.',
	},
	{
		id: 'words',
		group: 'listed',
		text: `Quand vous tapez des mots, seules les maquilleuses dont le profil contient tous les mots importants apparaissent. Les accents et les majuscules ne comptent pas, et une faute de frappe pour ${LETTERS_PER_TYPO} lettres est tolérée (« Anecy » trouve « Annecy »). Les petits mots (« pour », « une »…) et les mots de la demande elle-même (« je cherche une maquilleuse ») sont ignorés.`,
	},
	{
		id: 'city-keeps',
		group: 'listed',
		text: 'Une maquilleuse dont la ville n’est pas reconnue n’est pas écartée : elle reste trouvable par son nom, sa spécialité ou sa description, et passe après celles dont la zone est connue (mention « Zone non renseignée »).',
	},
	{
		id: 'sections-point',
		group: 'sections',
		text: `Quand votre ville est reconnue, les maquilleuses sont rangées en rubriques : celles de votre commune (« À … »), puis celles qui se déplacent jusqu’à vous (leur rayon vous atteint), puis celles qui sont plus loin, à moins de ${NEARBY_MAX_KM} km, puis les autres (zone non renseignée). Une maquilleuse dont la zone est connue mais à plus de ${NEARBY_MAX_KM} km, et dont le rayon ne vous atteint pas, n’est pas listée pour cette ville.`,
	},
	{
		id: 'sections-text',
		group: 'sections',
		text: 'Quand vous tapez un département, un code postal que la liste ne situe pas ou un nom que la liste des communes ne connaît pas, les rubriques sont : celles de ce lieu (la ville, puis le département), les autres du département, celles qui se déplacent, puis toutes les autres.',
	},
	{
		id: 'nobody-near',
		group: 'sections',
		text: 'Quand vous ne tapez qu’une ville et que personne n’y est inscrit, la page le dit : elle ne montre pas toutes les maquilleuses du site à la place.',
	},
	{
		id: 'zone-first',
		group: 'order',
		text: 'Une maquilleuse dont la zone est indiquée passe avant une maquilleuse dont la zone n’est pas indiquée.',
	},
	{
		id: 'reachable-first',
		group: 'order',
		text: 'À zone égale, une maquilleuse que l’on peut joindre (un réseau, un site, ou un téléphone ou un email qu’elle a choisi d’afficher) passe avant une maquilleuse sans aucun moyen de contact, signalée par « Coordonnées pas encore indiquées ».',
	},
	{
		id: 'distance',
		group: 'order',
		text: 'Quand votre ville est reconnue, la maquilleuse la plus proche passe d’abord (distance entre les deux communes, à 100 m près). Celles de votre département dont la commune n’a pas de coordonnées suivent celles dont la commune est connue.',
	},
	{
		id: 'word-quality',
		group: 'order',
		text: 'Quand vous avez tapé des mots, celle dont le profil les contient le mieux passe d’abord : une ville ou une spécialité qui correspond pèse plus qu’un mot trouvé au milieu d’une description. Avec une ville reconnue, cela ne départage que les maquilleuses à la même distance.',
	},
	{
		id: 'name',
		group: 'order',
		text: 'Avec une ville reconnue, à distance et pertinence égales, l’ordre alphabétique des noms décide.',
	},
	{
		id: 'completeness',
		group: 'order',
		text: 'Sans ville reconnue, à pertinence égale, le profil le plus complet passe d’abord (nombre de rubriques remplies : présentation, photo, prestations, compétences, formations, réseaux, galerie…).',
	},
	{
		id: 'recent',
		group: 'order',
		text: 'Puis, à complétude égale, le profil modifié le plus récemment, puis l’adresse du profil dans l’ordre alphabétique.',
	},
	{
		id: 'far',
		group: 'other',
		text: `Quand personne n’est inscrit près de votre ville, « Elles se déplacent loin » montre au plus ${FAR_TRAVELLERS_MAX} maquilleuses dont le rayon atteint ${FAR_REACH_KM} km ou plus, ou qui travaillent dans plusieurs pays : celles que l’on peut joindre d’abord, puis les plus proches.`,
	},
	{
		id: 'blocks',
		group: 'other',
		text: 'Sous une page de spécialité ou un article, les maquilleuses montrées sont celles qui correspondent le mieux au thème, dans le même ordre que la recherche. Seuls les profils complets et joignables y figurent.',
	},
	{
		id: 'pages',
		group: 'other',
		text: `Les résultats sont présentés ${PER_PAGE} par page, dans l’ordre ci-dessus, sans qu’une maquilleuse apparaisse deux fois.`,
	},
] as const satisfies readonly RankingRule[]

export type RankingRuleId = (typeof RANKING_RULES)[number]['id']

/** What does not count, said on the page. Each line is checked by the test. */
export const RANKING_EXCLUDED = [
	'Aucun paiement, aucune publicité, aucun abonnement : rien de payant n’existe dans le classement.',
	'Le badge « Pro » des cartes est posé par l’équipe et n’avance personne.',
	'Il n’y a pas d’avis de clientes sur My Makeup : aucune note n’entre dans le classement.',
	BADGE_NO_BONUS,
] as const

export type RankingExcluded = (typeof RANKING_EXCLUDED)[number]
