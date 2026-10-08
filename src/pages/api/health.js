import { healthPayload } from '@/lib/health'
import packageJson from '../../../package.json'

/**
 * Healthcheck for Coolify and Uptime Kuma (URG-09): static, it never calls the
 * Strapi API, so an API outage does not mark the front unhealthy.
 */
export default function handler(req, res) {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.setHeader('Allow', 'GET, HEAD')
		return res.status(405).json({ ok: false })
	}

	res.setHeader('Cache-Control', 'no-store')
	return res.status(200).json(
		healthPayload({
			buildVersion: process.env.NEXT_PUBLIC_APP_VERSION,
			// the commit given to the build, like the Umami data-tag
			// (_document); the runtime one when the build had none
			commit: process.env.BUILD_SOURCE_COMMIT || process.env.SOURCE_COMMIT,
			packageVersion: packageJson.version,
		})
	)
}
