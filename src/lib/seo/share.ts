/**
 * The preview of a shared link (ticket 116; plan 03 SEO-12; plan 02 U51): Open Graph and Twitter tags,
 * and the picture they point to. Pure, so the tests call it without a database.
 *
 * Next replaces the `openGraph` of a parent as a whole and never fills `og:title` from `title`: every page
 * gets its tags from `pageMetadata` (src/lib/seo/metadata.ts), which calls `shareTags` below.
 */

import type { Metadata } from 'next'
import { SITE_ORIGIN } from '../frozen-urls'
import { BRAND } from './text'

/** The picture of the site, shared by every page that has none of its own (1200 x 630). */
export const DEFAULT_IMAGE = { url: `${SITE_ORIGIN}/assets/og-my-makeup.jpg`, width: 1200, height: 630 } as const

/** Width of a shared picture: one of the widths the image optimizer of Next accepts. */
export const SHARE_WIDTH = 1200
/** Heaviest picture a messaging app is sure to show in a preview (WhatsApp may leave out a heavier one). */
export const SHARE_MAX_WEIGHT_KB = 300
/** The quality asked to the optimizer: the only one Next allows by default. */
export const SHARE_QUALITY = 75

export type ShareType = 'website' | 'profile' | 'article'

export interface ShareImage {
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
export function shareImageOfPhoto(
	photo: { url?: unknown; width?: unknown; height?: unknown } | null | undefined
): ShareImage {
	const photoUrl = typeof photo?.url === 'string' ? photo.url : ''
	if (!/^https?:\/\//i.test(photoUrl) || !URL.canParse(photoUrl)) return DEFAULT_IMAGE
	const url = `${SITE_ORIGIN}/_next/image?url=${encodeURIComponent(photoUrl)}&w=${SHARE_WIDTH}&q=${SHARE_QUALITY}`
	const width = typeof photo?.width === 'number' && photo.width > 0 ? photo.width : null
	const height = typeof photo?.height === 'number' && photo.height > 0 ? photo.height : null
	if (!width || !height) return { url }
	const rendered = Math.min(SHARE_WIDTH, width)
	return { url, width: rendered, height: Math.round((height * rendered) / width) }
}

/**
 * The tags of a shared link: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`,
 * `og:image` (absolute), and the Twitter card. A page that is not indexed keeps them: they only say what
 * the link looks like, and its `og:url` is its own address even though it has no canonical one.
 */
export function shareTags(entrees: {
	titre: string
	description: string
	url: string
	type?: ShareType
	image?: ShareImage
}): Pick<Metadata, 'openGraph' | 'twitter'> {
	const image = entrees.image ?? DEFAULT_IMAGE
	return {
		openGraph: {
			type: entrees.type ?? 'website',
			locale: 'fr_FR',
			siteName: BRAND,
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
