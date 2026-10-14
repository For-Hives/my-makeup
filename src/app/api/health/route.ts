import config from '@payload-config'
import { getPayload } from 'payload'
import { versionEnv } from '@/lib/env'
import { healthResponse } from '@/lib/health'
import packageJson from '../../../../package.json'

// Never prerendered: the build runs without a database, and each request asks it again.
export const dynamic = 'force-dynamic'

/**
 * One trivial query on the pool of Payload, the one every page uses: the route says
 * « healthy » only when the application itself can reach its database.
 */
async function pingDatabase(): Promise<void> {
	const payload = await getPayload({ config }).catch(() => {
		// Payload did not start: its first connection failed (Payload logs that one itself), or
		// anything else its start runs did. The health log names the step, not the message.
		// A missing or refused variable never comes here: the server stops when it starts
		// (src/instrumentation.ts), so the route does not answer at all.
		throw Object.assign(new Error('Payload did not start'), { code: 'PAYLOAD_INIT' })
	})
	await payload.db.pool.query('SELECT 1')
}

/**
 * Health check of Coolify, of the image and of the uptime monitor, at the path of the live
 * site. This static segment wins over the catch-all REST route of Payload, `/api/[...slug]`.
 * Next answers HEAD from this handler and 405 to the other methods.
 */
export function GET(): Promise<Response> {
	return healthResponse({
		ping: pingDatabase,
		// The label and the commit come from the environment, through the one file that reads it.
		versions: { ...versionEnv(), packageVersion: packageJson.version },
	})
}
