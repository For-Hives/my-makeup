import NextAuth from 'next-auth'
// import google provider
import GoogleProvider from 'next-auth/providers/google'
// import facebook provider
import FacebookProvider from 'next-auth/providers/facebook'
// import credential provider
import CredentialsProvider from 'next-auth/providers/credentials'

const options = {
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
			name: 'Credentials',
			credentials: {
				email: { label: 'Email', type: 'email', placeholder: 'Email' },
				password: { label: 'Password', type: 'Password' },
			},
			authorize: async ({ password, email }) => {
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}api/auth/local`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							identifier: email,
							password: password,
						}),
					}
				)
				const authenticated = await response.json()

				if (authenticated) {
					return Promise.resolve({
						id: authenticated.user.id,
						name: authenticated.user.username,
						email: authenticated.user.email,
						jwt: authenticated.jwt,
					})
				} else {
					return Promise.resolve(null)
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
	secret: `${process.env.NEXTAUTH_SECRET}`, //PUT YOUR OWN SECRET (command: openssl rand -base64 32)
	database: `${process.env.NEXT_PUBLIC_DATABASE_URL}`,
	session: {
		strategy: 'jwt',
	},
	debug: true,
	callbacks: {
		async session({ session, token, user }) {
			session.jwt = token.jwt
			session.id = token.id

			return session
		},
		async jwt({ token, user, account, profile, isNewUser }) {
			const isSignIn = !!user

			if (isSignIn) {
				if (
					typeof account.provider !== 'undefined' &&
					account.type !== 'credentials'
				) {
					const response = await fetch(
						`${process.env.NEXT_PUBLIC_API_URL}api/auth/${account.provider}/callback?access_token=${account?.access_token}`
					)
					const data = await response.json()
					token.jwt = data.jwt
					token.id = data.user.id
				} else {
					token.id = user.id
					token.jwt = user.jwt
				}
			}

			return token
		},
	},
}

const Auth = (req, res) => NextAuth(req, res, options)

export default Auth
