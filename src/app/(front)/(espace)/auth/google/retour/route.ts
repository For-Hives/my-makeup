import config from '@payload-config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { attributsDeLaMarque, COOKIE_DE_MARQUE_DE_CONNEXION } from '@/lib/analytics/marque-connexion'
import { cookieDeSession } from '@/lib/auth/cookie-session'
import { CHEMIN_DU_DEPART_GOOGLE, COOKIE_DE_GOOGLE, configGoogle, siteDeLEspace } from '@/lib/auth/google/config'
import { terminerLaConnexionGoogle } from '@/lib/auth/google/connexion-google'
import { ipClient } from '@/lib/auth/ip-client'
import { journalDe } from '@/lib/auth/journal'
import { ENTETES_DE_RELAIS, pageDeRelais } from '@/lib/auth/page-de-relais'
import { retourSur } from '@/lib/auth/retour'
import { serverEnv } from '@/lib/env'

// Read per request, never cached: it opens a session.
export const dynamic = 'force-dynamic'

/** The page that ends the return: the relay page (`src/lib/auth/page-de-relais.ts`), so that the first page of the space sees the cookie. */
function passerParLeSite(chemin: string): NextResponse {
	return new NextResponse(pageDeRelais(chemin), { status: 200, headers: ENTETES_DE_RELAIS })
}

/**
 * Where Google sends the browser back (tickets 090 and 091). Everything is decided in
 * `terminerLaConnexionGoogle`; this door reads the request, puts the session in its cookie like the
 * password sign-in does, and sends the browser on (a refusal: a redirection to the sign-in form;
 * a success: `passerParLeSite`). The cookie of the request is spent whatever the outcome,
 * so that a return cannot be played twice. The address of the site comes from the configuration,
 * never from the request.
 */
export async function GET(requete: Request) {
	const site = siteDeLEspace()
	const vers = (chemin: string) => {
		const reponse = NextResponse.redirect(new URL(chemin, site), 307)
		reponse.headers.set('Cache-Control', 'private, no-store')
		return reponse
	}
	const depenser = (reponse: NextResponse) => {
		reponse.cookies.set({ name: COOKIE_DE_GOOGLE, value: '', maxAge: 0, path: CHEMIN_DU_DEPART_GOOGLE })
		return reponse
	}

	const client = configGoogle()
	if (!client) return depenser(vers('/auth/signin?error=google-echec'))

	const parametres = new URL(requete.url).searchParams
	const payload = await getPayload({ config })
	const issue = await terminerLaConnexionGoogle({
		payload,
		config: client,
		secret: serverEnv().payloadSecret,
		retour: { code: parametres.get('code'), state: parametres.get('state'), error: parametres.get('error') },
		cookie: (await cookies()).get(COOKIE_DE_GOOGLE)?.value,
		journal: journalDe(payload),
		// The brake by address and the bound on the journal rows (ticket 223).
		client: ipClient(requete.headers),
	})
	if (!issue.ok) return depenser(vers(`/auth/signin?error=${issue.code}`))

	// Already reduced at the departure; reduced again, because the cookie is a place a value waits.
	const reponse = depenser(passerParLeSite(retourSur(issue.destination, site)))
	// On the response itself: a cookie set through `cookies()` is not carried by a response we build.
	reponse.cookies.set(cookieDeSession(payload, issue.token))
	// Tells the next page to send `login_result` (ticket 146).
	reponse.cookies.set(
		COOKIE_DE_MARQUE_DE_CONNEXION,
		'google',
		attributsDeLaMarque(process.env.NODE_ENV === 'production')
	)
	return reponse
}
