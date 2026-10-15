/**
 * The preview of a shared link (ticket 116; plan 03 SEO-12; plan 02 U51): Open Graph and Twitter tags,
 * and the picture they point to. Pure, so the tests call it without a database.
 *
 * Next replaces the `openGraph` of a parent as a whole and never fills `og:title` from `title`: every page
 * gets its tags from `metadonnees` (src/lib/seo/metadonnees.ts), which calls `balisesDePartage` below.
 */

import type { Metadata } from 'next'
import { SITE_ORIGIN } from '../urls-gelees'
import { MARQUE } from './texte'

/** The picture of the site, shared by every page that has none of its own (1200 x 630). */
export const IMAGE_PAR_DEFAUT = { url: `${SITE_ORIGIN}/assets/og-my-makeup.jpg`, width: 1200, height: 630 } as const

/** Width of a shared picture: one of the widths the image optimizer of Next accepts. */
export const LARGEUR_DE_PARTAGE = 1200
/** Heaviest picture a messaging app is sure to show in a preview (WhatsApp may leave out a heavier one). */
export const POIDS_DE_PARTAGE_MAX_KO = 300
/** The quality asked to the optimizer: the only one Next allows by default. */
export const QUALITE_DE_PARTAGE = 75

export type TypeDePartage = 'website' | 'profile' | 'article'

export interface ImageDePartage {
	/** Absolute address. */
	url: string
	width?: number
	height?: number
}

/**
 * The picture shared for a photo: the original through the image optimizer of Next (`/_next/image`, the one
 * `next/image` uses), 1200 px wide and never enlarged. The originals of the photos weigh up to 1.4 MB; the
 * optimized copy is a few hundred KB at most. The optimizer fetches the photo from the media host only
 * (`images.remotePatterns`, next.config.ts). Without a usable photo, the picture of the site.
 */
export function imageDePartageDeLaPhoto(
	photo: { url?: unknown; width?: unknown; height?: unknown } | null | undefined
): ImageDePartage {
	const adresse = typeof photo?.url === 'string' ? photo.url : ''
	if (!/^https?:\/\//i.test(adresse) || !URL.canParse(adresse)) return IMAGE_PAR_DEFAUT
	const url = `${SITE_ORIGIN}/_next/image?url=${encodeURIComponent(adresse)}&w=${LARGEUR_DE_PARTAGE}&q=${QUALITE_DE_PARTAGE}`
	const largeur = typeof photo?.width === 'number' && photo.width > 0 ? photo.width : null
	const hauteur = typeof photo?.height === 'number' && photo.height > 0 ? photo.height : null
	if (!largeur || !hauteur) return { url }
	const rendue = Math.min(LARGEUR_DE_PARTAGE, largeur)
	return { url, width: rendue, height: Math.round((hauteur * rendue) / largeur) }
}

/**
 * The tags of a shared link: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`,
 * `og:image` (absolute), and the Twitter card. A page that is not indexed keeps them: they only say what
 * the link looks like, and its `og:url` is its own address even though it has no canonical one.
 */
export function balisesDePartage(entrees: {
	titre: string
	description: string
	url: string
	type?: TypeDePartage
	image?: ImageDePartage
}): Pick<Metadata, 'openGraph' | 'twitter'> {
	const image = entrees.image ?? IMAGE_PAR_DEFAUT
	return {
		openGraph: {
			type: entrees.type ?? 'website',
			locale: 'fr_FR',
			siteName: MARQUE,
			url: entrees.url,
			title: entrees.titre,
			description: entrees.description,
			images: [image],
		},
		twitter: {
			card: 'summary_large_image',
			title: entrees.titre,
			description: entrees.description,
			images: [image.url],
		},
	}
}
