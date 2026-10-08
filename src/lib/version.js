/**
 * Version of the running build, shown by /api/health (URG-09) and sent with
 * every Umami event as its `tag` (MES-10, plans/04 §3.1), so that each event
 * can be tied to a deployment.
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
 * NEXT_PUBLIC_APP_VERSION when set, else the short sha of SOURCE_COMMIT
 * (Coolify), else the version of package.json, else 'unknown'.
 * @param {object} [versions]
 * @param {string} [versions.buildVersion] - NEXT_PUBLIC_APP_VERSION
 * @param {string} [versions.commit] - SOURCE_COMMIT, full or short sha
 * @param {string} [versions.packageVersion] - version from package.json
 * @returns {string}
 */
export function deployedVersion({ buildVersion, commit, packageVersion } = {}) {
	return (
		clean(buildVersion) ??
		shortCommit(commit) ??
		clean(packageVersion) ??
		'unknown'
	)
}
