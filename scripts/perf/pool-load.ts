/**
 * Load test of the connection pool, on the local test bench only (ticket 268).
 *
 *   bun run perf:pool-load [--requests 30] [--rounds 5] [--writes 0] [--lock]
 *
 * With the application of the bench running (`bun run bench:full`), sends `--requests` simultaneous requests to
 * a profile page, the search and /api/health, `--rounds` times, while it samples `pg_stat_activity` every 20 ms.
 * It prints the status codes, the number of failed requests, and the peak of connections the application held.
 * With `--writes N`, each wave also creates N accounts through the REST API as the admin of the bench (open its
 * session first: `bun run bench:session admin`), the heaviest thing the end-to-end tests do, and removes them after.
 * With `--lock`, an outside session first locks the `profiles` table for `--lock-seconds` (15 by default): every
 * connection of the application that reads it waits on the lock, the pool runs dry, and the requests that cannot get
 * a connection must fail with an answer within the wait limit, never hang; the command then checks that
 * /api/health answers 200 again once the lock is released. This is the « all connections taken » case, without
 * touching the application. The instance comes from BENCH_INSTANCE and BENCH_OFFSET, like the bench: nothing else is reachable.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SQL } from 'bun'
import { benchEnvironment, ROOT, readInstance } from '../../tests/support/bench'
import { benchUrl } from '../../tests/support/e2e'

const PAGES = ['/profil/zoe-lefevre', '/search?search=mariage&city=paris', '/api/health']
/** Past this, a request is a hang, not a slow answer: the wait for a connection is 5 s by default. */
const HANG_MS = 30_000

function option(name: string, byDefault: number): number {
	const at = process.argv.indexOf(`--${name}`)
	const value = at === -1 ? byDefault : Number(process.argv[at + 1])
	if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} attend un entier positif.`)
	return value
}

const environment = benchEnvironment(readInstance(process.env))
const base = benchUrl(environment)
const databaseUri = environment.DATABASE_URI
if (!databaseUri) throw new Error('Le banc n’a pas de DATABASE_URI.')
const monitor = new SQL(databaseUri, { max: 1 })
const locker = new SQL(databaseUri, { max: 1 })

async function sample(): Promise<{ total: number; active: number; waiting: number }> {
	const [row] = await monitor`
		SELECT count(*)::int AS total,
		       count(*) FILTER (WHERE state <> 'idle')::int AS active,
		       count(*) FILTER (WHERE state = 'idle in transaction')::int AS waiting
		FROM pg_stat_activity
		WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'`
	return row
}

interface Outcome {
	path: string
	status: number | 'error'
	ms: number
}

async function hit(path: string): Promise<Outcome> {
	const start = performance.now()
	try {
		const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(HANG_MS) })
		await response.arrayBuffer()
		return { path, status: response.status, ms: performance.now() - start }
	} catch {
		return { path, status: 'error', ms: performance.now() - start }
	}
}

/** The headers of the admin session `bench:session admin` wrote for this instance (never printed). */
function adminHeaders(): Record<string, string> {
	const file = path.join(ROOT, '.banc/sessions', readInstance(process.env).nom, 'admin.entetes')
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch {
		throw new Error('Pas de session admin : lance d’abord « bun run bench:session admin » (même instance).')
	}
	return Object.fromEntries(
		text
			.split('\n')
			.filter(line => line.includes(': '))
			.map(line => [line.slice(0, line.indexOf(': ')), line.slice(line.indexOf(': ') + 2)])
	)
}

const requests = option('requests', 30)
const rounds = option('rounds', 5)
const writes = option('writes', 0)
const created: number[] = []
const headers = writes > 0 ? adminHeaders() : {}
const lock = process.argv.includes('--lock')

const LOCKED_PAGES = ['/api/profiles?limit=1', '/api/profiles?limit=2', '/api/health']
const lockSeconds = option('lock-seconds', 15)
let release: (() => void) | undefined
let lockEnded: Promise<unknown> | undefined
if (lock) {
	const locked = Promise.withResolvers<void>()
	const released = Promise.withResolvers<void>()
	release = () => released.resolve()
	lockEnded = locker.begin(async tx => {
		await tx`LOCK TABLE profiles IN ACCESS EXCLUSIVE MODE`
		locked.resolve()
		await Promise.race([released.promise, Bun.sleep(lockSeconds * 1000)])
	})
	await locked.promise
	console.log(`Table « profiles » verrouillée pour au plus ${lockSeconds} s par une session extérieure.`)
}

let peak = { total: 0, active: 0, waiting: 0 }
let sampling = true
const sampler = (async () => {
	while (sampling) {
		const now = await sample()
		peak = {
			total: Math.max(peak.total, now.total),
			active: Math.max(peak.active, now.active),
			waiting: Math.max(peak.waiting, now.waiting),
		}
		await Bun.sleep(20)
	}
})()

async function createAccount(rank: number): Promise<Outcome> {
	const start = performance.now()
	try {
		const response = await fetch(`${base}/api/pros`, {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: `charge-${Date.now()}-${rank}@example.test`,
				password: `Charge-${crypto.randomUUID()}`,
				name: `Charge ${rank}`,
				_verified: true,
			}),
			signal: AbortSignal.timeout(HANG_MS),
		})
		const body = (await response.json()) as { doc?: { id: number } }
		if (body.doc) created.push(body.doc.id)
		return { path: '/api/pros (POST)', status: response.status, ms: performance.now() - start }
	} catch {
		return { path: '/api/pros (POST)', status: 'error', ms: performance.now() - start }
	}
}

const outcomes: Outcome[] = []
for (let round = 0; round < rounds; round++) {
	const pages = lock ? LOCKED_PAGES : PAGES
	const wave = [
		...Array.from({ length: requests }, (_, i) => hit(pages[i % pages.length] ?? pages[0]!)),
		...Array.from({ length: writes }, (_, i) => createAccount(round * writes + i)),
	]
	outcomes.push(...(await Promise.all(wave)))
}
sampling = false
await sampler
for (const id of created) await fetch(`${base}/api/pros/${id}`, { method: 'DELETE', headers })

const byStatus = new Map<string, { count: number; slowest: number }>()
for (const { path, status, ms } of outcomes) {
	const key = `${path.split('?')[0]} ${status}`
	const seen = byStatus.get(key)
	byStatus.set(key, { count: (seen?.count ?? 0) + 1, slowest: Math.max(seen?.slowest ?? 0, ms) })
}
const slowest = Math.max(...outcomes.map(o => o.ms))
const failed = outcomes.filter(o => typeof o.status !== 'number' || o.status >= 400).length
const hung = outcomes.filter(o => o.status === 'error').length
console.log(`${outcomes.length} requêtes (${requests} à la fois, ${rounds} vagues) sur ${base}`)
for (const [key, { count, slowest: ms }] of [...byStatus].sort())
	console.log(`  ${key} : ${count} (la plus lente ${Math.round(ms)} ms)`)
console.log(`Requêtes en échec : ${failed}, sans réponse : ${hung}. La plus lente : ${Math.round(slowest)} ms.`)
console.log(
	`Pic de connexions à la base : ${peak.total} (actives ${peak.active}, en transaction ouverte ${peak.waiting}).`
)

let code = failed === 0 ? 0 : 1
if (lock) {
	release?.()
	await lockEnded
	// Failing is the point of this run; hanging, or staying down after the lock, is the failure.
	const after = await hit('/api/health')
	console.log(`Verrou levé : /api/health répond ${after.status} en ${Math.round(after.ms)} ms.`)
	code = hung === 0 && after.status === 200 ? 0 : 1
}
await locker.close()
await monitor.close()
process.exit(code)
