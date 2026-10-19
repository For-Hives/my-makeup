import { NextResponse } from 'next/server'
import {
	GOOGLE_START_PATH,
	GOOGLE_COOKIE,
	configGoogle,
	dashboardSite,
	GOOGLE_COOKIE_LIFE_S,
} from '@/lib/auth/google/config'
import { discover, prepareStart } from '@/lib/auth/google/oidc'
import { safeReturnTo } from '@/lib/auth/return-to'
import { serverEnv } from '@/lib/env'

// Read per request, never cached: it builds a request that belongs to one visitor.
export const dynamic = 'force-dynamic'

/**
 * The Google button (tickets 090 and 091): builds the request to Google, keeps its secrets in a
 * sealed cookie that only the return address receives, and sends the browser to Google. The same
 * door signs in and signs up: Google's answer decides which.
 *
 * The page to come back to is reduced to a path of this site before it is kept. Without a Google
 * client, or if Google cannot be reached, the visitor goes back to the sign-in form with a message.
 */
export async function GET(requete: Request) {
	const site = dashboardSite()
	const returnToForm = (code: string) => NextResponse.redirect(new URL(`/auth/signin?error=${code}`, site), 307)

	try {
		const config = configGoogle()
		if (!config) return returnToForm('google-echec')
		const returnTo = safeReturnTo(new URL(requete.url).searchParams.get('callbackUrl'), site)
		const start = prepareStart(config, await discover(config.emetteur), {
			retour: returnTo,
			secret: serverEnv().payloadSecret,
		})
		const response = NextResponse.redirect(start.adresse, 307)
		response.cookies.set({
			name: GOOGLE_COOKIE,
			value: start.cookie,
			httpOnly: true,
			// Lax: the cookie must come back with the top-level navigation that Google makes.
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: GOOGLE_START_PATH,
			maxAge: GOOGLE_COOKIE_LIFE_S,
		})
		response.headers.set('Cache-Control', 'private, no-store')
		return response
	} catch {
		// Google cannot be reached (its discovery document): an outage, not the visitor's doing.
		return returnToForm('google-indisponible')
	}
}
