import config from '@payload-config'
import { getPayload } from 'payload'
import { ipClient } from '@/lib/auth/client-ip'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { isLocalAddress } from '@/lib/search/rate-limit'
import { readViewBody } from '@/lib/views/profile-views'
import { recordProfileView } from '@/services/views/record-view'

// Never prerendered, never cached: each call counts once.
export const dynamic = 'force-dynamic'

/** 120 counts a minute from one address: a person does not open more profiles than that. The address is a key to count, never written. */
const brake = createRateLimit({ nom: 'profile-views', limite: 120, fenetreMs: 60_000 })

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

/**
 * `POST /api/profile-views` `{ "slug": "…" }`: the profile page calls it once per tab (ticket 1001). The
 * page is kept in the cache of Next and reads no cookie, so the count cannot be made while rendering.
 * The answer is 204 whether the view was counted or not: a caller learns nothing about the profile or
 * about the rules. 400 for a body that is not a slug, 429 past the brake. A GET answers 405.
 */
export async function POST(request: Request): Promise<Response> {
	const key = ipClient(request.headers)
	if (!isLocalAddress(key) && !brake.prendre(key).autorise) return new Response(null, { status: 429, headers: HEADERS })
	const text = await request.text()
	if (text.length > 400) return new Response(null, { status: 400, headers: HEADERS })
	let body: ReturnType<typeof readViewBody>
	try {
		body = readViewBody(JSON.parse(text))
	} catch {
		body = undefined
	}
	if (!body) return new Response(null, { status: 400, headers: HEADERS })
	try {
		await recordProfileView(await getPayload({ config }), { slug: body.slug, headers: request.headers })
	} catch {
		// A count that failed is not worth an error for the visitor, nor a line that could quote a row.
	}
	return new Response(null, { status: 204, headers: HEADERS })
}
