import config from '@payload-config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { attributsDeLaMarque, COOKIE_DE_MARQUE_DE_CONNEXION } from '@/lib/analytics/sign-in-mark'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { configGoogle, dashboardSite, GOOGLE_COOKIE, GOOGLE_START_PATH } from '@/lib/auth/google/config'
import { finishGoogleSignIn } from '@/lib/auth/google/google-sign-in'
import { RELAY_HEADERS, relayPage } from '@/lib/auth/relay-page'
import { safeReturnTo } from '@/lib/auth/return-to'
import { sessionCookie } from '@/lib/auth/set-session-cookie'
import { serverEnv } from '@/lib/env'

// Read per request, never cached: it opens a session.
export const dynamic = 'force-dynamic'

/** The page that ends the return: the relay page (`src/lib/auth/relay-page.ts`), so that the first page of the space sees the cookie. */
function goThroughSite(chemin: string): NextResponse {
	return new NextResponse(relayPage(chemin), { status: 200, headers: RELAY_HEADERS })
}

/**
 * Where Google sends the browser back (tickets 090 and 091). Everything is decided in
 * `finishGoogleSignIn`; this door reads the request, puts the session in its cookie like the
 * password sign-in does, and sends the browser on (a refusal: a redirection to the sign-in form;
 * a success: `passerParLeSite`). The cookie of the request is spent whatever the outcome,
 * so that a return cannot be played twice. The address of the site comes from the configuration,
 * never from the request.
 */
export async function GET(requete: Request) {
	const site = dashboardSite()
	const toPath = (chemin: string) => {
		const response = NextResponse.redirect(new URL(chemin, site), 307)
		response.headers.set('Cache-Control', 'private, no-store')
		return response
	}
	const spend = (reponse: NextResponse) => {
		reponse.cookies.set({ name: GOOGLE_COOKIE, value: '', maxAge: 0, path: GOOGLE_START_PATH })
		return reponse
	}

	const client = configGoogle()
	if (!client) return spend(toPath('/auth/signin?error=google-echec'))

	const params = new URL(requete.url).searchParams
	const payload = await getPayload({ config })
	const issue = await finishGoogleSignIn({
		payload,
		config: client,
		secret: serverEnv().payloadSecret,
		retour: { code: params.get('code'), state: params.get('state'), error: params.get('error') },
		cookie: (await cookies()).get(GOOGLE_COOKIE)?.value,
		journal: authLog(payload),
		// The brake by address and the bound on the journal rows (ticket 223).
		client: ipClient(requete.headers),
	})
	if (!issue.ok) return spend(toPath(`/auth/signin?error=${issue.code}`))

	// Already reduced at the departure; reduced again, because the cookie is a place a value waits.
	const response = spend(goThroughSite(safeReturnTo(issue.destination, site)))
	// On the response itself: a cookie set through `cookies()` is not carried by a response we build.
	response.cookies.set(sessionCookie(payload, issue.token))
	// Tells the next page to send `login_result` (ticket 146).
	response.cookies.set(
		COOKIE_DE_MARQUE_DE_CONNEXION,
		'google',
		attributsDeLaMarque(process.env.NODE_ENV === 'production')
	)
	return response
}
