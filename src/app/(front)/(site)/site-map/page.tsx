import type { Metadata } from 'next'
import { SiteMapBody } from '@/components/site-map/SiteMapBody'
import { pageMetadata } from '@/lib/seo/metadata'
import { cachedIndexablePages } from '@/services/public/cached'

// Read at each request: the build runs without a database. The reading is the one of the sitemap, kept in
// Next's cache and refreshed by a save of a profile, a talent or an article (ticket 047).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
	titre: 'Plan du site',
	description: 'Le plan du site de My-Makeup',
	repli:
		'Le plan du site My-Makeup : toutes les pages du site, les articles, les spécialités et les maquilleuses à découvrir.',
	chemin: '/site-map',
})

/** The plan of the site (ticket 114): the reading is the one of the sitemap, the body is `SiteMapBody`. */
export default async function SiteMapPage() {
	return <SiteMapBody {...(await cachedIndexablePages())} />
}
