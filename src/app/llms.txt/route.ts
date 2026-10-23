import { llmsText } from '@/lib/seo/llms'

/**
 * /llms.txt (ticket 1014): the guide for the assistants. Static text built from the fixed public pages, so
 * the build can prerender it: no database, no artist.
 */
export const dynamic = 'force-static'

export function GET(): Response {
	return new Response(llmsText(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
