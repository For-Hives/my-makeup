/**
 * After a publication, waits until the production serves the version it just published (docs/publication.md,
 * « Le déploiement vérifié »):
 *
 *   bun run release:check-deployment   only in .github/workflows/release.yml, job `deployment`
 *
 * Coolify deploys the production when .release/version.json changes on main; GitHub tells it by a webhook that
 * nobody sends again when it is lost, and Coolify keeps the old version when the new one is not healthy. Either
 * way the version is published and the production does not serve it: this check reads the version the
 * production says it runs (`/api/health`, the short sha of the commit it was built from, src/lib/version.ts)
 * until it is the release commit, and is red after twenty minutes. Its red run is what tells the maintainer.
 *
 * It imports nothing but the runtime: no `bun install` runs in that job (tests/ci/publication.test.ts).
 */

import { appendFileSync } from 'node:fs'

/** The health route of the production: `{ ok, version }`. */
export const HEALTH_URL = 'https://my-makeup.fr/api/health'

/** How long a deployment may take, from the push of the version to the production serving it. */
export const DEPLOYMENT_DELAY_MS = 20 * 60_000

/** The pause between two readings. */
export const READING_INTERVAL_MS = 20_000

/** The length of the sha the production reports (SHORT_SHA_LENGTH of src/lib/version.ts). */
const SHORT_SHA_LENGTH = 7

const FULL_SHA = /^[0-9a-f]{40}$/

/** The version a body of the health route reports, or nothing when it reports none. */
export function servedVersion(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) return undefined
	const version = (body as { version?: unknown }).version
	return typeof version === 'string' && version !== '' ? version : undefined
}

/** The version the production reports once it runs the build of `commit`. */
export const expectedVersion = (commit: string): string => commit.slice(0, SHORT_SHA_LENGTH).toLowerCase()

export type Reading = { version?: string; failure?: string }

export type CheckResult =
	| { status: 'served'; version: string; afterMs: number }
	| { status: 'not-served'; lastReading: Reading; afterMs: number }

export type CheckOptions = {
	/** The release commit: the one .release/version.json was published in. */
	commit: string
	/** One reading of the health route. */
	read: () => Promise<Reading>
	sleep: (ms: number) => Promise<void>
	now: () => number
	delayMs?: number
	intervalMs?: number
}

/** Reads the production until it serves the build of `commit`, or the delay is over. */
export async function waitForDeployment({
	commit,
	read,
	sleep,
	now,
	delayMs = DEPLOYMENT_DELAY_MS,
	intervalMs = READING_INTERVAL_MS,
}: CheckOptions): Promise<CheckResult> {
	if (!FULL_SHA.test(commit)) throw new Error(`« ${commit} » n’est pas un commit complet (40 caractères hexadécimaux).`)
	const wanted = expectedVersion(commit)
	const start = now()
	for (;;) {
		const reading = await read()
		const afterMs = now() - start
		if (reading.version === wanted) return { status: 'served', version: wanted, afterMs }
		if (afterMs + intervalMs > delayMs) return { status: 'not-served', lastReading: reading, afterMs }
		await sleep(intervalMs)
	}
}

/** One reading of the health route over the network: the version, or why there is none. */
async function readHealth(): Promise<Reading> {
	try {
		const response = await fetch(HEALTH_URL, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(10_000),
		})
		if (!response.ok) return { failure: `HTTP ${response.status}` }
		const version = servedVersion(await response.json())
		return version === undefined ? { failure: 'aucune version dans la réponse' } : { version }
	} catch (error) {
		return { failure: error instanceof Error ? error.message : String(error) }
	}
}

/** The sentence of the result, for the log and the summary of the run. */
export function describeCheck(result: CheckResult, commit: string): string {
	const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`
	if (result.status === 'served')
		return `La production sert ${result.version}, le commit de la version publiée, après ${minutes(result.afterMs)}.`
	const last = result.lastReading.version
		? `elle sert encore ${result.lastReading.version}`
		: `la dernière lecture a échoué (${result.lastReading.failure ?? 'raison inconnue'})`
	return `Au bout de ${minutes(result.afterMs)}, la production ne sert pas ${expectedVersion(commit)}, le commit de la version publiée : ${last}. Le déploiement de Coolify n’est pas parti, ou la nouvelle version n’était pas saine et l’ancienne est restée (journal du déploiement dans Coolify).`
}

async function main(): Promise<void> {
	const commit = process.env.RELEASE_COMMIT ?? ''
	const result = await waitForDeployment({
		commit,
		read: readHealth,
		sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
		now: () => Date.now(),
	})
	const said = describeCheck(result, commit)
	if (result.status === 'served') console.log(said)
	else {
		console.log(`::error::${said}`)
		process.exitCode = 1
	}
	const summary = process.env.GITHUB_STEP_SUMMARY
	if (summary) appendFileSync(summary, `${said}\n`)
}

if (import.meta.main) {
	try {
		await main()
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}
