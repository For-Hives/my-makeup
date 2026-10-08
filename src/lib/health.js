/**
 * Body of the front healthcheck (/api/health, URG-09). It never calls the API:
 * an API outage must not mark the front unhealthy.
 */

import { deployedVersion } from './version.js'

/**
 * @param {object} versions
 * @param {string} [versions.buildVersion] - NEXT_PUBLIC_APP_VERSION, set at build
 * @param {string} [versions.commit] - SOURCE_COMMIT (Coolify), full or short sha
 * @param {string} [versions.packageVersion] - version from package.json
 * @returns {{ok: true, version: string}}
 */
export function healthPayload(versions = {}) {
	return { ok: true, version: deployedVersion(versions) }
}
