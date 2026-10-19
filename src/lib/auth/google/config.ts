import { serverEnv } from '../../env'
import type { ConfigGoogle } from './oidc'

/** Where the button leads: it builds the request and sends the browser to Google. */
export const CHEMIN_DU_DEPART_GOOGLE = '/auth/google'

/** Where Google sends the browser back. This address is the one registered in the Google console. */
export const CHEMIN_DU_RETOUR_GOOGLE = '/auth/google/callback'

/** The sealed cookie that holds the secrets of the request between the departure and the return. */
export const COOKIE_DE_GOOGLE = 'google-oidc'

/** How long it lives, in seconds: the time to choose an account at Google. */
export const VIE_DU_COOKIE_DE_GOOGLE_S = 10 * 60

/** The site's own address: the one every link and redirect address is built on, never a header. */
export const siteDeLEspace = (): string => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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
		redirectUri: `${siteDeLEspace()}${CHEMIN_DU_RETOUR_GOOGLE}`,
	}
}

/** True when the sign-in page may show the Google button. Never throws: a page must render without it. */
export function googleEstActif(): boolean {
	try {
		return configGoogle() !== undefined
	} catch {
		return false
	}
}
