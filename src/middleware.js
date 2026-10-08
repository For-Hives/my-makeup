import { NextResponse } from 'next/server'
import { withAuth } from 'next-auth/middleware'
import { sessionValide } from '@/lib/auth-session'
import { UMAMI_PROXY_PATHS, umamiProxyHeaders } from '@/lib/umami'

// A single redirection to the sign-in page, with the page to come back to,
// and only for a session that still carries a valid Strapi JWT (A2).
const auth = withAuth({
	pages: { signIn: '/auth/signin' },
	callbacks: {
		authorized: ({ token }) => sessionValide(token, Date.now()),
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
