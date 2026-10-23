import { SITE_ORIGIN } from '../frozen-urls'

/** The names the structured data gives the site and its publisher. */
export const SITE_NAME = 'My-Makeup'
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organisation`
export const SITE_ID = `${SITE_ORIGIN}/#site`

/** The logo of the site, an absolute address (a crawler reads it away from the site). */
export const SITE_LOGO = `${SITE_ORIGIN}/assets/logo.webp`

/**
 * The structured data of the home page (SEO-26): the organisation that publishes the site and the site.
 * Nothing that the site does not know or does not show: no rating, no postal address, no contact
 * detail of a makeup artist. `sameAs` lists the public pages of the brand on the networks.
 */
export function homeStructuredData(sameAs: readonly string[]) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Organization',
				'@id': ORGANIZATION_ID,
				name: SITE_NAME,
				url: SITE_ORIGIN,
				logo: SITE_LOGO,
				sameAs: [...sameAs],
			},
			{
				'@type': 'WebSite',
				'@id': SITE_ID,
				name: SITE_NAME,
				url: SITE_ORIGIN,
				inLanguage: 'fr-FR',
				publisher: { '@id': ORGANIZATION_ID },
			},
		],
	}
}

/** JSON-LD for a script tag (test U50): `<`, `>` and `&` can never close the tag or open an entity. */
export function serializeJsonLd(donnees: unknown): string {
	return JSON.stringify(donnees)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replaceAll(' ', '\\u2028')
		.replaceAll(' ', '\\u2029')
}

/** One step of a breadcrumb: its name, and the absolute address it leads to. */
export interface BreadcrumbStep {
	nom: string
	url: string
}

/** The breadcrumb of a page (SEO-26, test E65): the steps in order, from the home page to the page itself. */
export function breadcrumbStructuredData(etapes: readonly BreadcrumbStep[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: etapes.map((etape, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: etape.nom,
			item: etape.url,
		})),
	}
}

/** What the structured data of an article says: nothing the page does not show. */
export interface ArticleInputs {
	titre: string
	description: string
	/** The absolute address of the article. */
	url: string
	/** The signature under the title; empty when there is none: the publisher is then the author. */
	auteur: string
	publieLe: string
	modifieLe: string
}

/** `Article` of an article (SEO-26): never a rating, never an address. */
export function articleStructuredData(entrees: ArticleInputs) {
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: entrees.titre,
		description: entrees.description,
		inLanguage: 'fr-FR',
		datePublished: entrees.publieLe,
		dateModified: entrees.modifieLe,
		mainEntityOfPage: { '@type': 'WebPage', '@id': entrees.url },
		author: entrees.auteur
			? { '@type': 'Person', name: entrees.auteur }
			: { '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE_NAME },
		publisher: { '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE_NAME, logo: SITE_LOGO },
	}
}
