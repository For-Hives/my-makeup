import config from '@payload-config'
import { getPayload } from 'payload'
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
		// Payload did not start: no secret, or a first connection that failed (Payload logs
		// that one itself). The health log names the step, not the message.
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
		versions: {
			buildVersion: process.env.NEXT_PUBLIC_APP_VERSION,
			// The commit given to the build (next.config.ts); the one of the running container
			// when the build had none.
			commit: process.env.BUILD_SOURCE_COMMIT || process.env.SOURCE_COMMIT,
			packageVersion: packageJson.version,
		},
	})
}
