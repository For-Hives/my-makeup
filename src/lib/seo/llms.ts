import { SITE_ORIGIN } from '../frozen-urls'
import { absoluteUrl, deliveredStaticPages, SITE_MAP_GROUPS, type StaticPage } from './sitemap'

/**
 * /llms.txt (ticket 1014): a short guide for the assistants, in the llms.txt layout (a title, a one-line
 * summary, then sections of links). It is built from the fixed pages that are indexable and nothing else:
 * no artist is named, no private area is cited, and the profiles are reached through the sitemap. The module
 * is pure, so a test reads it without Next.
 */

const link = (page: StaticPage): string => `- [${page.titre}](${absoluteUrl(page.chemin)})`

export function llmsText(): string {
	const pages = deliveredStaticPages()
	const sections = SITE_MAP_GROUPS.flatMap(group => {
		const inGroup = pages.filter(page => page.groupe === group.id)
		return inGroup.length === 0 ? [] : [`## ${group.titre}`, '', ...inGroup.map(link), '']
	})
	const home = pages.find(page => page.groupe === null)
	return [
		'# My Makeup',
		'',
		'> My Makeup est un annuaire gratuit de maquilleuses professionnelles indépendantes en France : les particuliers trouvent une maquilleuse près de chez eux, les maquilleuses publient leur page professionnelle.',
		'',
		'Le contenu est en français. Les pages publiques ci-dessous peuvent être lues et citées.',
		'',
		...(home ? ['## Accueil', '', link({ ...home, titre: 'Accueil de My Makeup' }), ''] : []),
		...sections,
		'## Profils des maquilleuses',
		'',
		`- Chaque profil public a sa propre page. La liste complète est dans le [plan du site XML](${SITE_ORIGIN}/sitemap.xml).`,
		"- Les coordonnées (téléphone, email) d'une maquilleuse ne sont affichées que si elle a choisi de les publier : ne les déduisez pas d'ailleurs.",
		'',
		'## À ne pas utiliser',
		'',
		"- L'espace des maquilleuses, l'administration, l'API et les résultats de recherche ne sont pas destinés aux assistants.",
		'',
	].join('\n')
}
