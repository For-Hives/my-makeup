import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { expirationJwt } from '@/lib/auth-erreurs'
import {
	authentifierStrapi,
	connexionStrapiOAuth,
	statutCompteStrapi,
} from '@/lib/auth-strapi'
import {
	causeErreur,
	delaiRevalidation,
	etatJeton,
	expirationSession,
	ligneLogAuth,
	secretNextAuth,
	suiteVerification,
	urlApiServeur,
} from '@/lib/auth-session'

// Server-side calls go to API_INTERNAL_URL (Docker network) when it is set
export const API_SERVEUR = urlApiServeur({
	interne: process.env.API_INTERNAL_URL,
	publique: process.env.NEXT_PUBLIC_API_URL,
})
const REVALIDATION_MS = delaiRevalidation(process.env.AUTH_REVALIDATION_MS)

/** `[auth] evt=… code=… ms=…` on stdout: never an email, a name or a token */
export const journalAuth = (evt, details) =>
	console.info(ligneLogAuth(evt, details))

const codeDe = erreur =>
	erreur?.name === 'ErreurAuth' ? erreur.code : 'erreur-inconnue'

export const authOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		}),
		CredentialsProvider({
			name: 'Credentials',
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Mot de passe', type: 'password' },
				name: { label: 'Nom', type: 'text' },
			},
			/**
			 * Sign-in, or sign-up when `name` is set. A failure throws an error
			 * whose message is a stable code: NextAuth hands it to the form as
			 * `error` (signIn with redirect: false).
			 */
			authorize: async credentials => {
				const debut = Date.now()
				const evt = credentials?.name?.trim() ? 'inscription' : 'connexion'
				try {
					const user = await authentifierStrapi({
						api: API_SERVEUR,
						email: credentials?.email,
						password: credentials?.password,
						name: credentials?.name,
					})
					journalAuth(evt, { code: 'ok', ms: Date.now() - debut })
					return user
				} catch (erreur) {
					const code = codeDe(erreur)
					journalAuth(evt, { code, ms: Date.now() - debut })
					throw new Error(code)
				}
			},
		}),
	],
	// No signOut page (it did not exist: 404) nor newUser (only used with a
	// database adapter): NextAuth serves its own sign-out confirmation.
	pages: {
		signIn: '/auth/signin',
		error: '/auth/error', // ?error=<code>
	},
	secret: secretNextAuth({
		secret: process.env.NEXTAUTH_SECRET,
		nodeEnv: process.env.NODE_ENV,
		phase: process.env.NEXT_PHASE,
	}),
	session: {
		strategy: 'jwt',
		maxAge: 30 * 24 * 60 * 60, // bounded per session by the Strapi JWT
	},
	// NextAuth's own messages, reduced to codes: its debug and error metadata
	// can hold profiles and tokens
	logger: {
		error: (code, metadata) =>
			console.error(
				ligneLogAuth('nextauth', {
					code: String(code).toLowerCase(),
					cause: causeErreur(metadata),
				})
			),
		warn: code =>
			console.warn(
				ligneLogAuth('nextauth', { code: String(code).toLowerCase() })
			),
		debug: () => {},
	},
	callbacks: {
		/**
		 * Google: the access token is exchanged for a Strapi JWT here, so a
		 * refusal (email already used with a password, Strapi down) ends on
		 * /auth/error with a code instead of a TypeError.
		 */
		async signIn({ user, account }) {
			if (account?.provider !== 'google') return true
			const debut = Date.now()
			try {
				const { id, jwt } = await connexionStrapiOAuth({
					api: API_SERVEUR,
					provider: 'google',
					accessToken: account.access_token,
				})
				user.id = id
				user.jwt = jwt
				journalAuth('connexion_google', { code: 'ok', ms: Date.now() - debut })
				return true
			} catch (erreur) {
				const code = codeDe(erreur)
				journalAuth('connexion_google', { code, ms: Date.now() - debut })
				throw new Error(code) // → /auth/error?error=<code>
			}
		},
		/**
		 * Throwing here is a JWT_SESSION_ERROR: NextAuth then deletes the
		 * session cookies (chunks included) and the visitor is signed out
		 * for real, instead of the old « zombie » session without JWT.
		 */
		async jwt({ token, user }) {
			if (user)
				return {
					...token,
					id: user.id,
					jwt: user.jwt,
					strapiExp: expirationJwt(user.jwt),
					verifieA: Date.now(),
				}

			const etat = etatJeton(token, Date.now(), REVALIDATION_MS)
			if (etat === 'sans-jwt' || etat === 'expire') {
				const code = etat === 'expire' ? 'jwt_expire' : 'sans_jwt'
				journalAuth('session_expiree', { code })
				throw new Error(code)
			}
			if (etat === 'frais') return token

			const debut = Date.now()
			const status = await statutCompteStrapi({
				api: API_SERVEUR,
				jwt: token.jwt,
			})
			const suite = suiteVerification(status)
			journalAuth('revalidation', {
				code: suite === 'inchangee' ? `statut-${status}` : suite,
				ms: Date.now() - debut,
			})
			if (suite === 'refusee') {
				journalAuth('session_expiree', { code: 'api_401' })
				throw new Error('api_401')
			}
			// 5xx, 429, network: the session stays, checked again next read
			return suite === 'valide' ? { ...token, verifieA: Date.now() } : token
		},
		async session({ session, token }) {
			session.id = token.id
			// Read by the profile modals, which call Strapi from the browser:
			// residual risk accepted until the v3 (plans/01 §2.2).
			session.jwt = token.jwt
			session.expires = expirationSession(session.expires, token.strapiExp)
			return session
		},
	},
}

const Auth = (req, res) => NextAuth(req, res, authOptions)

export default Auth
