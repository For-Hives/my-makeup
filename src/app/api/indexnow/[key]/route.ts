import { cleIndexNow } from '@/lib/seo/indexnow'

// Read at each request: the key is a variable of the environment, absent when the page is built.
export const dynamic = 'force-dynamic'

/**
 * The key file of IndexNow (ticket 219): `/<key>.txt` at the root of the site, which next.config.ts
 * rewrites here. 200 with the key as the whole body when the address names the key of INDEXNOW_KEY,
 * 404 for any other key and for every key when the variable is not set: nothing is served without it.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
	const { key } = await params
	const attendue = cleIndexNow()
	if (attendue === undefined || key !== attendue) return new Response('Page introuvable', { status: 404 })
	return new Response(attendue, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
	})
}
