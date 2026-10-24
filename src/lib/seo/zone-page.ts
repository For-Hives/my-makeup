import type { Metadata } from 'next'
import { profilePath } from '../slug'
import { breadcrumbStructuredData } from './json-ld'
import { pageMetadata } from './metadata'
import { canonicalUrl } from './url'
import { departmentName, zonePath, zoneStatus } from './zones'

/**
 * The head of a zone page (ticket 1015): its title, its description, its robots tag and its structured data,
 * all from the département and the number of profiles the page shows. Nothing the site does not know: no
 * rating, no address, no contact detail.
 */

/** « Haute-Savoie (74) »: the name that titles the page. No article before it, which French needs and a département list does not give. */
export const zoneLabel = (code: string): string => `${departmentName(code)} (${code})`

export const zoneTitle = (code: string): string => `Maquilleuses près de chez vous : ${zoneLabel(code)}`

/** The metadata of a zone page: indexable from the threshold, noindex and no canonical address under it (never reached at the threshold of 1). */
export function zonePageMetadata({ code, count }: { code: string; count: number }): Metadata {
	return pageMetadata({
		titre: zoneTitle(code),
		description: `Découvrez ${count} maquilleuses professionnelles indépendantes du département ${zoneLabel(code)} : leurs spécialités, leurs tarifs et leur contact direct, sur My-Makeup.`,
		repli: `Les maquilleuses professionnelles indépendantes du département ${zoneLabel(code)}, sur My-Makeup.`,
		chemin: zonePath(code),
		indexable: zoneStatus(count) === 'indexable',
	})
}

/** The breadcrumb, and the collection of the profiles of the zone (by their addresses only). */
export function zoneStructuredData({ code, slugs }: { code: string; slugs: readonly string[] }) {
	const url = canonicalUrl(zonePath(code))
	return [
		breadcrumbStructuredData([
			{ nom: 'Accueil', url: canonicalUrl('/') },
			{ nom: zoneLabel(code), url },
		]),
		{
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: zoneTitle(code),
			url,
			inLanguage: 'fr-FR',
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: slugs.length,
				itemListElement: slugs.map((slug, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					url: canonicalUrl(profilePath(slug)),
				})),
			},
		},
	]
}
