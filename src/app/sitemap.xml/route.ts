import { entreesDuSitemap, sitemapXml } from '@/lib/seo/sitemap'
import { lesPagesIndexablesEnCache } from '@/services/public/cached'

// Read at each request: the build runs without a database. The reading is kept in Next's cache, tagged by
// the three collections it lists, so a save refreshes it (ticket 047).
export const dynamic = 'force-dynamic'

/**
 * /sitemap.xml (ticket 113): the fixed pages, every publishable profile by its slug, every talent and every
 * article, with the real date of their last change. A failed reading is a 500, never a shorter sitemap.
 */
export async function GET(): Promise<Response> {
	const { profils, talents, articles } = await lesPagesIndexablesEnCache()
	const xml = sitemapXml(entreesDuSitemap({ profils, talents, articles }))
	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
