import NextAuth from 'next-auth'
// import google provider
import GoogleProvider from 'next-auth/providers/google'
// import instagram provider
import InstagramProvider from 'next-auth/providers/instagram'

export const authOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		}),
		InstagramProvider({
			clientId: process.env.INSTAGRAM_CLIENT_ID,
			clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
		}),
	],

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
