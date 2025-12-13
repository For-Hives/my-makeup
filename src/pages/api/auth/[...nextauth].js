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
				password: { label: 'Password', type: 'password' },
				name: { label: 'Name', type: 'text' },
			},
			/**
			 * if name is set we are in register mode
			 * @param password
			 * @param email
			 * @param name
			 */
			authorize: async ({ password, email, name }) => {
				let callUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/local`
				let body = JSON.stringify({
					identifier: email,
					password: password,
				})
				if (name !== undefined && name !== null && name !== '') {
					callUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/local/register`
					body = JSON.stringify({
						username: name,
						email: email,
						password: password,
					})
				}
				const response = await fetch(callUrl, {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
					},
					body,
				})
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
		signIn: '/auth/signin',
		signOut: '/auth/signout',
		error: '/auth/error', // Error code passed in query string as ?error=
		newUser: '/auth/init-account', // New users will be directed here on first sign in (leave the property out if not of interest)
	},
	secret: `${process.env.NEXTAUTH_SECRET}`, //PUT YOUR OWN SECRET (command: openssl rand -base64 32)
	database: `${process.env.NEXT_PUBLIC_DATABASE_URL}`,
	session: {
		strategy: 'jwt',
		maxAge: 30 * 24 * 60 * 60, // 30 days - align with Strapi JWT expiration
		updateAge: 24 * 60 * 60, // 24 hours - revalidate session daily
	},
	debug: process.env.NODE_ENV !== 'production',
	callbacks: {
		async session({ session, token, user }) {
			session.jwt = token.jwt
			session.id = token.id
			session.error = token.error // Pass error to client for handling

			return session
		},
		async jwt({ token, user, account, profil, isNewUser }) {
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

			// Validate token on session refresh to detect expired Strapi JWT
			if (token.jwt && !isSignIn) {
				try {
					const response = await fetch(
						`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`,
						{
							headers: {
								Authorization: `Bearer ${token.jwt}`,
							},
						}
					)
					if (!response.ok) {
						// Token is invalid/expired, mark for logout
						return { ...token, jwt: null, id: null, error: 'TokenExpired' }
					}
				} catch (error) {
					// Network error - keep token, don't block user
					console.error('Token validation failed:', error)
				}
			}

			return token
		},
	},
}

const Auth = (req, res) => NextAuth(req, res, options)

export default Auth
