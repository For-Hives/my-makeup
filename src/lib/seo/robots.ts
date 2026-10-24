import { SITE_ORIGIN } from '../frozen-urls'

/**
 * What search engines may index (ticket 070, test U52): never the account pages (/auth) nor the
 * search (/search). These paths are not blocked in
 * robots.txt, or the noindex would never be read: they answer noindex, in a header and in a tag.
 */

export const NOINDEX = 'noindex, follow'

/** Path prefixes that are never indexed. */
export const NOINDEX_PATHS: readonly string[] = ['/auth', '/search']

export function isNoindexPath(chemin: string): boolean {
	const clean = chemin.split(/[?#]/, 1)[0] ?? ''
	return NOINDEX_PATHS.some(prefixe => clean === prefixe || clean.startsWith(`${prefixe}/`))
}

/**
 * The robots directive of a response, or nothing when the page decides for itself. There is no
 * staging environment (ticket 232): the noindex of the temporary host comes from the host (Coolify), not from here.
 */
export function robotsForPath(chemin: string): string | undefined {
	return isNoindexPath(chemin) ? NOINDEX : undefined
}

/**
 * The single source of robots.txt (tickets 115 and 1014, tests E63 and assistant-robots): open to all, except
 * the API routes, then one group for the named assistant crawlers.
 *
 * - Owner decision of 24/10/2026: every robot is allowed, search and on-demand bots (an assistant fetches a
 *   page to answer someone) and training bots (they gather text to train a model) alike: more visits. The
 *   terms of use say nothing against it. Naming them is optional; it keeps the decision readable.
 * - The group of the assistants repeats the private paths, because a bot with its own group ignores the
 *   general one. These paths are blocked for them only: for search engines /auth and /search stay open, so
 *   that the noindex is read.
 * - No directive ever cuts the extracts shown by a search or an assistant: assistants are an arrival channel.
 */
export const SITEMAP_PATH = '/sitemap.xml'
export const DISALLOWED_PATHS: readonly string[] = ['/api/']

/** What a bot of an assistant never reads: the API, the administration, the account area, the search. */
export const ASSISTANT_PRIVATE_PATHS: readonly string[] = ['/api/', '/admin', '/auth', '/search']

/** Crawlers that fetch pages to answer someone: allowed on the public site. */
export const ASSISTANT_SEARCH_BOTS: readonly string[] = [
	'OAI-SearchBot',
	'ChatGPT-User',
	'Claude-SearchBot',
	'Claude-User',
	'PerplexityBot',
	'Perplexity-User',
]

/** Crawlers that gather text to train models: allowed on the public site, like the others. */
export const ASSISTANT_TRAINING_BOTS: readonly string[] = [
	'GPTBot',
	'ClaudeBot',
	'anthropic-ai',
	'Google-Extended',
	'Applebot-Extended',
	'CCBot',
	'Meta-ExternalAgent',
	'Bytespider',
]

export interface RobotsGroup {
	userAgent: string | string[]
	allow?: string
	disallow?: string | string[]
}

export function robotsRules(): { rules: RobotsGroup[]; sitemap: string } {
	return {
		rules: [
			{ userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
			{
				userAgent: [...ASSISTANT_SEARCH_BOTS, ...ASSISTANT_TRAINING_BOTS],
				allow: '/',
				disallow: [...ASSISTANT_PRIVATE_PATHS],
			},
		],
		// Absolute, on the apex: the same constant as the canonical addresses, never an environment variable.
		sitemap: `${SITE_ORIGIN}${SITEMAP_PATH}`,
	}
}
