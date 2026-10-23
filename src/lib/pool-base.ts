import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { DatabaseAdapterObj } from 'payload'

/**
 * The settings of the connection pool of the PostgreSQL adapter (ticket 222), read by
 * `src/payload.config.ts` and by the tests: one place, no copy.
 */

/**
 * Connections per process when `DATABASE_POOL_MAX` is not set: the 10 of `pg`. Ticket 222 had set 5, and
 * ticket 268 measured that a server that serves a visitor, a crawler and an admin at once (twenty accounts
 * created while thirty pages are read) held 5 connections at its peak, with no margin left for the day a
 * request waits on a slow query. One production container uses at most 10 of the 100 connections
 * (`max_connections`) a default PostgreSQL grants: the room left is for the import, the administration
 * scripts and a rolling deployment where two containers overlap for a minute. A build opens none.
 */
export const CONNECTIONS_MAX = 10

/** The values `DATABASE_POOL_MAX` may take: at least one connection, and never more than half of the 100 of PostgreSQL. */
export const CONNECTIONS_MAX_RANGE = { min: 1, max: 50 } as const

/**
 * Longest wait for a free connection, in milliseconds. `pg` waits for ever by default: if every
 * connection is taken and kept (the Payload 3.90.2 bug fixed by patches/payload@3.90.2.patch took
 * a second connection while holding the first), the application would stop answering for good.
 * With a limit, the request that cannot get a connection fails with an error and the pool serves
 * the next ones as soon as a connection is back. Long enough for a busy moment, short enough for
 * a visitor and for the health check to see an error rather than a hang.
 */
export const CONNECTION_TIMEOUT_MS = 5000

/** The values `DATABASE_POOL_TIMEOUT_MS` may take, in milliseconds: never 0, which `pg` reads as « wait for ever ». */
export const CONNECTION_TIMEOUT_RANGE = { min: 1000, max: 30_000 } as const

export interface PoolSettings {
	connectionString: string
	connectionTimeoutMillis: number
	max: number
}

/** The size of the pool and its wait limit, as `DATABASE_POOL_MAX` and `DATABASE_POOL_TIMEOUT_MS` give them. */
export interface PoolSize {
	max: number
	timeoutMs: number
}

export const DEFAULT_POOL_SIZE: PoolSize = { max: CONNECTIONS_MAX, timeoutMs: CONNECTION_TIMEOUT_MS }

export function poolSettings(connectionString: string, size: PoolSize = DEFAULT_POOL_SIZE): PoolSettings {
	return { connectionString, connectionTimeoutMillis: size.timeoutMs, max: size.max }
}

/** What the listener needs of a pool: `pg`'s `Pool` is an event emitter. */
export interface ListenablePool {
	on(evenement: 'error', ecouteur: (erreur: Error & { code?: string }) => void): unknown
}

const LISTENED_POOLS = new WeakSet<object>()

/**
 * Listens to the `'error'` event of the pool (ticket 223). A connection that sits idle in a pool and
 * is cut (PostgreSQL stopped, restarted or unreachable) makes the pool emit `'error'`; an emitter
 * with no listener for that event throws, and the process dies with an uncaught exception. With a
 * listener, the connection is dropped by `pg`, the next query opens a new one, and the health check
 * answers 503 during the outage and 200 once the database is back.
 *
 * One short line per lost connection, with the code of the error and never its message: a message
 * such as « connect ECONNREFUSED 10.0.0.5:5432 » carries the address of the database. Once per pool,
 * whatever the number of times Payload starts (hot reload in development).
 */
export function listenToPool(pool: ListenablePool, ligne: (texte: string) => void): void {
	// A pool that cannot be listened to (a stand-in in a test) has no event to fail on.
	if (typeof pool.on !== 'function' || LISTENED_POOLS.has(pool)) return
	LISTENED_POOLS.add(pool)
	pool.on('error', erreur => {
		ligne(
			`Connexion à la base perdue (code ${typeof erreur?.code === 'string' ? erreur.code : 'inconnu'}), elle sera rouverte à la prochaine requête.`
		)
	})
}

/**
 * The database adapter of Payload, listening to the errors of its pool from the moment it connects
 * (`listenToPool`). Everything else is the adapter itself: the same object, only `connect` is wrapped.
 * Done on the adapter and not in `onInit`, which reads nothing of `payload.db` on the site.
 */
export function withPoolListener(adaptateur: DatabaseAdapterObj<PostgresAdapter>): DatabaseAdapterObj<PostgresAdapter> {
	return {
		...adaptateur,
		init: args => {
			const db = adaptateur.init(args)
			const connect = db.connect
			if (!connect) return db
			db.connect = async parametres => {
				try {
					await connect.call(db, parametres)
				} finally {
					// Even when the first connection fails: the pool exists, and its idle connections will be cut too.
					if (db.pool) listenToPool(db.pool, ligne => db.payload.logger.warn(ligne))
				}
			}
			return db
		},
	}
}
