/**
 * Version of the running build, shown by /api/health. Ported from the live site
 * (src/lib/version.js on main), where the same value also tags every Umami event:
 * a deployment is recognised by the short sha of its commit.
 */

const SHORT_SHA_LENGTH = 7
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i

export interface VersionSources {
	/** NEXT_PUBLIC_APP_VERSION, frozen into the build: a label, or the commit of the build. */
	buildVersion?: string | undefined
	/** SOURCE_COMMIT as Coolify gives it, full or short sha. */
	commit?: string | undefined
	/** The version of package.json. */
	packageVersion?: string | undefined
}

function clean(value: string | undefined): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function shorten(sha: string): string {
	return sha.slice(0, SHORT_SHA_LENGTH).toLowerCase()
}

function shortCommit(value: string | undefined): string | null {
	const commit = clean(value)
	return commit !== null && COMMIT_PATTERN.test(commit) ? shorten(commit) : null
}

/**
 * A label is shown as written. A full 40-character sha is not a label: it is the commit
 * of the build passed through this variable, so it is shortened like SOURCE_COMMIT and the
 * version reads the same whichever variable carries the commit.
 */
function buildLabel(value: string | undefined): string | null {
	const label = clean(value)
	if (label === null) return null
	return FULL_SHA_PATTERN.test(label) ? shorten(label) : label
}

/**
 * NEXT_PUBLIC_APP_VERSION when set, else the short sha of SOURCE_COMMIT, else the version
 * of package.json, else 'unknown'.
 */
export function deployedVersion({ buildVersion, commit, packageVersion }: VersionSources = {}): string {
	return buildLabel(buildVersion) ?? shortCommit(commit) ?? clean(packageVersion) ?? 'unknown'
}
