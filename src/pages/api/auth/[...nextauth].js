import NextAuth from 'next-auth'
// import google provider
import GoogleProvider from 'next-auth/providers/google'
// import facebook provider
import FacebookProvider from 'next-auth/providers/facebook'

export const authOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		}),
		FacebookProvider({
			clientId: process.env.FACEBOOK_CLIENT_ID,
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
		}),
	],

	pages: {
		signIn: '/signin',
		signOut: '/signout',
		error: '/error', // Error code passed in query string as ?error=
		verifyRequest: '/verify-request', // (used for check email message)
		newUser: '/profil', // New users will be directed here on first sign in (leave the property out if not of interest)
	},

	session: { strategy: 'jwt' },

	callbacks: {
		async session({ session, token, user }) {
			session.jwt = token.jwt
			session.id = token.id
			return session
		},

		async jwt({ token, user, account }) {
			const isSignIn = !!user
			if (isSignIn) {
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}/api/auth/${account?.provider}/callback?access_token=${account?.access_token}`
				)
				const data = await response.json()
				token.jwt = data.jwt
				token.id = data.user.id
			}
			return token
		},
	},
}
export default NextAuth(authOptions)
