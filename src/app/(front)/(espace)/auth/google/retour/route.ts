import config from '@payload-config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { attributsDeLaMarque, COOKIE_DE_MARQUE_DE_CONNEXION } from '@/lib/analytics/marque-connexion'
import { cookieDeSession } from '@/lib/auth/cookie-session'
import { CHEMIN_DU_DEPART_GOOGLE, COOKIE_DE_GOOGLE, configGoogle, siteDeLEspace } from '@/lib/auth/google/config'
import { terminerLaConnexionGoogle } from '@/lib/auth/google/connexion-google'
import { journalDe } from '@/lib/auth/journal'
import { retourSur } from '@/lib/auth/retour'
import { serverEnv } from '@/lib/env'

// Read per request, never cached: it opens a session.
export const dynamic = 'force-dynamic'

const echapper = (texte: string): string =>
	texte.replace(
		/[&<>"']/g,
		lettre => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[lettre] ?? lettre
	)

/**
 * The page that ends the return: a short page that sends the browser on to `chemin` by itself.
 *
 * Not a redirection, on purpose. The browser comes from Google, so a redirection keeps the whole
 * chain « cross-site » (`Sec-Fetch-Site`), and Payload ignores a session cookie on a cross-site
 * request that carries no `Origin`: the first page of the space would take her for signed out. A
 * navigation that a page of this site starts is « same-origin », and the cookie counts. No script
 * is needed.
 */
function passerParLeSite(chemin: string): NextResponse {
	const cible = echapper(chemin)
	const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${cible}"><title>Connexion en cours</title></head><body><p>Connexion en cours… <a href="${cible}">Continuer</a></p></body></html>`
	return new NextResponse(page, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
	})
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
