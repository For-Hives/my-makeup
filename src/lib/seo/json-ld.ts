import { SITE_ORIGIN } from '../urls-gelees'

/** The names the structured data gives the site and its publisher. */
export const NOM_DU_SITE = 'My-Makeup'
export const IDENTIFIANT_DE_L_ORGANISATION = `${SITE_ORIGIN}/#organisation`
export const IDENTIFIANT_DU_SITE = `${SITE_ORIGIN}/#site`

/** The logo of the site, an absolute address (a crawler reads it away from the site). */
export const LOGO_DU_SITE = `${SITE_ORIGIN}/assets/logo.webp`

/**
 * The structured data of the home page (SEO-26): the organisation that publishes the site and the site.
 * Nothing that the site does not know or does not show: no rating, no postal address, no contact
 * detail of a makeup artist. `sameAs` lists the public pages of the brand on the networks.
 */
export function donneesStructureesDeLAccueil(sameAs: readonly string[]) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Organization',
				'@id': IDENTIFIANT_DE_L_ORGANISATION,
				name: NOM_DU_SITE,
				url: SITE_ORIGIN,
				logo: LOGO_DU_SITE,
				sameAs: [...sameAs],
			},
			{
				'@type': 'WebSite',
				'@id': IDENTIFIANT_DU_SITE,
				name: NOM_DU_SITE,
				url: SITE_ORIGIN,
				inLanguage: 'fr-FR',
				publisher: { '@id': IDENTIFIANT_DE_L_ORGANISATION },
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
