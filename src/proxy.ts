import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_DE_SESSION, redirectionDeLEspace } from '@/lib/auth/espace-ferme'

// The private pages of the space answer one redirection to the sign-in page when no session cookie
// comes with the request (ticket 075). The authoritative check is the page's own (`exigerMaquilleuse`).
export function proxy(requete: NextRequest) {
	const { pathname, search } = requete.nextUrl
	const vers = redirectionDeLEspace(pathname, search, requete.cookies.has(COOKIE_DE_SESSION))
	if (!vers) return NextResponse.next()
	// Built from the URL of the request, so the host is the one the visitor used (the Host header the proxy forwards).
	const cible = requete.nextUrl.clone()
	const [chemin = '', recherche = ''] = vers.split('?')
	cible.pathname = chemin
	cible.search = recherche ? `?${recherche}` : ''
	return NextResponse.redirect(cible, 307)
}

export const config = { matcher: ['/auth/profil/:path*', '/auth/init-account/:path*'] }
