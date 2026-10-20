import type { MetadataRoute } from 'next'
import { robotsRules } from '@/lib/seo/robots'

/**
 * /robots.txt (ticket 115): the only source, there is no public/robots.txt. Open to all except
 * the API, with the sitemap. /auth and /search are not blocked: they answer noindex, which a
 * blocked page would never show (src/lib/seo/robots.ts).
 */
export default function robots(): MetadataRoute.Robots {
	return robotsRules()
}
