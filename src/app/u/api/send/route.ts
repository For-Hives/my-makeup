import { relaySend } from '@/lib/analytics/relay'
import { umamiFromEnv } from '@/lib/env'

// One measure, relayed to the Umami instance (ticket 111). POST only: a GET answers 405.
export const dynamic = 'force-dynamic'

export function POST(requete: Request): Promise<Response> {
	return relaySend(requete, { umami: umamiFromEnv() })
}
