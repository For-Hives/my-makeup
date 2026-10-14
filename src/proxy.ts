import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_DE_SESSION, decisionDeLEspace } from '@/lib/auth/espace-ferme'
import { robotsPourChemin } from '@/lib/seo/robots'

/**
 * One proxy, no matcher: it runs for every request.
 * - The private pages of the space answer one redirection to the sign-in page when no session cookie
 *   comes with the request (ticket 075), or when its end date has passed (ticket 080: with the
 *   « session expirée » message). The authoritative check is the page's own (`exigerMaquilleuse`).
 * - Every other response gets the robots directive (ticket 070). It reads APP_ENV at run time: the
 *   pre-production gets its variables after the build. The paths of the account and of the search
 *   answer noindex everywhere.
 */
export function proxy(requete: NextRequest) {
	const { pathname, search } = requete.nextUrl
	const vers = decisionDeLEspace(
		pathname,
		search,
		requete.cookies.get(COOKIE_DE_SESSION)?.value,
		Math.floor(Date.now() / 1000)
	)
	if (vers) {
		// Built from the URL of the request, so the host is the one the visitor used (the Host header the proxy forwards).
		const cible = requete.nextUrl.clone()
		const [chemin = '', recherche = ''] = vers.split('?')
		cible.pathname = chemin
		cible.search = recherche ? `?${recherche}` : ''
		const redirection = NextResponse.redirect(cible, 307)
		const consigneRedirection = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneRedirection) redirection.headers.set('X-Robots-Tag', consigneRedirection)
		return redirection
	}
	const reponse = NextResponse.next()
	const consigne = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
	if (consigne) reponse.headers.set('X-Robots-Tag', consigne)
	return reponse
}
