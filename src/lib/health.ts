/**
 * The health check behind /api/health: 200 with the deployed version when the database
 * answers, 503 otherwise. Coolify, the HEALTHCHECK of the image and the uptime monitor
 * read the status; the production checks of the owner read `version`.
 *
 * The database is reached through a `ping` given by the caller, so both cases are tested
 * without a database (tests/unit/health.test.ts).
 */

import { deployedVersion, type VersionSources } from './version'

/**
 * Longest wait for the database before the route answers 503. Well under 3 seconds: an
 * unreachable host must not hold the request until the TCP timeout of the system.
 */
export const HEALTH_DATABASE_TIMEOUT_MS = 2000

/** Never cached, never indexed, whatever the status. */
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } as const

/** Error codes of Node (ECONNREFUSED) and of PostgreSQL (57P01): short and without data. */
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_]{1,32}$/

export interface HealthyBody {
	ok: true
	version: string
}

export interface HealthCheck {
	/** Resolves when the database answered, rejects (or never settles) when it did not. */
	ping: () => Promise<unknown>
	versions?: VersionSources
	timeoutMs?: number
	/** Receives one line per failed check, for the server logs only. */
	log?: (line: string) => void
}

/** Same keys as on the live site: `ok` and `version`. */
export function healthPayload(versions: VersionSources = {}): HealthyBody {
	return { ok: true, version: deployedVersion(versions) }
}

/**
 * Why the check failed, for the logs: an error code or 'error', never the message, which
 * can carry a host, a port or a user name.
 */
function failureReason(error: unknown): string {
	const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
	return typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : 'error'
}

/** `null` when the database answered in time, else the reason for the logs. */
async function databaseFailure(ping: () => Promise<unknown>, timeoutMs: number): Promise<string | null> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<string>(resolve => {
		timer = setTimeout(() => resolve('timeout'), timeoutMs)
	})
	// Every failure ends here, a synchronous throw included. The attempt goes on after the
	// deadline: a rejection that comes late is already handled and cannot stop the process.
	const attempt = Promise.resolve()
		.then(ping)
		.then(() => null, failureReason)
	try {
		return await Promise.race([attempt, deadline])
	} finally {
		clearTimeout(timer)
	}
}

/**
 * 200 `{ ok: true, version }` when the database answered, 503 `{ ok: false }` when it did
 * not: the body of a failure says nothing about the cause.
 */
export async function healthResponse({
	ping,
	versions,
	timeoutMs = HEALTH_DATABASE_TIMEOUT_MS,
	log = console.error,
}: HealthCheck): Promise<Response> {
	const failure = await databaseFailure(ping, timeoutMs)
	if (failure === null) return Response.json(healthPayload(versions), { status: 200, headers: HEADERS })
	log(`[health] check failed: ${failure}`)
	return Response.json({ ok: false }, { status: 503, headers: HEADERS })
}
