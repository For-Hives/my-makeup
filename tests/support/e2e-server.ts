/**
 * The global setup of Playwright: what must hold before the first end-to-end test.
 *
 * 1. The target is checked once more: never production, only this machine.
 * 2. The application answers at that address as a healthy one. Otherwise every test would fail
 *    on a timeout, one after the other, without saying why.
 * 3. On the bench, the application has just built every table by its versioned migrations, on
 *    the database `bun run test:e2e` erased, as the production build does. The Payload of the tests
 *    reads that database without changing its schema (tests/support/payload-test.ts), and refuses
 *    to run the tests when it carries the mark of a schema push, or when the migrations did not
 *    build it as the collections of the code describe it: a missing migration stops the run
 *    here, with what to do, instead of failing in production (ticket 049).
 */

import { RefusedBench } from './bench'
import { applicationSilentMessage, HEALTH_PATH, testTarget, withoutBenchMessage } from './e2e'

const HEALTH_DELAY_MS = 5000

interface Health {
	saine: boolean
	/** A few words for the message: never the body of the answer. */
	constat: string
	version?: string
}

/** What the health route says, or why nothing was read. */
export async function readHealth(adresse: string, demander: typeof fetch = fetch): Promise<Health> {
	let response: Response
	try {
		response = await demander(`${adresse}${HEALTH_PATH}`, { signal: AbortSignal.timeout(HEALTH_DELAY_MS) })
	} catch {
		return { saine: false, constat: 'aucune réponse' }
	}
	const corps: unknown = await response.json().catch(() => undefined)
	const wasRead = typeof corps === 'object' && corps !== null ? (corps as { ok?: unknown; version?: unknown }) : {}
	const healthy = response.status === 200 && wasRead.ok === true
	return {
		saine: healthy,
		constat: healthy ? 'saine' : `réponse ${response.status}`,
		version: typeof wasRead.version === 'string' ? wasRead.version : undefined,
	}
}

/** Longest wait for the Payload of the tests to attach to the bench and check its schema: a second or two when the schema is in order. */
export const CONNECTION_DELAY_MS = 30_000

export const SCHEMA_IN_MISMATCH_MESSAGE = [
	'Le contrôle du schéma attend une réponse sur la base du banc : les migrations versionnées et les collections du code ne s’accordent plus (une table ou une colonne renommée, ou retirée du code).',
	'Mets les migrations à jour (bun run payload:migrate:create), puis relance. Aucun essai n’a tourné.',
].join('\n')

/**
 * Runs `action` with the two ways Payload and drizzle-kit have of waiting for an answer turned
 * into an error: a backstop, since the check of the schema finds a renamed name before it asks
 * anything (tests/support/bench-schema.ts).
 *
 * When drizzle-kit meets a question (a column renamed in the code and not in the migrations), it
 * asks it on the terminal and waits, for ever in a run nobody watches. When Payload meets a
 * question nobody can answer, it ends the process with the code of a success: a run that passes
 * without a single test.
 */
export async function withoutQuestion<Resultat>(
	action: () => Promise<Resultat>,
	delaiMs: number = CONNECTION_DELAY_MS
): Promise<Resultat> {
	const exit = process.exit
	let timer: ReturnType<typeof setTimeout> | undefined
	process.exit = (() => {
		throw new RefusedBench(SCHEMA_IN_MISMATCH_MESSAGE)
	}) as typeof process.exit
	try {
		const delay = new Promise<never>((_resultat, refuser) => {
			timer = setTimeout(() => refuser(new RefusedBench(SCHEMA_IN_MISMATCH_MESSAGE)), delaiMs)
		})
		return await Promise.race([action(), delay])
	} finally {
		clearTimeout(timer)
		process.exit = exit
	}
}

export default async function beforeFirstTest(): Promise<void> {
	const { adresse: url, environnement: environment } = testTarget()

	const health = await readHealth(url)
	if (!health.saine) throw new RefusedBench(applicationSilentMessage(url, health.constat))

	if (environment === 'test') {
		// A local application without the environment of the bench: no test could get an account.
		if (!process.env.DATABASE_URI) throw new RefusedBench(withoutBenchMessage())
		await withoutQuestion(async () => {
			// Loaded here and not at the top: a run against an application that is not the bench has no Payload to load.
			const [{ testPayload }, { requireMigrationsSchema }] = await Promise.all([
				import('./payload-test'),
				import('./bench-schema'),
			])
			const payload = await testPayload()
			try {
				await requireMigrationsSchema(payload, 'essai')
			} finally {
				await payload.destroy()
			}
		})
	}

	console.log(
		`Essais de bout en bout : ${url}, version ${health.version ?? 'inconnue'}, environnement « ${environment} ».`
	)
}
