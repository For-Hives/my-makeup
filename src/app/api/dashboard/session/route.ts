import { cookies } from 'next/headers'
import { COOKIE_DE_SESSION } from '@/lib/auth/espace-ferme'
import { maquilleuseConnectee } from '@/lib/auth/session'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

/**
 * Whether the request comes from a signed-in makeup artist, for the navigation of the public pages
 * (ticket 078). The session cookie is HttpOnly, so the page cannot read it: it asks here, from the
 * browser, after it has loaded. The public pages themselves read no cookie and stay in the cache.
 *
 * It answers one boolean and nothing about the account, never cached. A request without the cookie
 * is answered without touching the database.
 */
export async function GET(): Promise<Response> {
	const aLeCookie = (await cookies()).has(COOKIE_DE_SESSION)
	const signedIn = aLeCookie && (await maquilleuseConnectee()) !== null
	return Response.json({ signedIn }, { headers: { 'Cache-Control': 'private, no-store' } })
}
