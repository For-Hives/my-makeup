import { withAuth } from 'next-auth/middleware'
import { sessionValide } from '@/lib/auth-session'

// A single redirection to the sign-in page, with the page to come back to,
// and only for a session that still carries a valid Strapi JWT (A2).
export default withAuth({
	pages: { signIn: '/auth/signin' },
	callbacks: {
		authorized: ({ token }) => sessionValide(token, Date.now()),
	},
})

export const config = { matcher: ['/auth/profil', '/auth/init-account'] }
