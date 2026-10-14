import { type NextRequest, NextResponse } from 'next/server'
import {
	COOKIE_DE_MESSAGE,
	cookieDEffacement,
	DUREE_DU_MESSAGE_EN_SECONDES,
	ENTETE_DE_MESSAGE,
	planDeNettoyage,
	VARIABLE_DE_BASCULE,
} from '@/lib/auth/cookies-herites'
import { COOKIE_DE_SESSION, redirectionDeLEspace } from '@/lib/auth/espace-ferme'
import { robotsPourChemin } from '@/lib/seo/robots'

/**
 * One proxy, no matcher: it runs for every request.
 * - The private pages of the space answer one redirection to the sign-in page when no session cookie
 *   comes with the request (ticket 075). The authoritative check is the page's own (`exigerMaquilleuse`).
 * - The cookies of the old authentication are expired on the first request, and the sign-in page tells
 *   once to sign in again (ticket 081). The back-office, the API and the files are left alone.
 * - Every other response gets the robots directive (ticket 070). It reads APP_ENV at run time: the
 *   pre-production gets its variables after the build. The paths of the account and of the search
 *   answer noindex everywhere.
 */
export function proxy(requete: NextRequest) {
	const { pathname, search } = requete.nextUrl
	const nettoyage = planDeNettoyage({
		chemin: pathname,
		noms: requete.cookies.getAll().map(cookie => cookie.name),
		prechargement: requete.headers.has('next-router-prefetch') || requete.headers.get('purpose') === 'prefetch',
		maintenant: new Date(),
		basculeLe: process.env[VARIABLE_DE_BASCULE],
	})
	// The header is the proxy's alone: whatever a visitor sends under that name is dropped.
	const entetes = new Headers(requete.headers)
	entetes.delete(ENTETE_DE_MESSAGE)
	if (nettoyage.afficherLeMessage) entetes.set(ENTETE_DE_MESSAGE, '1')
	const avecLeNettoyage = (reponse: NextResponse): NextResponse => {
		for (const nom of nettoyage.aEffacer) reponse.cookies.set(cookieDEffacement(nom))
		if (nettoyage.retenirLeMessage)
			reponse.cookies.set({
				name: COOKIE_DE_MESSAGE,
				value: '1',
				maxAge: DUREE_DU_MESSAGE_EN_SECONDES,
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		if (nettoyage.oublierLeMessage)
			reponse.cookies.set({
				name: COOKIE_DE_MESSAGE,
				value: '',
				maxAge: 0,
				expires: new Date(0),
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		return reponse
	}
	const vers = redirectionDeLEspace(pathname, search, requete.cookies.has(COOKIE_DE_SESSION))
	if (vers) {
		// Built from the URL of the request, so the host is the one the visitor used (the Host header the proxy forwards).
		const cible = requete.nextUrl.clone()
		const [chemin = '', recherche = ''] = vers.split('?')
		cible.pathname = chemin
		cible.search = recherche ? `?${recherche}` : ''
		const redirection = NextResponse.redirect(cible, 307)
		const consigneRedirection = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneRedirection) redirection.headers.set('X-Robots-Tag', consigneRedirection)
		return avecLeNettoyage(redirection)
	}
	const reponse = avecLeNettoyage(NextResponse.next({ request: { headers: entetes } }))
	const consigne = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
	if (consigne) reponse.headers.set('X-Robots-Tag', consigne)
	return reponse
}
