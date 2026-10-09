import { NextResponse } from 'next/server'
import { withAuth } from 'next-auth/middleware'
import {
	aCookieDeSession,
	cookiesSessionAEffacer,
	ligneLogAuth,
	sessionValide,
	urlSessionExpiree,
} from '@/lib/auth-session'
import { UMAMI_PROXY_PATHS, umamiProxyHeaders } from '@/lib/umami'

const nomsCookies = req => req.cookies.getAll().map(cookie => cookie.name)

// A session cookie was sent: withAuth read its token (same secret as the
// session read). A valid Strapi JWT goes through (A2). An unreadable token
// (secret rotated) or an expired Strapi JWT gets one redirection to the
// sign-in page with the « session expirée » message, and the cookie and its
// chunks are deleted, so the next visit is not caught again (RG-08).
function sessionEnvoyee(req) {
	if (sessionValide(req.nextauth.token, Date.now())) return NextResponse.next()
	const { pathname, search, origin } = req.nextUrl
	console.info(ligneLogAuth('session_expiree', { code: 'middleware' }))
	const reponse = NextResponse.redirect(
		new URL(urlSessionExpiree(`${pathname}${search}`, 'middleware'), origin)
	)
	for (const cookie of cookiesSessionAEffacer(nomsCookies(req)))
		reponse.headers.append('Set-Cookie', cookie)
	return reponse
}

// No session cookie at all: NextAuth's own redirection to the sign-in page,
// with the page to come back to and no message (she never signed in).
const auth = withAuth(sessionEnvoyee, {
	pages: { signIn: '/auth/signin' },
	callbacks: {
		authorized: ({ req }) => aCookieDeSession(nomsCookies(req)),
	},
})

export default function middleware(req, event) {
	// /u/script.js and /u/api/send (MES-10): next.config.js rewrites them to
	// Umami, with the headers Umami needs only (no cookie, no Referer, the
	// visitor's IP).
	if (UMAMI_PROXY_PATHS.includes(req.nextUrl.pathname))
		return NextResponse.next({
			request: { headers: umamiProxyHeaders(req.headers) },
		})
	return auth(req, event)
}

export const config = {
	matcher: [
		'/auth/profil',
		'/auth/init-account',
		'/u/script.js',
		'/u/api/send',
	],
}
