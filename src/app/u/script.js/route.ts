import { relayerLeScript } from '@/lib/analytics/relay'
import { umamiFromEnv } from '@/lib/env'

// The tracker of the Umami instance, served from the site (ticket 111). Never prerendered: the
// instance is read from the environment of the running server.
export const dynamic = 'force-dynamic'

export function GET(requete: Request): Promise<Response> {
	return relayerLeScript(requete, { umami: umamiFromEnv() })
}
