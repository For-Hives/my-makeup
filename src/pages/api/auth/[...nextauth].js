import NextAuth from 'next-auth'
// import google provider
import GoogleProvider from 'next-auth/providers/google'
// import facebook provider
import FacebookProvider from 'next-auth/providers/facebook'
// import credential provider
import CredentialsProvider from 'next-auth/providers/credentials'

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
		CredentialsProvider({
			// The name to display on the sign in form (e.g. 'Sign in with...')
			name: 'Credentials',
			// The credentials is used to generate a suitable form on the sign in page.
			// You can specify whatever fields you are expecting to be submitted.
			// e.g. domain, username, password, 2FA token, etc.
			// You can pass any HTML attribute to the <input> tag through the object.
			credentials: {
				identifier: { label: 'Email', type: 'text' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				// You need to provide your own logic here that takes the credentials
				// submitted and returns either a object representing a user or value
				// that is false/null if the credentials are invalid.
				// e.g. return { id: 1, name: 'J Smith', email: 'jsmith@example.com' }
				// You can also use the `req` object to obtain additional parameters
				// (i.e., the request IP address)
				const fetch_url = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/local`
				const params = {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						identifier: credentials.email,
						password: credentials.password,
					}),
				}

				let response = await fetch(fetch_url, params)
				const data = await response.json()
				const user = { ...data.user, jwt: data.jwt }

				if (user) {
					return user
				} else {
					return null
				}
			},
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
				if (account.type === 'credentials') {
					token.jwt = user.jwt
					token.id = user.id
				} else {
					const response = await fetch(
						`${process.env.NEXT_PUBLIC_API_URL}/api/auth/${account?.provider}/callback?access_token=${account?.access_token}`
					)
					const data = await response.json()
					token.jwt = data.jwt
					token.id = data.user.id
				}
				return token
			}
		},
	},
}
export default NextAuth(authOptions)
