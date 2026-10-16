/**
 * The settings of the connection pool of the PostgreSQL adapter (ticket 222), read by
 * `src/payload.config.ts` and by the tests: one place, no copy.
 */

/** Connections per process, not the 10 of `pg`: a build and a server run several processes at once. */
export const CONNEXIONS_MAX = 5

/**
 * Longest wait for a free connection, in milliseconds. `pg` waits for ever by default: if every
 * connection is taken and kept (the Payload 3.90.2 bug fixed by patches/payload@3.90.2.patch took
 * a second connection while holding the first), the application would stop answering for good.
 * With a limit, the request that cannot get a connection fails with an error and the pool serves
 * the next ones as soon as a connection is back. Long enough for a busy moment, short enough for
 * a visitor and for the health check to see an error rather than a hang.
 */
export const DELAI_CONNEXION_MS = 5000

export interface ReglagesDuPool {
	connectionString: string
	connectionTimeoutMillis: number
	max: number
}

export function reglagesDuPool(connectionString: string): ReglagesDuPool {
	return { connectionString, connectionTimeoutMillis: DELAI_CONNEXION_MS, max: CONNEXIONS_MAX }
}
