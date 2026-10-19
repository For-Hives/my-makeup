import { serverEnv } from '../../env'
import type { ConfigGoogle } from './oidc'

/** Where the button leads: it builds the request and sends the browser to Google. */
export const GOOGLE_START_PATH = '/auth/google'

/** Where Google sends the browser back. This address is the one registered in the Google console. */
export const GOOGLE_CALLBACK_PATH = '/auth/google/callback'

/** The sealed cookie that holds the secrets of the request between the departure and the return. */
export const GOOGLE_COOKIE = 'google-oidc'

/** How long it lives, in seconds: the time to choose an account at Google. */
export const GOOGLE_COOKIE_LIFE_S = 10 * 60

/** The site's own address: the one every link and redirect address is built on, never a header. */
export const dashboardSite = (): string => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * The Google client of this server, or nothing when the site has none (`GOOGLE_CLIENT_ID` and
 * `GOOGLE_CLIENT_SECRET` not set): then there is no button, and the routes send the visitor back to
 * the sign-in form.
 */
export function configGoogle(): ConfigGoogle | undefined {
	const env = serverEnv()
	if (!env.google) return undefined
	return {
		emetteur: env.googleIssuer,
		clientId: env.google.clientId,
		clientSecret: env.google.clientSecret,
		redirectUri: `${dashboardSite()}${GOOGLE_CALLBACK_PATH}`,
	}
}

/** True when the sign-in page may show the Google button. Never throws: a page must render without it. */
export function isGoogleActive(): boolean {
	try {
		return configGoogle() !== undefined
	} catch {
		return false
	}
}
