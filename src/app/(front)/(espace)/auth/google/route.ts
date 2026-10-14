import { NextResponse } from 'next/server'
import {
	CHEMIN_DU_DEPART_GOOGLE,
	COOKIE_DE_GOOGLE,
	configGoogle,
	siteDeLEspace,
	VIE_DU_COOKIE_DE_GOOGLE_S,
} from '@/lib/auth/google/config'
import { decouvrir, preparerLeDepart } from '@/lib/auth/google/oidc'
import { retourSur } from '@/lib/auth/retour'
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
	const site = siteDeLEspace()
	const retourAuFormulaire = (code: string) => NextResponse.redirect(new URL(`/auth/signin?error=${code}`, site), 307)

	try {
		const config = configGoogle()
		if (!config) return retourAuFormulaire('google-echec')
		const retour = retourSur(new URL(requete.url).searchParams.get('callbackUrl'), site)
		const depart = preparerLeDepart(config, await decouvrir(config.emetteur), {
			retour,
			secret: serverEnv().payloadSecret,
		})
		const reponse = NextResponse.redirect(depart.adresse, 307)
		reponse.cookies.set({
			name: COOKIE_DE_GOOGLE,
			value: depart.cookie,
			httpOnly: true,
			// Lax: the cookie must come back with the top-level navigation that Google makes.
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: CHEMIN_DU_DEPART_GOOGLE,
			maxAge: VIE_DU_COOKIE_DE_GOOGLE_S,
		})
		reponse.headers.set('Cache-Control', 'private, no-store')
		return reponse
	} catch {
		return retourAuFormulaire('google-echec')
	}
}
