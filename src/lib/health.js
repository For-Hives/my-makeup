/**
 * Body of the front healthcheck (/api/health, URG-09). It never calls the API:
 * an API outage must not mark the front unhealthy.
 */

const clean = value =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const shortCommit = value => {
	const commit = clean(value)
	return commit !== null && /^[0-9a-f]{7,40}$/i.test(commit)
		? commit.slice(0, 7).toLowerCase()
		: null
}

/**
 * @param {object} versions
 * @param {string} [versions.buildVersion] - NEXT_PUBLIC_APP_VERSION, set at build
 * @param {string} [versions.commit] - SOURCE_COMMIT (Coolify), full or short sha
 * @param {string} [versions.packageVersion] - version from package.json
 * @returns {{ok: true, version: string}}
 */
export function healthPayload({ buildVersion, commit, packageVersion } = {}) {
	return {
		ok: true,
		version:
			clean(buildVersion) ??
			shortCommit(commit) ??
			clean(packageVersion) ??
			'unknown',
	}
}
