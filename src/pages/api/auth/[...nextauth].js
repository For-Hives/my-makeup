// import credential provider
import CredentialsProvider from 'next-auth/providers/credentials'
// import facebook provider
import FacebookProvider from 'next-auth/providers/facebook'
// import google provider
import GoogleProvider from 'next-auth/providers/google'
import NextAuth from 'next-auth'

const options = {
	providers: [
		GoogleProvider({
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			clientId: process.env.GOOGLE_CLIENT_ID,
		}),
		FacebookProvider({
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
			clientId: process.env.FACEBOOK_CLIENT_ID,
		}),
		CredentialsProvider({
			/**
			 * if name is set we are in register mode
			 * @param password
			 * @param email
			 * @param name
			 */
			authorize: async ({ password, email, name }) => {
				let callUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/local`
				let body = JSON.stringify({
					password: password,
					identifier: email,
				})
				if (name !== undefined && name !== null && name !== '') {
					callUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/local/register`
					body = JSON.stringify({
						password: password,
						username: name,
						email: email,
					})
				}
				const response = await fetch(callUrl, {
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					method: 'POST',
					body,
				})
				const authenticated = await response.json()

				if (authenticated) {
					return Promise.resolve({
						name: authenticated.user.username,
						email: authenticated.user.email,
						id: authenticated.user.id,
						jwt: authenticated.jwt,
					})
				} else {
					return Promise.resolve(null)
				}
			},
			credentials: {
				email: { placeholder: 'Email', label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
				name: { label: 'Name', type: 'text' },
			},
			name: 'Credentials',
		}),
	],
	callbacks: {
		async jwt({ isNewUser, account, profil, token, user }) {
			const isSignIn = !!user

			if (isSignIn) {
				if (
					typeof account.provider !== 'undefined' &&
					account.type !== 'credentials'
				) {
					const response = await fetch(
						`${process.env.NEXT_PUBLIC_API_URL}/api/auth/${account.provider}/callback?access_token=${account?.access_token}`
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
		async session({ session, token, user }) {
			session.jwt = token.jwt
			session.id = token.id

			return session
		},
	},
	pages: {
		newUser: '/auth/init-account', // New users will be directed here on first sign in (leave the property out if not of interest)
		signOut: '/auth/signout',
		signIn: '/auth/signin',
		error: '/auth/error', // Error code passed in query string as ?error=
	},
	database: `${process.env.NEXT_PUBLIC_DATABASE_URL}`,
	debug: process.env.NODE_ENV !== 'production',
	secret: `${process.env.NEXTAUTH_SECRET}`, //PUT YOUR OWN SECRET (command: openssl rand -base64 32)
	session: {
		strategy: 'jwt',
	},
}

const Auth = (req, res) => NextAuth(req, res, options)

export default Auth
